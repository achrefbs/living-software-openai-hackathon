import { analyzeEvidenceRecords } from "./analyzer.js";
import { AppendOnlyEvidenceStore, EvidenceConflictError, EvidenceIntegrityError, } from "./store.js";
import { CollectorValidationError, resolveCollectorDefinition, validateBatchForCollector, } from "./validation.js";
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;
/**
 * Next can reconstruct Request.url with `localhost` even when the browser
 * reached the dev server through `127.0.0.1`. The Host header preserves the
 * browser-visible authority, so accept either representation while still
 * requiring an exact browser Origin and protocol match.
 */
function hasSameOrigin(request) {
    const declaredOrigin = request.headers.get("origin");
    if (declaredOrigin === null)
        return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite !== null && fetchSite !== "same-origin")
        return false;
    try {
        const origin = new URL(declaredOrigin);
        if (declaredOrigin !== origin.origin)
            return false;
        const requestUrl = new URL(request.url);
        if (origin.origin === requestUrl.origin)
            return true;
        const host = request.headers.get("host");
        if (host === null)
            return false;
        const forwardedProtocol = request.headers
            .get("x-forwarded-proto")
            ?.split(",", 1)[0]
            ?.trim()
            .toLowerCase();
        const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
            ? `${forwardedProtocol}:`
            : requestUrl.protocol;
        return origin.origin === new URL(`${protocol}//${host}`).origin;
    }
    catch {
        return false;
    }
}
function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
        },
    });
}
export function createEvidenceCollector(options) {
    const resolved = resolveCollectorDefinition(options.definition);
    const store = new AppendOnlyEvidenceStore({
        rootPath: options.rootPath,
        definition: resolved.definition,
    });
    const clock = options.clock ?? (() => new Date());
    const rate = { startedAt: 0, requests: 0, events: 0 };
    const refreshRateWindow = (now) => {
        if (rate.startedAt === 0 || now - rate.startedAt >= 60_000 || now < rate.startedAt) {
            rate.startedAt = now;
            rate.requests = 0;
            rate.events = 0;
        }
    };
    const handle = async (request) => {
        try {
            if (request.method !== "POST") {
                return jsonResponse(405, { error: "METHOD_NOT_ALLOWED" });
            }
            if (!hasSameOrigin(request)) {
                return jsonResponse(403, { error: "ORIGIN_REJECTED" });
            }
            const contentType = request.headers.get("content-type") ?? "";
            if (!JSON_CONTENT_TYPE.test(contentType)) {
                return jsonResponse(415, { error: "CONTENT_TYPE_REJECTED" });
            }
            const now = clock();
            if (!Number.isFinite(now.getTime())) {
                throw new Error("Collector clock returned an invalid date");
            }
            refreshRateWindow(now.getTime());
            rate.requests += 1;
            if (rate.requests > resolved.limits.maxRequestsPerMinute) {
                return jsonResponse(429, { error: "REQUEST_RATE_LIMIT" });
            }
            const declaredLength = request.headers.get("content-length");
            if (declaredLength !== null) {
                if (!/^\d+$/.test(declaredLength)) {
                    return jsonResponse(400, { error: "CONTENT_LENGTH_INVALID" });
                }
                if (Number(declaredLength) > resolved.limits.maxPayloadBytes) {
                    return jsonResponse(413, { error: "PAYLOAD_TOO_LARGE" });
                }
            }
            const body = await request.text();
            if (new TextEncoder().encode(body).byteLength > resolved.limits.maxPayloadBytes) {
                return jsonResponse(413, { error: "PAYLOAD_TOO_LARGE" });
            }
            let candidate;
            try {
                candidate = JSON.parse(body);
            }
            catch {
                return jsonResponse(400, { error: "JSON_INVALID" });
            }
            const validated = validateBatchForCollector(candidate, resolved.definition, resolved.bindings, resolved.limits.maxEventsPerBatch);
            if (rate.events + validated.batch.events.length > resolved.limits.maxEventsPerMinute) {
                return jsonResponse(429, { error: "EVENT_RATE_LIMIT" });
            }
            rate.events += validated.batch.events.length;
            const appended = await store.append(validated.batch, now.toISOString());
            return jsonResponse(appended.duplicate ? 200 : 202, {
                accepted: appended.accepted,
                duplicate: appended.duplicate,
                transportId: appended.record.recordHash,
                recordHash: appended.record.recordHash,
            });
        }
        catch (error) {
            if (error instanceof CollectorValidationError) {
                return jsonResponse(error.status, { error: error.code });
            }
            if (error instanceof EvidenceConflictError) {
                return jsonResponse(409, { error: error.code });
            }
            if (error instanceof EvidenceIntegrityError) {
                return jsonResponse(500, { error: "EVIDENCE_INTEGRITY" });
            }
            return jsonResponse(500, { error: "COLLECTOR_FAILURE" });
        }
    };
    return Object.freeze({
        evidencePath: store.evidencePath,
        handle,
        readVerified: () => store.readVerified(),
        analyze: async () => analyzeEvidenceRecords(await store.readVerified(), resolved.definition),
    });
}
