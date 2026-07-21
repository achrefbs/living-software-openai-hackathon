import { appendFile, lstat, mkdir, readFile, realpath, } from "node:fs/promises";
import path from "node:path";
import { parseEvidenceBatchRecord, } from "@living-software/contracts";
import { canonicalStringify, sha256 } from "@living-software/core";
import { resolveCollectorDefinition, validateBatchForCollector, } from "./validation.js";
export const LEGACY_EVIDENCE_RELATIVE_PATH = ".living/data/events.ndjson";
/** @deprecated Use evidenceRelativePathForManifestHash for new evidence. */
export const EVIDENCE_RELATIVE_PATH = LEGACY_EVIDENCE_RELATIVE_PATH;
const MANIFEST_HASH = /^sha256:([a-f0-9]{64})$/u;
export function evidenceRelativePathForManifestHash(manifestHash) {
    const match = MANIFEST_HASH.exec(manifestHash);
    if (match?.[1] === undefined) {
        throw new TypeError("Evidence path requires a lowercase SHA-256 manifest hash");
    }
    return `.living/data/releases/${match[1]}/events.ndjson`;
}
export class EvidenceIntegrityError extends Error {
    constructor(message) {
        super(message);
        this.name = "EvidenceIntegrityError";
    }
}
export class EvidenceConflictError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "EvidenceConflictError";
        this.code = code;
    }
}
function hashBatch(batch) {
    return sha256(batch);
}
function hashRecordPayload(record) {
    return sha256(record);
}
function verifyBatchOrdering(record, state) {
    const events = record.batch.events;
    const sessionId = events[0]?.sessionId;
    if (sessionId === undefined)
        throw new EvidenceIntegrityError("Stored batch is empty");
    let localSequence = -1;
    let localOccurredAt = -Infinity;
    for (const event of events) {
        if (event.sessionId !== sessionId) {
            throw new EvidenceIntegrityError("Stored batch mixes browser sessions");
        }
        if (event.sequence <= localSequence) {
            throw new EvidenceIntegrityError("Stored event sequence is not strictly increasing");
        }
        const occurredAt = Date.parse(event.occurredAt);
        if (occurredAt < localOccurredAt) {
            throw new EvidenceIntegrityError("Stored event timestamps move backwards");
        }
        if (state.eventIds.has(event.eventId)) {
            throw new EvidenceIntegrityError(`Stored event id '${event.eventId}' is duplicated`);
        }
        state.eventIds.add(event.eventId);
        localSequence = event.sequence;
        localOccurredAt = occurredAt;
    }
    const key = `${sessionId}|${record.batch.sequence}`;
    if (state.batchSequenceHashes.has(key)) {
        throw new EvidenceIntegrityError("Stored session batch sequence is duplicated");
    }
    state.batchSequenceHashes.set(key, record.batchHash);
    const previous = state.sessions.get(sessionId);
    if (previous === undefined) {
        if (record.batch.sequence !== 0) {
            throw new EvidenceIntegrityError("A session's first stored batch must have sequence zero");
        }
    }
    else {
        if (record.batch.sequence !== previous.batchSequence + 1) {
            throw new EvidenceIntegrityError("Stored session batch sequence has a gap or regression");
        }
        if ((events[0]?.sequence ?? -1) <= previous.eventSequence) {
            throw new EvidenceIntegrityError("Stored event sequence regresses across batches");
        }
        if ((events[0] === undefined ? -Infinity : Date.parse(events[0].occurredAt)) < previous.occurredAt) {
            throw new EvidenceIntegrityError("Stored event time regresses across batches");
        }
    }
    state.sessions.set(sessionId, {
        batchSequence: record.batch.sequence,
        eventSequence: events.at(-1)?.sequence ?? -1,
        occurredAt: events.at(-1) === undefined ? -Infinity : Date.parse(events.at(-1).occurredAt),
    });
}
export function verifyEvidenceRecords(candidates, definition) {
    const resolved = definition === undefined ? undefined : resolveCollectorDefinition(definition);
    const state = {
        records: [],
        batchByHash: new Map(),
        batchSequenceHashes: new Map(),
        eventIds: new Set(),
        sessions: new Map(),
    };
    let previousRecordHash = null;
    let previousAcceptedAt = -Infinity;
    candidates.forEach((candidate, index) => {
        let record;
        try {
            record = parseEvidenceBatchRecord(candidate);
        }
        catch {
            throw new EvidenceIntegrityError(`Evidence record ${index} does not satisfy its schema`);
        }
        if (record.previousRecordHash !== previousRecordHash) {
            throw new EvidenceIntegrityError(`Evidence record ${index} breaks the previous-hash chain`);
        }
        if (hashBatch(record.batch) !== record.batchHash) {
            throw new EvidenceIntegrityError(`Evidence record ${index} has an invalid batch hash`);
        }
        const { recordHash: _recordHash, ...payload } = record;
        if (hashRecordPayload(payload) !== record.recordHash) {
            throw new EvidenceIntegrityError(`Evidence record ${index} has an invalid record hash`);
        }
        if (state.batchByHash.has(record.batchHash)) {
            throw new EvidenceIntegrityError(`Evidence record ${index} repeats a stored batch`);
        }
        const acceptedAt = Date.parse(record.acceptedAt);
        if (acceptedAt < previousAcceptedAt) {
            throw new EvidenceIntegrityError(`Evidence record ${index} acceptance time regresses`);
        }
        if (resolved !== undefined) {
            validateBatchForCollector(record.batch, resolved.definition, resolved.bindings, resolved.limits.maxEventsPerBatch);
        }
        verifyBatchOrdering(record, state);
        state.records.push(record);
        state.batchByHash.set(record.batchHash, record);
        previousRecordHash = record.recordHash;
        previousAcceptedAt = acceptedAt;
    });
    return Object.freeze(state.records);
}
export function parseEvidenceNdjson(source, definition) {
    if (source.length === 0)
        return Object.freeze([]);
    const lines = source.endsWith("\n") ? source.slice(0, -1).split("\n") : source.split("\n");
    if (lines.some((line) => line.trim().length === 0)) {
        throw new EvidenceIntegrityError("Evidence NDJSON contains an empty record line");
    }
    const candidates = lines.map((line, index) => {
        try {
            return JSON.parse(line);
        }
        catch {
            throw new EvidenceIntegrityError(`Evidence line ${index} is not valid JSON`);
        }
    });
    return verifyEvidenceRecords(candidates, definition);
}
async function exists(pathname) {
    try {
        await lstat(pathname);
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
async function assertNotSymlink(pathname) {
    if (!(await exists(pathname)))
        return;
    const stat = await lstat(pathname);
    if (stat.isSymbolicLink()) {
        throw new EvidenceIntegrityError(`Evidence path component '${pathname}' cannot be a symlink`);
    }
}
async function ensureDirectory(pathname) {
    await assertNotSymlink(pathname);
    await mkdir(pathname, { recursive: false }).catch((error) => {
        if (error.code !== "EEXIST")
            throw error;
    });
    const stat = await lstat(pathname);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new EvidenceIntegrityError(`Evidence directory '${pathname}' is unsafe`);
    }
}
async function optionalRegularFile(pathname) {
    await assertNotSymlink(pathname);
    try {
        const stat = await lstat(pathname);
        if (!stat.isFile() || stat.isSymbolicLink()) {
            throw new EvidenceIntegrityError(`Evidence path '${pathname}' is not a regular file`);
        }
        return await readFile(pathname, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    }
}
function recordsMatchApplication(records, definition) {
    const app = definition.application;
    return records.every((record) => record.batch.events.every((event) => event.appId === app.appId &&
        event.environment === app.environment &&
        event.releaseRevision === app.releaseRevision &&
        event.product?.manifestHash === app.manifestHash &&
        event.provenance.synthetic === app.synthetic));
}
/**
 * Verifies a legacy chain independently, then accepts it only when its
 * immutable application identity belongs to the current definition.
 */
export function parseCompatibleLegacyEvidenceNdjson(source, definition) {
    const records = parseEvidenceNdjson(source);
    if (!recordsMatchApplication(records, definition))
        return undefined;
    return parseEvidenceNdjson(source, definition);
}
export class AppendOnlyEvidenceStore {
    evidencePath;
    rootPath;
    definition;
    resolved;
    legacyEvidencePath;
    releaseDirectory;
    serial = Promise.resolve();
    constructor(options) {
        this.rootPath = path.resolve(options.rootPath);
        this.resolved = resolveCollectorDefinition(options.definition);
        this.definition = this.resolved.definition;
        const relative = evidenceRelativePathForManifestHash(this.definition.application.manifestHash);
        this.evidencePath = path.join(this.rootPath, ...relative.split("/"));
        this.releaseDirectory = path.dirname(this.evidencePath);
        this.legacyEvidencePath = path.join(this.rootPath, ...LEGACY_EVIDENCE_RELATIVE_PATH.split("/"));
    }
    async prepare() {
        const rootRealPath = await realpath(this.rootPath);
        if (path.resolve(rootRealPath) !== this.rootPath) {
            throw new EvidenceIntegrityError("Collector root cannot be a symlink");
        }
        const livingPath = path.join(this.rootPath, ".living");
        const dataPath = path.join(livingPath, "data");
        const releasesPath = path.join(dataPath, "releases");
        await ensureDirectory(livingPath);
        await ensureDirectory(dataPath);
        await ensureDirectory(releasesPath);
        await ensureDirectory(this.releaseDirectory);
        await assertNotSymlink(this.evidencePath);
        if (await exists(this.evidencePath)) {
            const stat = await lstat(this.evidencePath);
            if (!stat.isFile() || stat.isSymbolicLink()) {
                throw new EvidenceIntegrityError("Evidence path is not a regular file");
            }
        }
    }
    async readActiveUnsafe() {
        const source = await optionalRegularFile(this.evidencePath);
        if (source === undefined)
            return Object.freeze([]);
        return parseEvidenceNdjson(source, this.definition);
    }
    async readLegacyCompatibleUnsafe() {
        const source = await optionalRegularFile(this.legacyEvidencePath);
        if (source === undefined)
            return undefined;
        return parseCompatibleLegacyEvidenceNdjson(source, this.definition);
    }
    async readVerified() {
        await this.serial;
        await this.prepare();
        if (await exists(this.evidencePath))
            return this.readActiveUnsafe();
        return (await this.readLegacyCompatibleUnsafe()) ?? Object.freeze([]);
    }
    append(batch, acceptedAt) {
        const operation = this.serial.then(async () => {
            validateBatchForCollector(batch, this.resolved.definition, this.resolved.bindings, this.resolved.limits.maxEventsPerBatch);
            await this.prepare();
            const records = await this.readActiveUnsafe();
            const batchHash = hashBatch(batch);
            const duplicate = records.find((record) => record.batchHash === batchHash);
            if (duplicate !== undefined) {
                return {
                    accepted: batch.events.length,
                    duplicate: true,
                    record: duplicate,
                };
            }
            const sessionId = batch.events[0]?.sessionId ?? "";
            const sameSequence = records.find((record) => record.batch.events[0]?.sessionId === sessionId &&
                record.batch.sequence === batch.sequence);
            if (sameSequence !== undefined) {
                throw new EvidenceConflictError("BATCH_SEQUENCE_CONFLICT", "The session batch sequence already exists with different content");
            }
            const seenEventIds = new Set(records.flatMap((record) => record.batch.events.map((event) => event.eventId)));
            if (batch.events.some((event) => seenEventIds.has(event.eventId))) {
                throw new EvidenceConflictError("EVENT_ID_CONFLICT", "One or more event ids already exist with different batch content");
            }
            const sessionRecords = records.filter((record) => record.batch.events[0]?.sessionId === sessionId);
            const previousSessionRecord = sessionRecords.at(-1);
            if (previousSessionRecord === undefined) {
                if (batch.sequence !== 0) {
                    throw new EvidenceConflictError("BATCH_SEQUENCE_GAP", "A session's first accepted batch must have sequence zero");
                }
            }
            else {
                if (batch.sequence !== previousSessionRecord.batch.sequence + 1) {
                    throw new EvidenceConflictError("BATCH_SEQUENCE_GAP", "Session batch sequence must increase by one");
                }
                const previousEvent = previousSessionRecord.batch.events.at(-1);
                const firstEvent = batch.events[0];
                if (previousEvent !== undefined && firstEvent !== undefined) {
                    if (firstEvent.sequence <= previousEvent.sequence) {
                        throw new EvidenceConflictError("EVENT_SEQUENCE_CONFLICT", "Event sequence must increase across session batches");
                    }
                    if (Date.parse(firstEvent.occurredAt) < Date.parse(previousEvent.occurredAt)) {
                        throw new EvidenceConflictError("EVENT_TIME_CONFLICT", "Event time must not regress across session batches");
                    }
                }
            }
            const previousRecordHash = records.at(-1)?.recordHash ?? null;
            const acceptedTime = Date.parse(acceptedAt);
            if (!Number.isFinite(acceptedTime)) {
                throw new EvidenceConflictError("ACCEPTED_AT_INVALID", "acceptedAt must be an ISO timestamp");
            }
            const previousAcceptedAt = records.at(-1)?.acceptedAt;
            if (previousAcceptedAt !== undefined &&
                acceptedTime < Date.parse(previousAcceptedAt)) {
                throw new EvidenceConflictError("CLOCK_REGRESSION", "Evidence acceptance time must not regress");
            }
            const payload = {
                schemaVersion: "living.evidence-batch/v1",
                acceptedAt,
                previousRecordHash,
                batchHash,
                batch,
            };
            const record = parseEvidenceBatchRecord({
                ...payload,
                recordHash: hashRecordPayload(payload),
            });
            await appendFile(this.evidencePath, `${canonicalStringify(record)}\n`, { encoding: "utf8", flag: "a" });
            return {
                accepted: batch.events.length,
                duplicate: false,
                record,
            };
        });
        this.serial = operation.then(() => undefined, () => undefined);
        return operation;
    }
}
