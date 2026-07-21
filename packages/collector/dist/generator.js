import { resolveCollectorDefinition } from "./validation.js";
const ROUTE_SOURCE = `export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { POST } from "../../../../living-collector.generated";
`;
/**
 * Dependency-free server code copied into a supported Next.js host. It owns
 * only POST ingestion; no GET/export endpoint exists in the host application.
 */
const GENERATED_SERVER_RUNTIME = String.raw `
import { appendFile, lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hashPattern = /^sha256:[a-f0-9]{64}$/;
if (!hashPattern.test(DEFINITION.application.manifestHash)) throw new Error("MANIFEST_HASH_INVALID");
const hostRoot = path.resolve(process.cwd());
const livingPath = path.join(hostRoot, ".living");
const dataPath = path.join(livingPath, "data");
const releasesPath = path.join(dataPath, "releases");
const releasePath = path.join(releasesPath, DEFINITION.application.manifestHash.slice(7));
const evidencePath = path.join(releasePath, "events.ndjson");
const bindingByName = new Map(DEFINITION.eventBindings.map((item) => [item.eventName, item]));
let serializedWrite = Promise.resolve();
const rate = { startedAt: 0, requests: 0, events: 0 };
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const eventName = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/;
const jsonContentType = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;

const sameOrigin = (request) => {
  const declaredOrigin = request.headers.get("origin");
  if (!declaredOrigin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  try {
    const origin = new URL(declaredOrigin);
    if (declaredOrigin !== origin.origin) return false;
    const requestUrl = new URL(request.url);
    if (origin.origin === requestUrl.origin) return true;
    const host = request.headers.get("host");
    if (!host) return false;
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase();
    const protocol = forwardedProtocol === "http" || forwardedProtocol === "https" ? forwardedProtocol + ":" : requestUrl.protocol;
    return origin.origin === new URL(protocol + "//" + host).origin;
  } catch {
    return false;
  }
};

const failure = (status, code) => {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  throw error;
};
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value, required, optional = []) => {
  if (!isRecord(value)) failure(422, "SCHEMA_INVALID");
  const allowed = new Set(required.concat(optional));
  for (const key of Object.keys(value)) if (!allowed.has(key)) failure(422, "FIELD_REJECTED");
  for (const key of required) if (!(key in value)) failure(422, "FIELD_REQUIRED");
};
const finite = (value, minimum, maximum) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    failure(422, "VALUE_REJECTED");
  }
};
const enumValue = (value, allowed) => {
  if (typeof value !== "string" || !allowed.includes(value)) failure(422, "VALUE_REJECTED");
};
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
};
const canonicalJson = (value) => JSON.stringify(canonical(value));
const sha256 = (value) => "sha256:" + createHash("sha256").update(canonicalJson(value)).digest("hex");

const geometry = (metadata) => {
  exact(metadata, ["targetGeometry", "viewport", "visibility", "position", "state"]);
  exact(metadata.targetGeometry, ["x", "y", "width", "height"]);
  finite(metadata.targetGeometry.x, -100000, 100000);
  finite(metadata.targetGeometry.y, -100000, 100000);
  finite(metadata.targetGeometry.width, 0, 100000);
  finite(metadata.targetGeometry.height, 0, 100000);
  exact(metadata.viewport, ["width", "height", "scrollX", "scrollY", "pixelRatio"]);
  finite(metadata.viewport.width, 0, 100000);
  finite(metadata.viewport.height, 0, 100000);
  finite(metadata.viewport.scrollX, -10000000, 10000000);
  finite(metadata.viewport.scrollY, -10000000, 10000000);
  finite(metadata.viewport.pixelRatio, 0.25, 8);
  exact(metadata.visibility, ["ratio", "inViewport"]);
  finite(metadata.visibility.ratio, 0, 1);
  if (typeof metadata.visibility.inViewport !== "boolean") failure(422, "VALUE_REJECTED");
  exact(metadata.position, ["layout", "documentX", "documentY"]);
  enumValue(metadata.position.layout, ["flow", "fixed", "sticky"]);
  finite(metadata.position.documentX, -10000000, 10000000);
  finite(metadata.position.documentY, -10000000, 10000000);
  exact(metadata.state, ["disabled"]);
  if (typeof metadata.state.disabled !== "boolean") failure(422, "VALUE_REJECTED");
};

const validateMetadata = (metadata) => {
  if (!isRecord(metadata)) failure(422, "METADATA_REJECTED");
  if ("interaction" in metadata) {
    exact(metadata, ["interaction", "targetGeometry", "viewport", "visibility", "position", "state"]);
    enumValue(metadata.interaction, ["click", "change", "submit"]);
    const copy = { ...metadata };
    delete copy.interaction;
    geometry(copy);
    return;
  }
  if ("signal" in metadata) {
    exact(metadata, ["signal", "targetGeometry", "viewport", "visibility", "position", "state"]);
    enumValue(metadata.signal, ["dead-click", "rage-click", "correction"]);
    const copy = { ...metadata };
    delete copy.signal;
    geometry(copy);
    return;
  }
  if ("routePhase" in metadata) {
    exact(metadata, ["routePhase"]);
    enumValue(metadata.routePhase, ["start", "complete"]);
    return;
  }
  if ("metric" in metadata) {
    exact(metadata, ["metric", "value", "unit"]);
    enumValue(metadata.metric, ["lcp", "inp", "cls"]);
    enumValue(metadata.unit, metadata.metric === "cls" ? ["score"] : ["millisecond"]);
    finite(metadata.value, 0, metadata.metric === "cls" ? 1000 : 3600000);
    return;
  }
  if ("lifecycle" in metadata) {
    exact(metadata, ["lifecycle"]);
    enumValue(metadata.lifecycle, ["pagehide"]);
    return;
  }
  if ("errorCategory" in metadata) {
    exact(metadata, ["errorCategory", "sanitized"]);
    enumValue(metadata.errorCategory, ["script-runtime", "promise-rejection"]);
    if (metadata.sanitized !== true) failure(422, "METADATA_REJECTED");
    return;
  }
  failure(422, "METADATA_REJECTED");
};

const validateEvent = (event) => {
  exact(event, ["schemaVersion", "eventId", "appId", "environment", "releaseRevision", "occurredAt", "sequence", "name", "kind", "status", "sessionId", "product", "metadata", "provenance"], ["durationMs"]);
  if (event.schemaVersion !== "living.workflow-event/v1") failure(422, "EVENT_SCHEMA");
  if (!identifier.test(event.eventId) || !identifier.test(event.sessionId)) failure(422, "IDENTIFIER_REJECTED");
  if (event.appId !== DEFINITION.application.appId) failure(422, "APP_MISMATCH");
  if (event.environment !== DEFINITION.application.environment) failure(422, "ENVIRONMENT_MISMATCH");
  if (event.releaseRevision !== DEFINITION.application.releaseRevision) failure(422, "RELEASE_MISMATCH");
  if (typeof event.occurredAt !== "string" || !Number.isFinite(Date.parse(event.occurredAt))) failure(422, "TIME_REJECTED");
  if (!Number.isInteger(event.sequence) || event.sequence < 0) failure(422, "SEQUENCE_REJECTED");
  if (!eventName.test(event.name) || event.name.length > 160) failure(422, "EVENT_NAME_REJECTED");
  enumValue(event.kind, ["navigation", "action", "outcome", "error", "system"]);
  enumValue(event.status, ["started", "succeeded", "failed", "abandoned"]);
  if (event.durationMs !== undefined && (!Number.isInteger(event.durationMs) || event.durationMs < 0 || event.durationMs > 86400000)) failure(422, "DURATION_REJECTED");
  exact(event.product, ["manifestHash", "nodeId"], ["surfaceId"]);
  if (!hashPattern.test(event.product.manifestHash) || !identifier.test(event.product.nodeId)) failure(422, "PRODUCT_REJECTED");
  if (event.product.surfaceId !== undefined && !identifier.test(event.product.surfaceId)) failure(422, "PRODUCT_REJECTED");
  exact(event.provenance, ["source", "synthetic"]);
  if (event.provenance.source !== "technical-telemetry" || event.provenance.synthetic !== DEFINITION.application.synthetic) failure(422, "PROVENANCE_REJECTED");
  const binding = bindingByName.get(event.name);
  if (!binding) failure(422, "EVENT_UNDECLARED");
  if (event.kind !== binding.kind || event.product.manifestHash !== DEFINITION.application.manifestHash || event.product.nodeId !== binding.nodeId || event.product.surfaceId !== binding.surfaceId) failure(422, "EVENT_BINDING_MISMATCH");
  validateMetadata(event.metadata);
};

const validateBatch = (batch) => {
  exact(batch, ["schemaVersion", "sequence", "events"]);
  if (batch.schemaVersion !== "living.event-batch/v1" || !Number.isInteger(batch.sequence) || batch.sequence < 0) failure(422, "BATCH_SCHEMA");
  if (!Array.isArray(batch.events) || batch.events.length < 1 || batch.events.length > DEFINITION.limits.maxEventsPerBatch) failure(422, "BATCH_LIMIT");
  const ids = new Set();
  const session = batch.events[0] && batch.events[0].sessionId;
  let previousSequence = -1;
  let previousTime = -Infinity;
  for (const event of batch.events) {
    validateEvent(event);
    if (ids.has(event.eventId)) failure(422, "EVENT_ID_DUPLICATE");
    ids.add(event.eventId);
    if (event.sessionId !== session) failure(422, "MIXED_SESSION");
    if (event.sequence <= previousSequence || Date.parse(event.occurredAt) < previousTime) failure(422, "EVENT_ORDER");
    previousSequence = event.sequence;
    previousTime = Date.parse(event.occurredAt);
  }
  return session;
};

const pathExists = async (pathname) => {
  try { await lstat(pathname); return true; } catch (error) { if (error && error.code === "ENOENT") return false; throw error; }
};
const notSymlink = async (pathname) => {
  if (!(await pathExists(pathname))) return;
  if ((await lstat(pathname)).isSymbolicLink()) failure(500, "EVIDENCE_PATH_UNSAFE");
};
const ensureDirectory = async (pathname) => {
  await notSymlink(pathname);
  try { await mkdir(pathname, { recursive: false }); } catch (error) { if (!error || error.code !== "EEXIST") throw error; }
  const stat = await lstat(pathname);
  if (stat.isSymbolicLink() || !stat.isDirectory()) failure(500, "EVIDENCE_PATH_UNSAFE");
};
const prepare = async () => {
  if (path.resolve(await realpath(hostRoot)) !== hostRoot) failure(500, "ROOT_PATH_UNSAFE");
  await ensureDirectory(livingPath);
  await ensureDirectory(dataPath);
  await ensureDirectory(releasesPath);
  await ensureDirectory(releasePath);
  await notSymlink(evidencePath);
  if (await pathExists(evidencePath)) {
    const stat = await lstat(evidencePath);
    if (stat.isSymbolicLink() || !stat.isFile()) failure(500, "EVIDENCE_PATH_UNSAFE");
  }
};

const readRecords = async () => {
  let source = "";
  try { source = await readFile(evidencePath, "utf8"); } catch (error) { if (!error || error.code !== "ENOENT") throw error; }
  if (source === "") return [];
  const lines = source.endsWith("\n") ? source.slice(0, -1).split("\n") : source.split("\n");
  if (lines.some((line) => line.trim() === "")) failure(500, "EVIDENCE_CHAIN_INVALID");
  const records = lines.map((line) => { try { return JSON.parse(line); } catch { failure(500, "EVIDENCE_CHAIN_INVALID"); } });
  let previousHash = null;
  let previousAcceptedAt = -Infinity;
  const eventIds = new Set();
  const sessions = new Map();
  const batchHashes = new Set();
  for (const record of records) {
    exact(record, ["schemaVersion", "acceptedAt", "previousRecordHash", "batchHash", "recordHash", "batch"]);
    if (record.schemaVersion !== "living.evidence-batch/v1" || record.previousRecordHash !== previousHash || !hashPattern.test(record.batchHash) || !hashPattern.test(record.recordHash)) failure(500, "EVIDENCE_CHAIN_INVALID");
    if (sha256(record.batch) !== record.batchHash || batchHashes.has(record.batchHash)) failure(500, "EVIDENCE_CHAIN_INVALID");
    const payload = { ...record };
    delete payload.recordHash;
    if (sha256(payload) !== record.recordHash) failure(500, "EVIDENCE_CHAIN_INVALID");
    const acceptedAt = Date.parse(record.acceptedAt);
    if (!Number.isFinite(acceptedAt) || acceptedAt < previousAcceptedAt) failure(500, "EVIDENCE_CHAIN_INVALID");
    const session = validateBatch(record.batch);
    const state = sessions.get(session);
    if ((!state && record.batch.sequence !== 0) || (state && record.batch.sequence !== state.batchSequence + 1)) failure(500, "EVIDENCE_CHAIN_INVALID");
    const first = record.batch.events[0];
    const last = record.batch.events[record.batch.events.length - 1];
    if (state && (first.sequence <= state.eventSequence || Date.parse(first.occurredAt) < state.occurredAt)) failure(500, "EVIDENCE_CHAIN_INVALID");
    for (const event of record.batch.events) { if (eventIds.has(event.eventId)) failure(500, "EVIDENCE_CHAIN_INVALID"); eventIds.add(event.eventId); }
    sessions.set(session, { batchSequence: record.batch.sequence, eventSequence: last.sequence, occurredAt: Date.parse(last.occurredAt) });
    batchHashes.add(record.batchHash);
    previousHash = record.recordHash;
    previousAcceptedAt = acceptedAt;
  }
  return records;
};

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
const refreshRate = (now) => {
  if (rate.startedAt === 0 || now - rate.startedAt >= 60000 || now < rate.startedAt) {
    rate.startedAt = now; rate.requests = 0; rate.events = 0;
  }
};

const ingest = async (batch) => {
  await prepare();
  const records = await readRecords();
  const batchHash = sha256(batch);
  const duplicate = records.find((record) => record.batchHash === batchHash);
  if (duplicate) return { accepted: batch.events.length, duplicate: true, record: duplicate };
  const session = batch.events[0].sessionId;
  if (records.some((record) => record.batch.events[0].sessionId === session && record.batch.sequence === batch.sequence)) failure(409, "BATCH_SEQUENCE_CONFLICT");
  const knownIds = new Set(records.flatMap((record) => record.batch.events.map((event) => event.eventId)));
  if (batch.events.some((event) => knownIds.has(event.eventId))) failure(409, "EVENT_ID_CONFLICT");
  const sessionRecords = records.filter((record) => record.batch.events[0].sessionId === session);
  const previousSession = sessionRecords[sessionRecords.length - 1];
  if ((!previousSession && batch.sequence !== 0) || (previousSession && batch.sequence !== previousSession.batch.sequence + 1)) failure(409, "BATCH_SEQUENCE_GAP");
  if (previousSession) {
    const previousEvent = previousSession.batch.events[previousSession.batch.events.length - 1];
    const firstEvent = batch.events[0];
    if (firstEvent.sequence <= previousEvent.sequence || Date.parse(firstEvent.occurredAt) < Date.parse(previousEvent.occurredAt)) failure(409, "EVENT_SEQUENCE_CONFLICT");
  }
  const acceptedAt = new Date().toISOString();
  const lastRecord = records[records.length - 1];
  if (lastRecord && Date.parse(acceptedAt) < Date.parse(lastRecord.acceptedAt)) failure(500, "CLOCK_REGRESSION");
  const payload = { schemaVersion: "living.evidence-batch/v1", acceptedAt, previousRecordHash: lastRecord ? lastRecord.recordHash : null, batchHash, batch };
  const record = { ...payload, recordHash: sha256(payload) };
  await appendFile(evidencePath, canonicalJson(record) + "\n", { encoding: "utf8", flag: "a" });
  return { accepted: batch.events.length, duplicate: false, record };
};

export async function POST(request) {
  try {
    if (request.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
    if (!sameOrigin(request)) return json(403, { error: "ORIGIN_REJECTED" });
    if (!jsonContentType.test(request.headers.get("content-type") || "")) return json(415, { error: "CONTENT_TYPE_REJECTED" });
    const now = Date.now();
    refreshRate(now);
    rate.requests += 1;
    if (rate.requests > DEFINITION.limits.maxRequestsPerMinute) return json(429, { error: "REQUEST_RATE_LIMIT" });
    const declared = request.headers.get("content-length");
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > DEFINITION.limits.maxPayloadBytes)) return json(/^\d+$/.test(declared) ? 413 : 400, { error: "PAYLOAD_SIZE_REJECTED" });
    const source = await request.text();
    if (new TextEncoder().encode(source).byteLength > DEFINITION.limits.maxPayloadBytes) return json(413, { error: "PAYLOAD_TOO_LARGE" });
    let batch;
    try { batch = JSON.parse(source); } catch { return json(400, { error: "JSON_INVALID" }); }
    validateBatch(batch);
    if (rate.events + batch.events.length > DEFINITION.limits.maxEventsPerMinute) return json(429, { error: "EVENT_RATE_LIMIT" });
    rate.events += batch.events.length;
    const operation = serializedWrite.then(() => ingest(batch));
    serializedWrite = operation.then(() => undefined, () => undefined);
    const result = await operation;
    return json(result.duplicate ? 200 : 202, { accepted: result.accepted, duplicate: result.duplicate, transportId: result.record.recordHash, recordHash: result.record.recordHash });
  } catch (error) {
    const status = error && Number.isInteger(error.status) ? error.status : 500;
    const code = error && typeof error.code === "string" ? error.code : "COLLECTOR_FAILURE";
    return json(status, { error: code });
  }
}
`;
export function collectorDefinitionFromObservationRuntimeMap(runtimeMap) {
    if (runtimeMap.schemaVersion !== "living.observation-runtime/v1" ||
        runtimeMap.collector.endpoint !== "/api/living/events") {
        throw new TypeError("Unsupported observation runtime map");
    }
    const candidates = [
        ...runtimeMap.targets.flatMap((target) => Object.values(target.events)),
        ...runtimeMap.routes.flatMap((route) => [route.start, route.complete]),
        ...Object.values(runtimeMap.systemEvents),
    ].filter((binding) => binding !== undefined);
    const byName = new Map();
    for (const binding of candidates) {
        const previous = byName.get(binding.eventName);
        if (previous !== undefined &&
            (previous.kind !== binding.kind ||
                previous.nodeId !== binding.nodeId ||
                previous.surfaceId !== binding.surfaceId)) {
            throw new TypeError(`Observation event '${binding.eventName}' has conflicting bindings`);
        }
        byName.set(binding.eventName, binding);
    }
    return resolveCollectorDefinition({
        schemaVersion: "living.collector-definition/v1",
        application: runtimeMap.application,
        eventBindings: [...byName.values()].sort((left, right) => left.eventName.localeCompare(right.eventName)),
        limits: {
            maxPayloadBytes: runtimeMap.limits.maxPayloadBytes,
            maxEventsPerBatch: runtimeMap.limits.maxBatchSize,
            maxRequestsPerMinute: 600,
            maxEventsPerMinute: runtimeMap.limits.maxEventsPerMinute,
        },
    }).definition;
}
export function generateNextCollectorFiles(definition) {
    const resolved = resolveCollectorDefinition(definition);
    const embedded = {
        schemaVersion: resolved.definition.schemaVersion,
        application: resolved.definition.application,
        eventBindings: [...resolved.definition.eventBindings],
        limits: resolved.limits,
    };
    const serializedDefinition = JSON.stringify(embedded)
        .replaceAll("<", "\\u003c")
        .replaceAll("\u2028", "\\u2028")
        .replaceAll("\u2029", "\\u2029");
    const serverContent = [
        "// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- generated runtime is validated before emission",
        "// @ts-nocheck",
        "// Generated dependency-free runtime; inputs are guarded by its explicit validators.",
        `const DEFINITION = Object.freeze(${serializedDefinition});`,
        GENERATED_SERVER_RUNTIME.trimStart(),
    ].join("\n");
    return Object.freeze({
        route: Object.freeze({
            relativePath: "src/app/api/living/events/route.ts",
            content: ROUTE_SOURCE,
        }),
        serverModule: Object.freeze({
            relativePath: "src/living-collector.generated.ts",
            content: serverContent.endsWith("\n") ? serverContent : `${serverContent}\n`,
        }),
    });
}
