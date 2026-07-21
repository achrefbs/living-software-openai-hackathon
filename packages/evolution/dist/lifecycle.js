import { randomUUID } from "node:crypto";
import { lstat, link, mkdir, open, readFile, readdir, realpath, rename, unlink, } from "node:fs/promises";
import path from "node:path";
import { evolutionReceiptSchema, gpt56EvolutionBriefSchema, identifierSchema, intelligenceProvenanceSchema, installRecordSchema, opportunitySchema, productManifestSchema, } from "@living-software/contracts";
import { canonicalJson, hashBytes, hashJson } from "./canonical.js";
import { SOURCE_EVOLUTION_POLICY, SOURCE_EVOLUTION_PROHIBITIONS, SOURCE_EVOLUTION_TESTS, parseSourceEvolutionState, sourceEvolutionApplicationSchema, sourceEvolutionArtifactSchema, sourceEvolutionContractSchema, sourcePatchModelProvenanceSchema, sourceEvolutionProofSchema, sourceEvolutionSummarySchema, } from "./contracts.js";
import { SourceEvolutionError } from "./errors.js";
import { compileModelPatch, compileStoredModelPatchForIntegrity, sourcePatchProposalSchema, } from "./model-patch.js";
import { buildEvolutionReceipt, parseEvolutionReceiptStream, serializeEvolutionReceipt, } from "./receipts.js";
const EVOLUTION_ID = /^evolution\.source\.v2\.[a-f0-9]{24}$/u;
const STORAGE_ROOT = ".living/data/evolutions-v2";
const ENGINE_ACTOR = {
    type: "system",
    component: "source-evolution-engine",
    version: "0.1.0",
};
let executablePatchCompiler = compileModelPatch;
export function setUnsafeExecutablePatchCompilerForTests(enabled = false) {
    executablePatchCompiler = enabled
        ? compileStoredModelPatchForIntegrity
        : compileModelPatch;
}
function observeProgress(observer, event) {
    if (observer === undefined)
        return;
    try {
        const result = observer(Object.freeze({ ...event }));
        void Promise.resolve(result).catch(() => undefined);
    }
    catch {
        // Progress is deliberately non-authoritative. An observer can neither
        // permit nor prevent a lifecycle transition.
    }
}
function now(clock) {
    return (clock ?? (() => new Date()))().toISOString();
}
function inside(root, candidate) {
    const relative = path.relative(root, candidate);
    return (relative === "" ||
        (!relative.startsWith("..") && !path.isAbsolute(relative)));
}
async function statOrUndefined(candidate) {
    try {
        return await lstat(candidate);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    }
}
async function repositoryRoot(rootInput) {
    let root;
    try {
        root = await realpath(rootInput);
    }
    catch (error) {
        throw new SourceEvolutionError("UNSAFE_TARGET", "The repository root does not exist or cannot be resolved", { cause: error });
    }
    const stats = await lstat(root);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new SourceEvolutionError("UNSAFE_TARGET", "The resolved repository root must be a real directory");
    }
    return root;
}
function safeSegments(relative) {
    const normalized = relative.replaceAll("\\", "/");
    if (normalized.length === 0 ||
        normalized.startsWith("/") ||
        /^[A-Za-z]:\//u.test(normalized) ||
        normalized.split("/").some((segment) => segment === "" || segment === "..")) {
        throw new SourceEvolutionError("UNSAFE_TARGET", `Unsafe repository-relative path: ${relative}`);
    }
    return normalized.split("/");
}
async function assertSafeDirectory(root, relative) {
    let cursor = root;
    for (const segment of safeSegments(relative)) {
        cursor = path.join(cursor, segment);
        const stats = await statOrUndefined(cursor);
        if (stats === undefined ||
            !stats.isDirectory() ||
            stats.isSymbolicLink()) {
            throw new SourceEvolutionError("UNSAFE_TARGET", `Expected a real directory inside the repository: ${relative}`);
        }
    }
    const resolved = await realpath(cursor);
    if (!inside(root, resolved)) {
        throw new SourceEvolutionError("UNSAFE_TARGET", `Directory escapes the repository root: ${relative}`);
    }
    return cursor;
}
async function ensureSafeDirectory(root, relative) {
    let cursor = root;
    for (const segment of safeSegments(relative)) {
        cursor = path.join(cursor, segment);
        let stats = await statOrUndefined(cursor);
        if (stats === undefined) {
            try {
                await mkdir(cursor);
            }
            catch (error) {
                if (error.code !== "EEXIST")
                    throw error;
            }
            stats = await lstat(cursor);
        }
        if (!stats.isDirectory() || stats.isSymbolicLink()) {
            throw new SourceEvolutionError("UNSAFE_TARGET", `Storage traverses a non-directory or symlink: ${relative}`);
        }
    }
    const resolved = await realpath(cursor);
    if (!inside(root, resolved)) {
        throw new SourceEvolutionError("UNSAFE_TARGET", `Storage escapes the repository root: ${relative}`);
    }
    return cursor;
}
async function assertSafeRegularFile(root, relative) {
    const segments = safeSegments(relative);
    let cursor = root;
    for (const [index, segment] of segments.entries()) {
        cursor = path.join(cursor, segment);
        const stats = await statOrUndefined(cursor);
        const last = index === segments.length - 1;
        if (stats === undefined || stats.isSymbolicLink()) {
            throw new SourceEvolutionError("UNSAFE_TARGET", `Target must exist and must not traverse a symlink: ${relative}`);
        }
        if ((!last && !stats.isDirectory()) || (last && !stats.isFile())) {
            throw new SourceEvolutionError("UNSAFE_TARGET", `Target must be a regular file: ${relative}`);
        }
    }
    const resolved = await realpath(cursor);
    if (!inside(root, resolved)) {
        throw new SourceEvolutionError("UNSAFE_TARGET", `Target escapes the repository root: ${relative}`);
    }
    return cursor;
}
async function validateInstalledHost(root, app) {
    const relative = ".living/install-record.json";
    const candidate = path.join(root, ...safeSegments(relative));
    if ((await statOrUndefined(candidate)) === undefined) {
        throw new SourceEvolutionError("HOST_NOT_INSTALLED", "Living Software must be installed before source evolution can be prepared");
    }
    const recordPath = await assertSafeRegularFile(root, relative);
    let record;
    try {
        record = installRecordSchema.parse(JSON.parse(await readFile(recordPath, "utf8")));
    }
    catch (error) {
        throw new SourceEvolutionError("HOST_INSTALL_MISMATCH", "The Living Software install record is invalid", { cause: error });
    }
    if (record.appId !== app.appId ||
        record.manifestHash !== app.manifestHash) {
        throw new SourceEvolutionError("HOST_INSTALL_MISMATCH", "The installed host identity does not match the prepared application");
    }
}
async function readExpectedTarget(root, targetPath, expectedContent, expectedHash, mismatchCode) {
    const target = await assertSafeRegularFile(root, targetPath);
    const bytes = await readFile(target);
    if (hashBytes(bytes) !== expectedHash ||
        !bytes.equals(Buffer.from(expectedContent, "utf8"))) {
        throw new SourceEvolutionError(mismatchCode, mismatchCode === "TARGET_PREIMAGE_MISMATCH"
            ? "The target no longer matches the exact approved preimage"
            : "Rollback requires the exact installed postimage");
    }
    return { path: target, mode: (await lstat(target)).mode };
}
async function atomicReplaceTarget(root, targetPath, expectedContent, expectedHash, nextContent, evolutionId, mismatchCode) {
    const segments = safeSegments(targetPath);
    const parentRelative = segments.slice(0, -1).join("/");
    const parent = await assertSafeDirectory(root, parentRelative);
    const targetPathAbsolute = path.join(parent, segments.at(-1));
    const operation = mismatchCode === "TARGET_PREIMAGE_MISMATCH"
        ? "apply"
        : "rollback";
    const transitionStem = `.${path.basename(targetPathAbsolute)}.${evolutionId}.${operation}`;
    const guardPath = path.join(parent, `${transitionStem}.living-guard`);
    const temporary = path.join(parent, `${transitionStem}.living-next`);
    const expectedBytes = Buffer.from(expectedContent, "utf8");
    const nextBytes = Buffer.from(nextContent, "utf8");
    const nextHash = hashBytes(nextBytes);
    const inspect = async (candidate) => {
        const stats = await statOrUndefined(candidate);
        if (stats === undefined)
            return { kind: "missing" };
        if (!stats.isFile() || stats.isSymbolicLink()) {
            throw new SourceEvolutionError("UNSAFE_TARGET", "Source transition paths must remain regular files");
        }
        const bytes = await readFile(candidate);
        const after = await lstat(candidate);
        if (!after.isFile() ||
            after.isSymbolicLink() ||
            after.dev !== stats.dev ||
            after.ino !== stats.ino ||
            after.size !== stats.size ||
            after.mtimeMs !== stats.mtimeMs ||
            bytes.length !== stats.size) {
            throw new SourceEvolutionError("STORAGE_CONFLICT", "A source transition file changed while it was inspected");
        }
        return {
            kind: "file",
            bytes,
            hash: hashBytes(bytes),
            mode: stats.mode,
        };
    };
    const matches = (inspected, bytes, hash) => inspected.kind === "file" &&
        inspected.hash === hash &&
        inspected.bytes.equals(bytes);
    const mismatch = (message) => {
        throw new SourceEvolutionError(mismatchCode, message);
    };
    let target = await inspect(targetPathAbsolute);
    let guard = await inspect(guardPath);
    // Recovery is idempotent. If the exact postimage is already installed,
    // remove only an exact captured preimage left by an interrupted transition.
    if (matches(target, nextBytes, nextHash)) {
        if (guard.kind === "file") {
            if (!matches(guard, expectedBytes, expectedHash)) {
                throw new SourceEvolutionError("STORAGE_CONFLICT", "The source transition guard does not contain the exact prior image");
            }
            await unlink(guardPath);
        }
        const staleTemporary = await inspect(temporary);
        if (staleTemporary.kind === "file") {
            if (!matches(staleTemporary, nextBytes, nextHash)) {
                throw new SourceEvolutionError("STORAGE_CONFLICT", "The source transition temporary file has unexpected contents");
            }
            await unlink(temporary);
        }
        return "already-present";
    }
    if (target.kind === "file" && !matches(target, expectedBytes, expectedHash)) {
        mismatch(mismatchCode === "TARGET_PREIMAGE_MISMATCH"
            ? "The target no longer matches the exact approved preimage"
            : "Rollback requires the exact installed postimage");
    }
    if (target.kind === "file") {
        if (guard.kind !== "missing") {
            throw new SourceEvolutionError("STORAGE_CONFLICT", "A source transition guard already exists before target capture");
        }
        // Capture first, then verify what was captured. A racing writer's bytes are
        // preserved in the guard and are never overwritten by the approved image.
        await rename(targetPathAbsolute, guardPath);
        await injectFault("after-target-capture");
        target = await inspect(targetPathAbsolute);
        guard = await inspect(guardPath);
        if (!matches(guard, expectedBytes, expectedHash)) {
            if (target.kind === "missing") {
                try {
                    await link(guardPath, targetPathAbsolute);
                    await unlink(guardPath);
                }
                catch {
                    // Preserve the captured bytes for manual recovery when another writer
                    // has already recreated the target.
                }
            }
            mismatch("The target changed while its exact preimage was being captured");
        }
    }
    else if (!matches(guard, expectedBytes, expectedHash)) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "The target is missing and no exact captured preimage can resume the transition");
    }
    const existingTemporary = await inspect(temporary);
    if (existingTemporary.kind === "file") {
        if (!matches(existingTemporary, nextBytes, nextHash)) {
            throw new SourceEvolutionError("STORAGE_CONFLICT", "A prior source-evolution temporary file has unexpected contents");
        }
    }
    else {
        const mode = guard.kind === "file"
            ? guard.mode
            : 0o600;
        const handle = await open(temporary, "wx", mode);
        try {
            await handle.writeFile(nextBytes);
            await handle.sync();
        }
        finally {
            await handle.close();
        }
    }
    let disposition;
    try {
        // Hard-link publication is an atomic no-overwrite operation. If another
        // writer recreated the target after capture, EEXIST preserves their bytes
        // and the exact prior image remains in the guard.
        await link(temporary, targetPathAbsolute);
        disposition = "written";
    }
    catch (error) {
        if (error.code !== "EEXIST")
            throw error;
        const appeared = await inspect(targetPathAbsolute);
        if (!matches(appeared, nextBytes, nextHash)) {
            throw new SourceEvolutionError("STORAGE_CONFLICT", "Another writer recreated the target during the approved transition; no bytes were overwritten", { cause: error });
        }
        disposition = "already-present";
    }
    const installed = await inspect(targetPathAbsolute);
    if (!matches(installed, nextBytes, nextHash)) {
        throw new SourceEvolutionError("STORAGE_CONFLICT", "The published target does not match the exact approved postimage");
    }
    await unlink(temporary).catch((error) => {
        if (error.code !== "ENOENT")
            throw error;
    });
    const finalGuard = await inspect(guardPath);
    if (!matches(finalGuard, expectedBytes, expectedHash)) {
        throw new SourceEvolutionError("STORAGE_CONFLICT", "The captured source guard changed before transition completion");
    }
    await unlink(guardPath);
    return disposition;
}
function validateEvolutionId(evolutionId) {
    if (!EVOLUTION_ID.test(evolutionId)) {
        throw new SourceEvolutionError("INVALID_INPUT", "Invalid deterministic source evolution id");
    }
}
function assertExpectedRevision(state, expectedRevision) {
    if (!Number.isSafeInteger(expectedRevision) ||
        expectedRevision !== state.receiptCount) {
        throw new SourceEvolutionError("STALE_REVISION", `Expected revision ${expectedRevision}; current revision is ${state.receiptCount}`);
    }
}
function storagePaths(evolutionId) {
    const directory = `${STORAGE_ROOT}/${evolutionId}`;
    return {
        directory,
        statePath: `${directory}/state.json`,
        receiptsPath: `${directory}/receipts.ndjson`,
    };
}
const LOCK_LEASE_MS = 60_000;
async function acquireLeaseLock(root, directory, lockPath, scope) {
    if (path.dirname(lockPath) !== directory || !inside(directory, lockPath)) {
        throw new SourceEvolutionError("UNSAFE_TARGET", `The ${scope} lock path escaped its storage directory`);
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const ownerToken = randomUUID();
        let handle;
        try {
            handle = await open(lockPath, "wx");
        }
        catch (error) {
            if (error.code !== "EEXIST")
                throw error;
            const stats = await lstat(lockPath);
            if (!stats.isFile() || stats.isSymbolicLink()) {
                throw new SourceEvolutionError("UNSAFE_TARGET", `The ${scope} lock is not a regular file`);
            }
            let existing;
            try {
                existing = JSON.parse(await readFile(lockPath, "utf8"));
            }
            catch {
                throw new SourceEvolutionError("EVOLUTION_BUSY", `The ${scope} is locked by an unreadable owner record`);
            }
            if (typeof existing.ownerToken !== "string" ||
                typeof existing.expiresAt !== "string" ||
                !Number.isFinite(Date.parse(existing.expiresAt)) ||
                Date.parse(existing.expiresAt) > Date.now()) {
                throw new SourceEvolutionError("EVOLUTION_BUSY", `Another process currently owns this ${scope}`);
            }
            // The repository controls the lock contents, so the owner token must
            // never become part of a filesystem path. A fresh UUID keeps the
            // quarantine name inside this exact evolution directory. hard-link(2)
            // is used as a no-overwrite capture before the stale path is unlinked.
            const stalePath = path.join(directory, `${path.basename(lockPath)}.stale.${randomUUID()}.json`);
            if (path.dirname(stalePath) !== directory ||
                !inside(directory, stalePath)) {
                throw new SourceEvolutionError("UNSAFE_TARGET", `The stale-lock quarantine path escaped the ${scope} directory`);
            }
            try {
                await link(lockPath, stalePath);
            }
            catch (error) {
                if (error.code === "EEXIST")
                    continue;
                throw new SourceEvolutionError("EVOLUTION_BUSY", `Another process changed or could not quarantine the ${scope} lock`, { cause: error });
            }
            try {
                const captured = JSON.parse(await readFile(stalePath, "utf8"));
                const [sourceStats, capturedStats] = await Promise.all([
                    lstat(lockPath),
                    lstat(stalePath),
                ]);
                if (captured.ownerToken !== existing.ownerToken ||
                    captured.expiresAt !== existing.expiresAt ||
                    typeof captured.expiresAt !== "string" ||
                    Date.parse(captured.expiresAt) > Date.now() ||
                    sourceStats.dev !== capturedStats.dev ||
                    sourceStats.ino !== capturedStats.ino) {
                    throw new SourceEvolutionError("EVOLUTION_BUSY", `Another process replaced the ${scope} lock during quarantine`);
                }
                await unlink(lockPath);
            }
            catch (error) {
                await unlink(stalePath).catch(() => undefined);
                if (error instanceof SourceEvolutionError)
                    throw error;
                throw new SourceEvolutionError("EVOLUTION_BUSY", `Another process changed the ${scope} lock during quarantine`, { cause: error });
            }
            continue;
        }
        const acquiredAt = new Date();
        try {
            await handle.writeFile(`${canonicalJson({
                schemaVersion: "living.source-evolution-lock/v1",
                scope,
                ownerToken,
                acquiredAt: acquiredAt.toISOString(),
                expiresAt: new Date(acquiredAt.getTime() + LOCK_LEASE_MS).toISOString(),
            })}\n`, "utf8");
            await handle.sync();
            return { root, path: lockPath, ownerToken, handle };
        }
        catch (error) {
            await handle.close().catch(() => undefined);
            await unlink(lockPath).catch(() => undefined);
            throw error;
        }
    }
    throw new SourceEvolutionError("EVOLUTION_BUSY", `Unable to acquire the ${scope} lock`);
}
async function releaseLeaseLock(lock) {
    await lock.handle.close();
    let existing;
    try {
        existing = JSON.parse(await readFile(lock.path, "utf8"));
    }
    catch (error) {
        throw new SourceEvolutionError("STORAGE_CONFLICT", "The evolution lock disappeared before release", { cause: error });
    }
    if (existing.ownerToken !== lock.ownerToken) {
        throw new SourceEvolutionError("STORAGE_CONFLICT", "The evolution lock owner changed before release");
    }
    await unlink(lock.path);
}
async function acquireEvolutionLock(rootInput, evolutionId) {
    validateEvolutionId(evolutionId);
    const root = await repositoryRoot(rootInput);
    const directory = await assertSafeDirectory(root, storagePaths(evolutionId).directory);
    return acquireLeaseLock(root, directory, path.join(directory, "mutation.lock"), "evolution");
}
async function acquireApplicationLock(rootInput, appIdInput) {
    const appId = identifierSchema.parse(appIdInput);
    const root = await repositoryRoot(rootInput);
    const directory = await assertSafeDirectory(root, STORAGE_ROOT);
    const scopeHash = hashJson({
        schemaVersion: "living.source-evolution-application-lock-scope/v1",
        appId,
    });
    const lockPath = path.join(directory, `application.${scopeHash.slice(7, 31)}.mutation.lock`);
    return acquireLeaseLock(root, directory, lockPath, "application");
}
async function withEvolutionLock(root, evolutionId, action) {
    const lock = await acquireEvolutionLock(root, evolutionId);
    try {
        await recoverPendingTransaction(lock.root, evolutionId);
        return await action();
    }
    finally {
        await releaseLeaseLock(lock);
    }
}
async function writeNewFile(target, content) {
    const handle = await open(target, "wx");
    try {
        await handle.writeFile(content, "utf8");
        await handle.sync();
    }
    finally {
        await handle.close();
    }
}
async function replaceStateFile(statePath, state) {
    const stats = await lstat(statePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new SourceEvolutionError("STORAGE_CONFLICT", "Evolution state is not a regular file");
    }
    const temporary = `${statePath}.${randomUUID()}.tmp`;
    if ((await statOrUndefined(temporary)) !== undefined) {
        throw new SourceEvolutionError("STORAGE_CONFLICT", "A prior state-write temporary file already exists");
    }
    const handle = await open(temporary, "wx", stats.mode);
    try {
        await handle.writeFile(`${canonicalJson(state)}\n`, "utf8");
        await handle.sync();
    }
    finally {
        await handle.close();
    }
    try {
        await rename(temporary, statePath);
    }
    catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
}
async function replaceReceiptsFile(receiptsPath, receipts) {
    const stats = await lstat(receiptsPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new SourceEvolutionError("STORAGE_CONFLICT", "Evolution receipts are not a regular file");
    }
    const temporary = `${receiptsPath}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", stats.mode);
    try {
        await handle.writeFile(receipts.map(serializeEvolutionReceipt).join(""), "utf8");
        await handle.sync();
    }
    finally {
        await handle.close();
    }
    try {
        await rename(temporary, receiptsPath);
    }
    catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
}
function validateInputBindings(app, manifest, opportunity, brief, briefProvenance, patchProposal, patchProvenance, targetPath) {
    const mismatch = (message) => {
        throw new SourceEvolutionError("INVALID_INPUT", message);
    };
    if (app.appId !== manifest.appId ||
        app.appId !== opportunity.appId ||
        app.appId !== brief.appId ||
        app.appId !== patchProposal.appId) {
        mismatch("App, manifest, opportunity, and brief app ids must match");
    }
    if (app.manifestHash !== manifest.contentHash ||
        app.manifestHash !== opportunity.manifestHash ||
        app.manifestHash !== brief.manifestHash ||
        app.manifestHash !== patchProposal.manifestHash) {
        mismatch("App, manifest, opportunity, and brief manifest hashes must match");
    }
    if (app.releaseRevision !== manifest.release.revision) {
        mismatch("Application and manifest release revisions must match");
    }
    if (app.dataOrigin !== opportunity.evidence.dataOrigin ||
        app.dataOrigin !== brief.evidenceScope.origin) {
        mismatch("Application, opportunity, and brief evidence origins must match");
    }
    if (brief.opportunityId !== opportunity.opportunityId ||
        patchProposal.opportunityId !== opportunity.opportunityId ||
        patchProposal.briefId !== brief.briefId ||
        brief.evidenceCitations.eventSetHash !==
            opportunity.evidence.eventSetHash ||
        opportunity.evidence.bundle.sha256 !==
            opportunity.evidence.eventSetHash) {
        mismatch("Brief and opportunity evidence identities must match exactly");
    }
    const sampled = new Set(opportunity.evidence.sampleEventIds);
    if (brief.evidenceCitations.sampleEventIds.some((eventId) => !sampled.has(eventId))) {
        mismatch("Every brief evidence citation must exist in the opportunity");
    }
    const metrics = new Map(opportunity.signal.metrics.map((metric) => [metric.name, metric.observed]));
    if (brief.evidenceCitations.metrics.some((metric) => metrics.get(metric.name) !== metric.observed)) {
        mismatch("Every brief metric must exactly match the opportunity");
    }
    const nodeIds = new Set(manifest.nodes.map((node) => node.id));
    if (brief.proposedChange.affectedProductNodeIds.some((nodeId) => !nodeIds.has(nodeId))) {
        mismatch("Every affected product node must exist in the manifest");
    }
    if (patchProposal.target.path !== targetPath) {
        mismatch("The supplied target path must match the model proposal exactly");
    }
    const affectedNodeIds = new Set(brief.proposedChange.affectedProductNodeIds);
    const targetIsManifestSourced = manifest.nodes.some((node) => affectedNodeIds.has(node.id) &&
        node.provenance.sources.some((source) => source.path.replaceAll("\\", "/") === targetPath));
    if (!targetIsManifestSourced) {
        mismatch("The patch target must be sourced by an affected manifest product node");
    }
    const targetCandidate = patchProvenance.sourceCandidates.find((candidate) => candidate.path === targetPath);
    if (targetCandidate?.preimageHash !== patchProposal.target.preimageHash) {
        mismatch("Patch provenance must bind the exact proposed target and preimage hash");
    }
    if (briefProvenance.transport === "codex-cli") {
        if (briefProvenance.transportRequestedModel !== "gpt-5.6-terra" ||
            briefProvenance.responseId !== null ||
            briefProvenance.codexThreadId === null ||
            briefProvenance.localSessionPersisted !== false) {
            mismatch("Codex CLI model provenance is internally inconsistent");
        }
    }
    else if (briefProvenance.transportRequestedModel !== "gpt-5.6" ||
        briefProvenance.responseId === null ||
        briefProvenance.codexThreadId !== null ||
        briefProvenance.responseStoreRequested !== false) {
        mismatch("Responses API model provenance is internally inconsistent");
    }
}
function validateStoredState(state) {
    validateInputBindings(state.app, state.inputs.manifest, state.inputs.opportunity, state.inputs.brief, state.modelProvenance.brief, state.inputs.patchProposal, state.modelProvenance.patch, state.artifact.target.path);
    const expectedStorage = storagePaths(state.evolutionId);
    if (state.storage.directory !== expectedStorage.directory ||
        state.storage.statePath !== expectedStorage.statePath ||
        state.storage.receiptsPath !== expectedStorage.receiptsPath ||
        hashBytes(state.source.preimage) !== state.artifact.target.preimageHash ||
        hashBytes(state.source.postimage) !== state.artifact.target.postimageHash ||
        state.bindings.appHash !== hashJson(state.app)) {
        throw new SourceEvolutionError("STATE_TAMPERED", "Stored evolution source, paths, or input hashes no longer match");
    }
    let compiled;
    try {
        compiled = compileStoredModelPatchForIntegrity(state.inputs.patchProposal, state.source.preimage);
    }
    catch (error) {
        throw new SourceEvolutionError("STATE_TAMPERED", "Stored model proposal no longer compiles against its exact preimage", { cause: error });
    }
    if (compiled.postimage !== state.source.postimage ||
        compiled.postimageHash !== state.artifact.target.postimageHash) {
        throw new SourceEvolutionError("STATE_TAMPERED", "Stored postimage is not the deterministic result of its model proposal");
    }
}
function assertStateExecutablePatch(state) {
    const compiled = executablePatchCompiler(state.inputs.patchProposal, state.source.preimage);
    if (compiled.postimage !== state.source.postimage ||
        compiled.postimageHash !== state.artifact.target.postimageHash) {
        throw new SourceEvolutionError("STATE_TAMPERED", "The executable patch validation result does not match the stored postimage");
    }
}
const SOURCE_LIFECYCLE_RECEIPT_KINDS = new Set([
    "contract.confirmed",
    "activation.approved",
    "installation.activated",
    "installation.disabled",
    "installation.rolled-back",
]);
function lifecycleReceiptError(message) {
    throw new SourceEvolutionError("RECEIPT_CHAIN_INVALID", message);
}
function assertExactLifecycleReceipt(receipt, expected) {
    if (receipt === undefined ||
        receipt.kind !== expected.kind ||
        receipt.recordedAt !== expected.recordedAt ||
        canonicalJson(receipt.actor) !== canonicalJson(expected.actor) ||
        canonicalJson(receipt.refs) !== canonicalJson(expected.refs) ||
        canonicalJson(receipt.payload) !== canonicalJson(expected.payload)) {
        lifecycleReceiptError(`The '${expected.kind}' lifecycle receipt does not match its exact state binding`);
    }
}
function lifecycleRefs(state) {
    return {
        manifestHash: state.bindings.manifestHash,
        opportunityHash: state.bindings.opportunityHash,
        contractHash: state.contract.contentHash,
        artifactHash: state.artifact.contentHash,
        proofHash: state.proof.proofHash,
    };
}
function pointedReceiptIndex(receipts, receiptHash, label) {
    const index = receipts.findIndex((receipt) => receipt.receiptHash === receiptHash);
    if (index < 0) {
        lifecycleReceiptError(`The ${label} lifecycle pointer is absent from the receipt chain`);
    }
    return index;
}
const PREPARATION_RECEIPT_KINDS = new Set([
    "opportunity.detected",
    "hypothesis.created",
    "artifact.generated",
    "artifact.compiled",
    "proof.completed",
]);
function validatePreparationReceiptBindings(state, receipts) {
    const expectedKinds = [
        "opportunity.detected",
        "hypothesis.created",
        "artifact.generated",
        "artifact.compiled",
        "proof.completed",
    ];
    if (canonicalJson(receipts.slice(0, 5).map((receipt) => receipt.kind)) !==
        canonicalJson(expectedKinds) ||
        receipts
            .slice(5)
            .some((receipt) => PREPARATION_RECEIPT_KINDS.has(receipt.kind))) {
        lifecycleReceiptError("The receipt chain must contain one exact model-proposal preparation sequence");
    }
    const opportunityRefs = {
        manifestHash: state.bindings.manifestHash,
        opportunityHash: state.bindings.opportunityHash,
    };
    const artifactRefs = {
        ...opportunityRefs,
        contractHash: state.contract.contentHash,
        artifactHash: state.artifact.contentHash,
    };
    assertExactLifecycleReceipt(receipts[0], {
        kind: "opportunity.detected",
        actor: {
            type: "system",
            component: state.inputs.opportunity.detector.id,
            version: state.inputs.opportunity.detector.version,
        },
        recordedAt: state.createdAt,
        refs: opportunityRefs,
        payload: {
            sourceOpportunityId: state.inputs.opportunity.opportunityId,
            sourceDetectedAt: state.inputs.opportunity.detectedAt,
            bindingAction: "bound-existing-opportunity",
        },
    });
    assertExactLifecycleReceipt(receipts[1], {
        kind: "hypothesis.created",
        actor: {
            type: "model",
            provider: "openai",
            model: state.modelProvenance.brief.transportRequestedModel,
            runId: `model-run.${state.bindings.briefModelProvenanceHash.slice(7, 31)}`,
        },
        recordedAt: state.createdAt,
        refs: opportunityRefs,
        payload: {
            briefId: state.inputs.brief.briefId,
            briefHash: state.bindings.briefHash,
            modelProvenanceHash: state.bindings.briefModelProvenanceHash,
            transport: state.modelProvenance.brief.transport,
            briefRole: "evidence-interpretation-only",
        },
    });
    assertExactLifecycleReceipt(receipts[2], {
        kind: "artifact.generated",
        actor: {
            type: "model",
            provider: "openai",
            model: state.modelProvenance.patch.transportRequestedModel,
            runId: `model-run.${state.bindings.patchModelProvenanceHash.slice(7, 31)}`,
        },
        recordedAt: state.createdAt,
        refs: artifactRefs,
        payload: {
            proposalId: state.inputs.patchProposal.proposalId,
            proposalHash: state.bindings.patchProposalHash,
            targetPath: state.artifact.target.path,
            patchModelProvenanceHash: state.bindings.patchModelProvenanceHash,
            proposalRole: "untrusted-bounded-source-proposal",
            applicationAuthority: false,
        },
    });
    const compiled = compileStoredModelPatchForIntegrity(state.inputs.patchProposal, state.source.preimage);
    assertExactLifecycleReceipt(receipts[3], {
        kind: "artifact.compiled",
        actor: ENGINE_ACTOR,
        recordedAt: state.createdAt,
        refs: artifactRefs,
        payload: {
            policy: SOURCE_EVOLUTION_POLICY.key,
            targetPath: state.artifact.target.path,
            allowedFileCount: 1,
            generation: "deterministic-exact-anchor-compilation",
            proposalHash: state.bindings.patchProposalHash,
            editCount: compiled.diff.editCount,
            modelApplicationAuthority: false,
        },
    });
    assertExactLifecycleReceipt(receipts[4], {
        kind: "proof.completed",
        actor: ENGINE_ACTOR,
        recordedAt: state.createdAt,
        refs: { ...artifactRefs, proofHash: state.proof.proofHash },
        payload: {
            verdict: "passed",
            deterministicChecks: state.proof.checks.map((check) => check.id),
            preimageHash: state.artifact.target.preimageHash,
            postimageHash: state.artifact.target.postimageHash,
        },
    });
}
function validateLifecycleReceiptBindings(state, receipts) {
    const expectedKinds = state.status === "prepared"
        ? []
        : state.status === "approved"
            ? ["contract.confirmed", "activation.approved"]
            : state.status === "applied"
                ? [
                    "contract.confirmed",
                    "activation.approved",
                    "installation.activated",
                ]
                : [
                    "contract.confirmed",
                    "activation.approved",
                    "installation.activated",
                    "installation.rolled-back",
                ];
    const actualKinds = receipts
        .filter((receipt) => SOURCE_LIFECYCLE_RECEIPT_KINDS.has(receipt.kind))
        .map((receipt) => receipt.kind);
    if (canonicalJson(actualKinds) !== canonicalJson(expectedKinds)) {
        lifecycleReceiptError("The receipt chain lifecycle sequence contradicts the stored state");
    }
    const approval = state.approval;
    if (approval === null)
        return;
    if (approval.contractHash !== state.contract.contentHash ||
        approval.artifactHash !== state.artifact.contentHash ||
        approval.proofHash !== state.proof.proofHash) {
        lifecycleReceiptError("The stored approval hashes do not bind the exact contract, artifact, and proof");
    }
    const refs = lifecycleRefs(state);
    const approvalIndex = pointedReceiptIndex(receipts, approval.receiptHash, "approval");
    const approvalReceipt = receipts[approvalIndex];
    assertExactLifecycleReceipt(approvalReceipt, {
        kind: "activation.approved",
        actor: { type: "human", id: approval.humanId },
        recordedAt: approval.approvedAt,
        refs,
        payload: {
            decision: "approved-exact-artifact-and-proof",
            artifactHash: state.artifact.contentHash,
            proofHash: state.proof.proofHash,
        },
    });
    const contractReceipt = receipts[approvalIndex - 1];
    assertExactLifecycleReceipt(contractReceipt, {
        kind: "contract.confirmed",
        actor: { type: "human", id: approval.humanId },
        recordedAt: approval.approvedAt,
        refs,
        payload: {
            decision: "confirmed-exact-contract",
            contractHash: state.contract.contentHash,
        },
    });
    if (approvalReceipt.previousHash !== contractReceipt.receiptHash) {
        lifecycleReceiptError("Activation approval must immediately follow its exact human contract confirmation");
    }
    const application = state.application;
    if (application === null) {
        if (approvalReceipt.receiptHash !== state.chainHead) {
            lifecycleReceiptError("The approved state must end at its exact activation approval receipt");
        }
        return;
    }
    if (application.preimageHash !== state.artifact.target.preimageHash ||
        application.postimageHash !== state.artifact.target.postimageHash) {
        lifecycleReceiptError("The stored application hashes do not bind the exact source transition");
    }
    const applicationIndex = pointedReceiptIndex(receipts, application.receiptHash, "application");
    const applicationReceipt = receipts[applicationIndex];
    assertExactLifecycleReceipt(applicationReceipt, {
        kind: "installation.activated",
        actor: ENGINE_ACTOR,
        recordedAt: application.appliedAt,
        refs,
        payload: {
            targetPath: state.artifact.target.path,
            fromHash: state.artifact.target.preimageHash,
            toHash: state.artifact.target.postimageHash,
            approvedBy: approval.humanId,
        },
    });
    if (applicationIndex !== approvalIndex + 1 ||
        applicationReceipt.previousHash !== approvalReceipt.receiptHash) {
        lifecycleReceiptError("Source application must immediately follow its exact activation approval");
    }
    const rollback = state.rollback;
    if (rollback === null) {
        if (applicationReceipt.receiptHash !== state.chainHead) {
            lifecycleReceiptError("The applied state must end at its exact installation receipt");
        }
        return;
    }
    if (rollback.fromHash !== state.artifact.target.postimageHash ||
        rollback.toHash !== state.artifact.target.preimageHash) {
        lifecycleReceiptError("The stored rollback hashes do not bind the exact reverse source transition");
    }
    const rollbackIndex = pointedReceiptIndex(receipts, rollback.receiptHash, "rollback");
    const rollbackReceipt = receipts[rollbackIndex];
    assertExactLifecycleReceipt(rollbackReceipt, {
        kind: "installation.rolled-back",
        actor: { type: "human", id: rollback.humanId },
        recordedAt: rollback.rolledBackAt,
        refs,
        payload: {
            targetPath: state.artifact.target.path,
            fromHash: state.artifact.target.postimageHash,
            toHash: state.artifact.target.preimageHash,
            trigger: "explicit-human-rollback",
        },
    });
    if (rollbackIndex !== applicationIndex + 1 ||
        rollbackReceipt.previousHash !== applicationReceipt.receiptHash ||
        rollbackReceipt.receiptHash !== state.chainHead) {
        lifecycleReceiptError("Rollback must immediately follow and reverse the exact installation receipt");
    }
}
async function loadEvolution(rootInput, evolutionId) {
    validateEvolutionId(evolutionId);
    const root = await repositoryRoot(rootInput);
    const paths = storagePaths(evolutionId);
    try {
        await assertSafeDirectory(root, paths.directory);
    }
    catch (error) {
        if (error instanceof SourceEvolutionError &&
            error.code === "UNSAFE_TARGET" &&
            (await statOrUndefined(path.join(root, ...safeSegments(paths.directory)))) ===
                undefined) {
            throw new SourceEvolutionError("EVOLUTION_NOT_FOUND", `Evolution '${evolutionId}' does not exist`);
        }
        throw error;
    }
    const statePath = await assertSafeRegularFile(root, paths.statePath);
    const receiptsPath = await assertSafeRegularFile(root, paths.receiptsPath);
    let state;
    try {
        state = parseSourceEvolutionState(JSON.parse(await readFile(statePath, "utf8")));
        validateStoredState(state);
    }
    catch (error) {
        if (error instanceof SourceEvolutionError)
            throw error;
        throw new SourceEvolutionError("STATE_TAMPERED", "Evolution state failed strict validation", { cause: error });
    }
    if (state.evolutionId !== evolutionId) {
        throw new SourceEvolutionError("STATE_TAMPERED", "Evolution directory and state ids do not match");
    }
    const receipts = parseEvolutionReceiptStream(await readFile(receiptsPath, "utf8"), { appId: state.app.appId, evolutionId });
    const chainHead = receipts.at(-1)?.receiptHash;
    if (receipts.length !== state.receiptCount ||
        chainHead === undefined ||
        chainHead !== state.chainHead) {
        throw new SourceEvolutionError("RECEIPT_CHAIN_INVALID", "State lifecycle pointers do not match the receipt chain");
    }
    validatePreparationReceiptBindings(state, receipts);
    validateLifecycleReceiptBindings(state, receipts);
    return { root, state, receipts, statePath, receiptsPath };
}
let sourceEvolutionFaultInjector;
export function setSourceEvolutionFaultInjectorForTests(injector) {
    sourceEvolutionFaultInjector = injector;
}
async function injectFault(point) {
    await sourceEvolutionFaultInjector?.(point);
}
function transactionRelativePath(evolutionId) {
    return `${storagePaths(evolutionId).directory}/pending-transaction.json`;
}
function parsePendingTransaction(input) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction must be an object");
    }
    const record = input;
    const expectedKeys = [
        "additions",
        "appId",
        "base",
        "createdAt",
        "evolutionId",
        "nextState",
        "operation",
        "schemaVersion",
        "target",
        "transactionHash",
        "transactionId",
    ];
    if (Object.keys(record).sort().join("\0") !== expectedKeys.join("\0") ||
        record.schemaVersion !== "living.source-evolution-transaction/v2" ||
        typeof record.transactionId !== "string" ||
        typeof record.evolutionId !== "string" ||
        typeof record.appId !== "string" ||
        !["approve", "apply", "rollback"].includes(String(record.operation)) ||
        typeof record.createdAt !== "string" ||
        !Number.isFinite(Date.parse(record.createdAt)) ||
        typeof record.transactionHash !== "string") {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction has an invalid envelope");
    }
    identifierSchema.parse(record.transactionId);
    validateEvolutionId(record.evolutionId);
    const { transactionHash, ...content } = record;
    if (hashJson(content) !== transactionHash) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction hash does not match its content");
    }
    if (record.base === null ||
        typeof record.base !== "object" ||
        Array.isArray(record.base)) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction base is invalid");
    }
    const base = record.base;
    if (Object.keys(base).sort().join("\0") !==
        ["chainHead", "receiptCount", "stateHash"].join("\0") ||
        !Number.isSafeInteger(base.receiptCount) ||
        typeof base.chainHead !== "string" ||
        typeof base.stateHash !== "string") {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction CAS base is invalid");
    }
    if (!Array.isArray(record.additions) || record.additions.length === 0) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction must add at least one receipt");
    }
    const additions = record.additions.map((receipt) => evolutionReceiptSchema.parse(receipt));
    const nextState = parseSourceEvolutionState(record.nextState);
    validateStoredState(nextState);
    const operation = record.operation;
    const parsedBase = {
        receiptCount: base.receiptCount,
        chainHead: base.chainHead,
        stateHash: base.stateHash,
    };
    let previousHash = parsedBase.chainHead;
    for (const [index, receipt] of additions.entries()) {
        const { receiptHash, ...receiptContent } = receipt;
        if (receipt.appId !== record.appId ||
            receipt.evolutionId !== record.evolutionId ||
            receipt.sequence !== parsedBase.receiptCount + index ||
            receipt.previousHash !== previousHash ||
            receipt.payloadHash !== hashJson(receipt.payload) ||
            receiptHash !== hashJson(receiptContent)) {
            throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction receipt additions are not one exact chain");
        }
        previousHash = receipt.receiptHash;
    }
    if (nextState.evolutionId !== record.evolutionId ||
        nextState.app.appId !== record.appId ||
        nextState.receiptCount !== parsedBase.receiptCount + additions.length ||
        nextState.chainHead !== previousHash ||
        (operation === "approve" && nextState.status !== "approved") ||
        (operation === "apply" && nextState.status !== "applied") ||
        (operation === "rollback" && nextState.status !== "rolled-back")) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction next state contradicts its operation");
    }
    if (operation === "approve" || operation === "apply") {
        try {
            assertStateExecutablePatch(nextState);
        }
        catch (error) {
            throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending approval or application failed current executable-source validation", { cause: error });
        }
    }
    let target = null;
    if (record.target !== null) {
        if (typeof record.target !== "object" ||
            Array.isArray(record.target) ||
            Object.keys(record.target).sort().join("\0") !==
                ["fromHash", "path", "toHash"].join("\0")) {
            throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction target is invalid");
        }
        const candidate = record.target;
        if (typeof candidate.path !== "string" ||
            typeof candidate.fromHash !== "string" ||
            typeof candidate.toHash !== "string") {
            throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction target hashes are invalid");
        }
        target = {
            path: candidate.path,
            fromHash: candidate.fromHash,
            toHash: candidate.toHash,
        };
    }
    const expectedTarget = operation === "apply"
        ? {
            path: nextState.artifact.target.path,
            fromHash: nextState.artifact.target.preimageHash,
            toHash: nextState.artifact.target.postimageHash,
        }
        : operation === "rollback"
            ? {
                path: nextState.artifact.target.path,
                fromHash: nextState.artifact.target.postimageHash,
                toHash: nextState.artifact.target.preimageHash,
            }
            : null;
    if (canonicalJson(target) !== canonicalJson(expectedTarget)) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction target does not match its lifecycle operation");
    }
    return {
        schemaVersion: "living.source-evolution-transaction/v2",
        transactionId: record.transactionId,
        evolutionId: record.evolutionId,
        appId: record.appId,
        operation,
        base: parsedBase,
        additions,
        nextState,
        target,
        createdAt: record.createdAt,
        transactionHash: transactionHash,
    };
}
async function readPendingTransaction(root, evolutionId) {
    const relative = transactionRelativePath(evolutionId);
    const candidate = path.join(root, ...safeSegments(relative));
    if ((await statOrUndefined(candidate)) === undefined)
        return undefined;
    const transactionPath = await assertSafeRegularFile(root, relative);
    try {
        return {
            path: transactionPath,
            transaction: parsePendingTransaction(JSON.parse(await readFile(transactionPath, "utf8"))),
        };
    }
    catch (error) {
        if (error instanceof SourceEvolutionError)
            throw error;
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction cannot be parsed", { cause: error });
    }
}
function invokeObservationHook(hook) {
    try {
        hook?.();
    }
    catch {
        // Observation cannot influence transaction authority or recovery.
    }
}
async function recoverPendingTransaction(root, evolutionId, observation) {
    const pending = await readPendingTransaction(root, evolutionId);
    if (pending === undefined)
        return undefined;
    const { transaction } = pending;
    const paths = storagePaths(evolutionId);
    const statePath = await assertSafeRegularFile(root, paths.statePath);
    const receiptsPath = await assertSafeRegularFile(root, paths.receiptsPath);
    let currentState;
    try {
        currentState = parseSourceEvolutionState(JSON.parse(await readFile(statePath, "utf8")));
        validateStoredState(currentState);
    }
    catch (error) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Current state is invalid during transaction recovery", { cause: error });
    }
    const beforeState = currentState.receiptCount === transaction.base.receiptCount &&
        currentState.chainHead === transaction.base.chainHead &&
        hashJson(currentState) === transaction.base.stateHash;
    const afterState = canonicalJson(currentState) === canonicalJson(transaction.nextState);
    if (!beforeState && !afterState) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Current state is neither the exact before nor after transaction state");
    }
    const currentReceipts = parseEvolutionReceiptStream(await readFile(receiptsPath, "utf8"), { appId: transaction.appId, evolutionId });
    const baseReceipt = currentReceipts.at(transaction.base.receiptCount - 1);
    if (baseReceipt?.receiptHash !== transaction.base.chainHead ||
        currentReceipts.length < transaction.base.receiptCount ||
        currentReceipts.length > transaction.nextState.receiptCount) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Current receipt stream does not contain the transaction CAS base");
    }
    for (let sequence = transaction.base.receiptCount; sequence < currentReceipts.length; sequence += 1) {
        if (currentReceipts[sequence]?.receiptHash !==
            transaction.additions[sequence - transaction.base.receiptCount]?.receiptHash) {
            throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Current receipt suffix differs from the pending transaction");
        }
    }
    const finalReceipts = [
        ...currentReceipts.slice(0, transaction.base.receiptCount),
        ...transaction.additions,
    ];
    parseEvolutionReceiptStream(finalReceipts.map(serializeEvolutionReceipt).join(""), { appId: transaction.appId, evolutionId });
    validatePreparationReceiptBindings(transaction.nextState, finalReceipts);
    validateLifecycleReceiptBindings(transaction.nextState, finalReceipts);
    if (transaction.target !== null) {
        const fromContent = transaction.operation === "apply"
            ? transaction.nextState.source.preimage
            : transaction.nextState.source.postimage;
        const toContent = transaction.operation === "apply"
            ? transaction.nextState.source.postimage
            : transaction.nextState.source.preimage;
        const disposition = await atomicReplaceTarget(root, transaction.target.path, fromContent, transaction.target.fromHash, toContent, evolutionId, transaction.operation === "apply"
            ? "TARGET_PREIMAGE_MISMATCH"
            : "TARGET_POSTIMAGE_MISMATCH");
        if (disposition === "written") {
            invokeObservationHook(observation?.onTargetWritten);
        }
        await injectFault("after-target");
    }
    if (currentReceipts.length !== finalReceipts.length) {
        await replaceReceiptsFile(receiptsPath, finalReceipts);
    }
    await injectFault("after-receipts");
    if (!afterState) {
        await replaceStateFile(statePath, transaction.nextState);
    }
    await injectFault("after-state");
    const journalStats = await lstat(pending.path);
    if (!journalStats.isFile() || journalStats.isSymbolicLink()) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction journal changed before completion");
    }
    await unlink(pending.path);
    return transaction.nextState;
}
async function installPendingTransaction(transactionPath, transaction) {
    if ((await statOrUndefined(transactionPath)) !== undefined) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "A pending transaction already exists after locked recovery");
    }
    const temporary = `${transactionPath}.${randomUUID()}.tmp`;
    try {
        await writeNewFile(temporary, `${canonicalJson(transaction)}\n`);
        if ((await statOrUndefined(transactionPath)) !== undefined) {
            throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "A pending transaction appeared before journal publication");
        }
        await rename(temporary, transactionPath);
    }
    catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
}
async function commitLifecycleTransaction(loaded, nextState, additions, operation, target, observation) {
    if (target !== null) {
        await readExpectedTarget(loaded.root, target.path, operation === "apply"
            ? nextState.source.preimage
            : nextState.source.postimage, target.fromHash, operation === "apply"
            ? "TARGET_PREIMAGE_MISMATCH"
            : "TARGET_POSTIMAGE_MISMATCH");
        invokeObservationHook(observation?.onTargetVerified);
    }
    const content = {
        schemaVersion: "living.source-evolution-transaction/v2",
        transactionId: `transaction.${operation}.${nextState.chainHead.slice(7, 31)}`,
        evolutionId: loaded.state.evolutionId,
        appId: loaded.state.app.appId,
        operation,
        base: {
            receiptCount: loaded.state.receiptCount,
            chainHead: loaded.state.chainHead,
            stateHash: hashJson(loaded.state),
        },
        additions,
        nextState,
        target,
        createdAt: nextState.updatedAt,
    };
    const transaction = parsePendingTransaction({
        ...content,
        transactionHash: hashJson(content),
    });
    const relative = transactionRelativePath(loaded.state.evolutionId);
    const transactionPath = path.join(loaded.root, ...safeSegments(relative));
    await installPendingTransaction(transactionPath, transaction);
    await injectFault("after-journal");
    const recovered = await recoverPendingTransaction(loaded.root, loaded.state.evolutionId, observation);
    if (recovered === undefined) {
        throw new SourceEvolutionError("TRANSACTION_RECOVERY_FAILED", "Pending transaction disappeared before completion");
    }
    return recovered;
}
function makeContract(targetPath) {
    const content = {
        schemaVersion: "living.source-evolution-contract/v2",
        policy: SOURCE_EVOLUTION_POLICY,
        target: {
            path: targetPath,
            allowedFileCount: 1,
            mutationMode: "exact-model-edit-program",
        },
        prohibitions: [...SOURCE_EVOLUTION_PROHIBITIONS],
        deterministicTests: [...SOURCE_EVOLUTION_TESTS],
        generation: {
            kind: "model-proposed-bounded-edits",
            modelOutputAcceptedAsProposal: true,
            modelApplicationAuthority: false,
            filesystemAuthorityOwnedByEngine: true,
            arbitraryCodeAccepted: false,
            gitInvocationAllowed: false,
        },
        approval: {
            humanRequired: true,
            bindsExactContractArtifactAndProof: true,
        },
        rollback: {
            required: true,
            condition: "exact-postimage-only",
        },
    };
    return sourceEvolutionContractSchema.parse({
        ...content,
        contentHash: hashJson(content),
    });
}
function appendReceipt(receipts, input) {
    const receipt = buildEvolutionReceipt({
        ...input,
        sequence: receipts.length,
        previousHash: receipts.at(-1)?.receiptHash ?? null,
    });
    receipts.push(receipt);
    return receipt;
}
export async function prepareSourceEvolution(input) {
    const app = sourceEvolutionApplicationSchema.parse(input.app);
    const manifest = productManifestSchema.parse(input.manifest);
    const opportunity = opportunitySchema.parse(input.opportunity);
    const brief = gpt56EvolutionBriefSchema.parse(input.brief);
    const briefModelProvenance = intelligenceProvenanceSchema.parse(input.briefModelProvenance);
    const patchProposal = sourcePatchProposalSchema.parse(input.patchProposal);
    const patchModelProvenance = sourcePatchModelProvenanceSchema.parse(input.patchModelProvenance);
    validateInputBindings(app, manifest, opportunity, brief, briefModelProvenance, patchProposal, patchModelProvenance, input.target.path);
    const root = await repositoryRoot(input.root);
    await validateInstalledHost(root, app);
    const preimageHash = hashBytes(input.target.preimage);
    if (patchProposal.target.preimageHash !== preimageHash) {
        throw new SourceEvolutionError("TARGET_PREIMAGE_MISMATCH", "The proposal is not bound to the exact supplied target preimage");
    }
    await readExpectedTarget(root, input.target.path, input.target.preimage, preimageHash, "TARGET_PREIMAGE_MISMATCH");
    const identityHash = hashJson({
        schemaVersion: "living.source-evolution-identity/v2",
        policy: SOURCE_EVOLUTION_POLICY,
        app,
        manifest,
        opportunity,
        brief,
        briefModelProvenance,
        patchProposal,
        patchModelProvenance,
        target: { path: input.target.path, preimageHash },
    });
    const evolutionId = `evolution.source.v2.${identityHash.slice(7, 31)}`;
    observeProgress(input.progress, {
        stage: "prepare.compilation-started",
        evolutionId,
        targetPath: input.target.path,
        preimageHash,
    });
    const compiled = executablePatchCompiler(patchProposal, input.target.preimage);
    const postimage = compiled.postimage;
    const postimageHash = compiled.postimageHash;
    const appHash = hashJson(app);
    const manifestInputHash = hashJson(manifest);
    const opportunityHash = hashJson(opportunity);
    const briefHash = hashJson(brief);
    const briefModelProvenanceHash = hashJson(briefModelProvenance);
    const patchProposalHash = hashJson(patchProposal);
    const patchModelProvenanceHash = hashJson(patchModelProvenance);
    const bindings = {
        appHash,
        manifestHash: manifest.contentHash,
        manifestInputHash,
        opportunityId: opportunity.opportunityId,
        opportunityHash,
        briefId: brief.briefId,
        briefHash,
        briefModelProvenanceHash,
        patchProposalId: patchProposal.proposalId,
        patchProposalHash,
        patchModelProvenanceHash,
    };
    const contract = makeContract(input.target.path);
    const artifactContent = {
        schemaVersion: "living.source-evolution-artifact/v2",
        artifactId: `artifact.source.v2.${identityHash.slice(7, 31)}`,
        policy: SOURCE_EVOLUTION_POLICY,
        contractHash: contract.contentHash,
        bindings,
        generation: {
            proposalOrigin: "gpt-5.6",
            proposalRole: "untrusted-bounded-source-proposal",
            compiler: "exact-anchor-engine/v1",
            modelAppliedSource: false,
        },
        target: {
            path: input.target.path,
            allowedFileCount: 1,
            preimageHash,
            postimageHash,
        },
        transform: "bounded-exact-anchor-edits/v1",
    };
    const artifact = sourceEvolutionArtifactSchema.parse({
        ...artifactContent,
        contentHash: hashJson(artifactContent),
    });
    observeProgress(input.progress, {
        stage: "prepare.proof-started",
        evolutionId,
        targetPath: input.target.path,
        artifactHash: artifact.contentHash,
        preimageHash,
        postimageHash,
    });
    const proofContent = {
        schemaVersion: "living.source-evolution-proof/v2",
        proofId: `proof.source.v2.${artifact.contentHash.slice(7, 31)}`,
        contractHash: contract.contentHash,
        artifactHash: artifact.contentHash,
        target: { path: input.target.path, preimageHash, postimageHash },
        checks: [
            {
                id: "binding.exact",
                status: "passed",
                detail: "Application, manifest, opportunity, brief, proposal, and both model runs are hash-bound.",
            },
            {
                id: "target.manifest-sourced",
                status: "passed",
                detail: "The target is sourced by a manifest node named in the brief's affected nodes.",
            },
            ...compiled.checks,
            {
                id: "authority.engine-owned",
                status: "passed",
                detail: "The model proposed edits only; deterministic engine and human approval retain mutation authority.",
            },
            {
                id: "rollback.exact-postimage",
                status: "passed",
                detail: "Rollback is allowed only from the exact compiled postimage hash.",
            },
        ],
        verdict: "passed",
    };
    const proof = sourceEvolutionProofSchema.parse({
        ...proofContent,
        proofHash: hashJson(proofContent),
    });
    for (const check of proof.checks) {
        observeProgress(input.progress, {
            stage: "prepare.proof-check-completed",
            evolutionId,
            artifactHash: artifact.contentHash,
            proofHash: proof.proofHash,
            checkId: check.id,
            detail: check.detail,
        });
    }
    const recordedAt = now(input.clock);
    const receipts = [];
    appendReceipt(receipts, {
        appId: app.appId,
        evolutionId,
        recordedAt,
        kind: "opportunity.detected",
        actor: {
            type: "system",
            component: opportunity.detector.id,
            version: opportunity.detector.version,
        },
        refs: { manifestHash: manifest.contentHash, opportunityHash },
        payload: {
            sourceOpportunityId: opportunity.opportunityId,
            sourceDetectedAt: opportunity.detectedAt,
            bindingAction: "bound-existing-opportunity",
        },
    });
    appendReceipt(receipts, {
        appId: app.appId,
        evolutionId,
        recordedAt,
        kind: "hypothesis.created",
        actor: {
            type: "model",
            provider: "openai",
            model: briefModelProvenance.transportRequestedModel,
            runId: `model-run.${briefModelProvenanceHash.slice(7, 31)}`,
        },
        refs: { manifestHash: manifest.contentHash, opportunityHash },
        payload: {
            briefId: brief.briefId,
            briefHash,
            modelProvenanceHash: briefModelProvenanceHash,
            transport: briefModelProvenance.transport,
            briefRole: "evidence-interpretation-only",
        },
    });
    appendReceipt(receipts, {
        appId: app.appId,
        evolutionId,
        recordedAt,
        kind: "artifact.generated",
        actor: {
            type: "model",
            provider: "openai",
            model: patchModelProvenance.transportRequestedModel,
            runId: `model-run.${patchModelProvenanceHash.slice(7, 31)}`,
        },
        refs: {
            manifestHash: manifest.contentHash,
            opportunityHash,
            contractHash: contract.contentHash,
            artifactHash: artifact.contentHash,
        },
        payload: {
            proposalId: patchProposal.proposalId,
            proposalHash: patchProposalHash,
            targetPath: input.target.path,
            patchModelProvenanceHash,
            proposalRole: "untrusted-bounded-source-proposal",
            applicationAuthority: false,
        },
    });
    appendReceipt(receipts, {
        appId: app.appId,
        evolutionId,
        recordedAt,
        kind: "artifact.compiled",
        actor: ENGINE_ACTOR,
        refs: {
            manifestHash: manifest.contentHash,
            opportunityHash,
            contractHash: contract.contentHash,
            artifactHash: artifact.contentHash,
        },
        payload: {
            policy: SOURCE_EVOLUTION_POLICY.key,
            targetPath: input.target.path,
            allowedFileCount: 1,
            generation: "deterministic-exact-anchor-compilation",
            proposalHash: patchProposalHash,
            editCount: compiled.diff.editCount,
            modelApplicationAuthority: false,
        },
    });
    appendReceipt(receipts, {
        appId: app.appId,
        evolutionId,
        recordedAt,
        kind: "proof.completed",
        actor: ENGINE_ACTOR,
        refs: {
            manifestHash: manifest.contentHash,
            opportunityHash,
            contractHash: contract.contentHash,
            artifactHash: artifact.contentHash,
            proofHash: proof.proofHash,
        },
        payload: {
            verdict: "passed",
            deterministicChecks: proof.checks.map((check) => check.id),
            preimageHash,
            postimageHash,
        },
    });
    const storage = storagePaths(evolutionId);
    const state = parseSourceEvolutionState({
        schemaVersion: "living.source-evolution-state/v2",
        evolutionId,
        app,
        status: "prepared",
        bindings,
        inputs: { manifest, opportunity, brief, patchProposal },
        modelProvenance: {
            brief: briefModelProvenance,
            patch: patchModelProvenance,
        },
        contract,
        artifact,
        proof,
        source: { preimage: input.target.preimage, postimage },
        approval: null,
        application: null,
        rollback: null,
        storage,
        receiptCount: receipts.length,
        chainHead: receipts.at(-1)?.receiptHash,
        createdAt: recordedAt,
        updatedAt: recordedAt,
    });
    const storageRoot = await ensureSafeDirectory(root, STORAGE_ROOT);
    const evolutionDirectory = path.join(storageRoot, evolutionId);
    try {
        await mkdir(evolutionDirectory);
    }
    catch (error) {
        if (error.code === "EEXIST") {
            throw new SourceEvolutionError("EVOLUTION_ALREADY_EXISTS", `Evolution '${evolutionId}' has already been prepared`);
        }
        throw error;
    }
    const statePath = path.join(evolutionDirectory, "state.json");
    const receiptsPath = path.join(evolutionDirectory, "receipts.ndjson");
    await writeNewFile(receiptsPath, receipts.map(serializeEvolutionReceipt).join(""));
    await writeNewFile(statePath, `${canonicalJson(state)}\n`);
    observeProgress(input.progress, {
        stage: "prepare.persisted",
        evolutionId,
        revision: state.receiptCount,
        chainHead: state.chainHead,
        artifactHash: state.artifact.contentHash,
        proofHash: state.proof.proofHash,
    });
    return state;
}
async function approveSourceEvolutionUnlocked(input) {
    const humanId = identifierSchema.parse(input.humanId);
    const loaded = await loadEvolution(input.root, input.evolutionId);
    const { state } = loaded;
    assertExpectedRevision(state, input.expectedRevision);
    if (state.status !== "prepared") {
        throw new SourceEvolutionError("EVOLUTION_REPLAY_REJECTED", `Approval is valid only from prepared state, not '${state.status}'`);
    }
    if (input.expectedArtifactHash !== state.artifact.contentHash ||
        input.expectedProofHash !== state.proof.proofHash) {
        throw new SourceEvolutionError("APPROVAL_HASH_MISMATCH", "Human approval hashes do not match the exact prepared artifact and proof");
    }
    assertStateExecutablePatch(state);
    observeProgress(input.progress, {
        stage: "approve.hashes-selected",
        evolutionId: state.evolutionId,
        revision: state.receiptCount,
        humanId,
        contractHash: state.contract.contentHash,
        artifactHash: state.artifact.contentHash,
        proofHash: state.proof.proofHash,
    });
    const recordedAt = now(input.clock);
    const additions = [];
    let previousHash = loaded.receipts.at(-1)?.receiptHash ?? null;
    for (const [kind, payload] of [
        [
            "contract.confirmed",
            {
                decision: "confirmed-exact-contract",
                contractHash: state.contract.contentHash,
            },
        ],
        [
            "activation.approved",
            {
                decision: "approved-exact-artifact-and-proof",
                artifactHash: state.artifact.contentHash,
                proofHash: state.proof.proofHash,
            },
        ],
    ]) {
        const receipt = buildEvolutionReceipt({
            appId: state.app.appId,
            evolutionId: state.evolutionId,
            sequence: state.receiptCount + additions.length,
            previousHash,
            recordedAt,
            kind,
            actor: { type: "human", id: humanId },
            refs: {
                manifestHash: state.bindings.manifestHash,
                opportunityHash: state.bindings.opportunityHash,
                contractHash: state.contract.contentHash,
                artifactHash: state.artifact.contentHash,
                proofHash: state.proof.proofHash,
            },
            payload: payload,
        });
        additions.push(receipt);
        previousHash = receipt.receiptHash;
    }
    const approvalReceipt = additions.at(-1);
    if (approvalReceipt === undefined) {
        throw new SourceEvolutionError("STATE_TAMPERED", "Approval receipt generation failed");
    }
    const next = parseSourceEvolutionState({
        ...state,
        status: "approved",
        approval: {
            humanId,
            approvedAt: recordedAt,
            contractHash: state.contract.contentHash,
            artifactHash: state.artifact.contentHash,
            proofHash: state.proof.proofHash,
            receiptHash: approvalReceipt.receiptHash,
        },
        receiptCount: state.receiptCount + additions.length,
        chainHead: approvalReceipt.receiptHash,
        updatedAt: recordedAt,
    });
    const approved = await commitLifecycleTransaction(loaded, next, additions, "approve", null);
    observeProgress(input.progress, {
        stage: "approve.receipts-persisted",
        evolutionId: approved.evolutionId,
        revision: approved.receiptCount,
        humanId,
        chainHead: approved.chainHead,
        approvalReceiptHash: approvalReceipt.receiptHash,
    });
    return approved;
}
async function applySourceEvolutionUnlocked(input) {
    const loaded = await loadEvolution(input.root, input.evolutionId);
    const { state } = loaded;
    assertExpectedRevision(state, input.expectedRevision);
    if (state.status === "prepared") {
        throw new SourceEvolutionError("APPROVAL_REQUIRED", "A human must approve the exact artifact and proof before application");
    }
    if (state.status !== "approved" || state.approval === null) {
        throw new SourceEvolutionError("EVOLUTION_REPLAY_REJECTED", `Application is valid only from approved state, not '${state.status}'`);
    }
    if (state.approval.contractHash !== state.contract.contentHash ||
        state.approval.artifactHash !== state.artifact.contentHash ||
        state.approval.proofHash !== state.proof.proofHash) {
        throw new SourceEvolutionError("APPROVAL_HASH_MISMATCH", "Stored human approval is not sealed to this exact evolution");
    }
    assertStateExecutablePatch(state);
    // Approval is bound to the installed application identity as well as the
    // exact source bytes. Re-check at the mutation boundary so a copied ledger
    // or an uninstall/reinstall drift cannot authorize another host.
    await validateInstalledHost(loaded.root, state.app);
    observeProgress(input.progress, {
        stage: "apply.artifact-selected",
        evolutionId: state.evolutionId,
        revision: state.receiptCount,
        targetPath: state.artifact.target.path,
        artifactHash: state.artifact.contentHash,
        preimageHash: state.artifact.target.preimageHash,
        postimageHash: state.artifact.target.postimageHash,
    });
    const recordedAt = now(input.clock);
    const receipt = buildEvolutionReceipt({
        appId: state.app.appId,
        evolutionId: state.evolutionId,
        sequence: state.receiptCount,
        previousHash: state.chainHead,
        recordedAt,
        kind: "installation.activated",
        actor: ENGINE_ACTOR,
        refs: {
            manifestHash: state.bindings.manifestHash,
            opportunityHash: state.bindings.opportunityHash,
            contractHash: state.contract.contentHash,
            artifactHash: state.artifact.contentHash,
            proofHash: state.proof.proofHash,
        },
        payload: {
            targetPath: state.artifact.target.path,
            fromHash: state.artifact.target.preimageHash,
            toHash: state.artifact.target.postimageHash,
            approvedBy: state.approval.humanId,
        },
    });
    const next = parseSourceEvolutionState({
        ...state,
        status: "applied",
        application: {
            appliedAt: recordedAt,
            preimageHash: state.artifact.target.preimageHash,
            postimageHash: state.artifact.target.postimageHash,
            receiptHash: receipt.receiptHash,
        },
        receiptCount: state.receiptCount + 1,
        chainHead: receipt.receiptHash,
        updatedAt: recordedAt,
    });
    const applied = await commitLifecycleTransaction(loaded, next, [receipt], "apply", {
        path: state.artifact.target.path,
        fromHash: state.artifact.target.preimageHash,
        toHash: state.artifact.target.postimageHash,
    }, {
        onTargetVerified: () => observeProgress(input.progress, {
            stage: "apply.preimage-verified",
            evolutionId: state.evolutionId,
            targetPath: state.artifact.target.path,
            preimageHash: state.artifact.target.preimageHash,
        }),
        onTargetWritten: () => observeProgress(input.progress, {
            stage: "apply.postimage-written",
            evolutionId: state.evolutionId,
            targetPath: state.artifact.target.path,
            postimageHash: state.artifact.target.postimageHash,
        }),
    });
    observeProgress(input.progress, {
        stage: "apply.receipt-state-persisted",
        evolutionId: applied.evolutionId,
        revision: applied.receiptCount,
        chainHead: applied.chainHead,
        receiptHash: receipt.receiptHash,
    });
    try {
        await readExpectedTarget(loaded.root, state.artifact.target.path, state.source.postimage, state.artifact.target.postimageHash, "TARGET_POSTIMAGE_MISMATCH");
        observeProgress(input.progress, {
            stage: "apply.hash-transition-completed",
            evolutionId: applied.evolutionId,
            targetPath: state.artifact.target.path,
            fromHash: state.artifact.target.preimageHash,
            toHash: state.artifact.target.postimageHash,
        });
    }
    catch {
        // A post-commit observation race cannot roll back or invalidate a durable
        // transition. Absence of the event truthfully leaves verification open.
    }
    return applied;
}
async function rollbackSourceEvolutionUnlocked(input) {
    const humanId = identifierSchema.parse(input.humanId);
    const loaded = await loadEvolution(input.root, input.evolutionId);
    const { state } = loaded;
    assertExpectedRevision(state, input.expectedRevision);
    if (state.status !== "applied" || state.application === null) {
        throw new SourceEvolutionError("EVOLUTION_REPLAY_REJECTED", `Rollback is valid only from applied state, not '${state.status}'`);
    }
    observeProgress(input.progress, {
        stage: "rollback.artifact-selected",
        evolutionId: state.evolutionId,
        revision: state.receiptCount,
        targetPath: state.artifact.target.path,
        artifactHash: state.artifact.contentHash,
        postimageHash: state.artifact.target.postimageHash,
        preimageHash: state.artifact.target.preimageHash,
    });
    const recordedAt = now(input.clock);
    const receipt = buildEvolutionReceipt({
        appId: state.app.appId,
        evolutionId: state.evolutionId,
        sequence: state.receiptCount,
        previousHash: state.chainHead,
        recordedAt,
        kind: "installation.rolled-back",
        actor: { type: "human", id: humanId },
        refs: {
            manifestHash: state.bindings.manifestHash,
            opportunityHash: state.bindings.opportunityHash,
            contractHash: state.contract.contentHash,
            artifactHash: state.artifact.contentHash,
            proofHash: state.proof.proofHash,
        },
        payload: {
            targetPath: state.artifact.target.path,
            fromHash: state.artifact.target.postimageHash,
            toHash: state.artifact.target.preimageHash,
            trigger: "explicit-human-rollback",
        },
    });
    const next = parseSourceEvolutionState({
        ...state,
        status: "rolled-back",
        rollback: {
            humanId,
            rolledBackAt: recordedAt,
            fromHash: state.artifact.target.postimageHash,
            toHash: state.artifact.target.preimageHash,
            receiptHash: receipt.receiptHash,
        },
        receiptCount: state.receiptCount + 1,
        chainHead: receipt.receiptHash,
        updatedAt: recordedAt,
    });
    const rolledBack = await commitLifecycleTransaction(loaded, next, [receipt], "rollback", {
        path: state.artifact.target.path,
        fromHash: state.artifact.target.postimageHash,
        toHash: state.artifact.target.preimageHash,
    }, {
        onTargetVerified: () => observeProgress(input.progress, {
            stage: "rollback.postimage-verified",
            evolutionId: state.evolutionId,
            targetPath: state.artifact.target.path,
            postimageHash: state.artifact.target.postimageHash,
        }),
        onTargetWritten: () => observeProgress(input.progress, {
            stage: "rollback.preimage-written",
            evolutionId: state.evolutionId,
            targetPath: state.artifact.target.path,
            preimageHash: state.artifact.target.preimageHash,
        }),
    });
    observeProgress(input.progress, {
        stage: "rollback.receipt-state-persisted",
        evolutionId: rolledBack.evolutionId,
        revision: rolledBack.receiptCount,
        chainHead: rolledBack.chainHead,
        receiptHash: receipt.receiptHash,
    });
    try {
        await readExpectedTarget(loaded.root, state.artifact.target.path, state.source.preimage, state.artifact.target.preimageHash, "TARGET_PREIMAGE_MISMATCH");
        observeProgress(input.progress, {
            stage: "rollback.hash-transition-completed",
            evolutionId: rolledBack.evolutionId,
            targetPath: state.artifact.target.path,
            fromHash: state.artifact.target.postimageHash,
            toHash: state.artifact.target.preimageHash,
        });
    }
    catch {
        // See apply: post-commit verification is informative, never authority.
    }
    return rolledBack;
}
async function getEvolutionStatusUnlocked(root, evolutionId) {
    return (await loadEvolution(root, evolutionId)).state;
}
/**
 * Read a fully committed evolution without acquiring a mutation lease.
 *
 * A pending journal is the only state that requires recovery and therefore
 * write authority. Settled state and receipts are already hash-linked and
 * strictly validated by loadEvolution. The second journal check closes the
 * race where a writer publishes a transaction while the snapshot is read.
 * A single retry tolerates a transaction that completed between inconsistent
 * state/receipt reads without hiding a persistent integrity failure.
 */
async function loadSettledEvolutionReadOnly(rootInput, evolutionId) {
    validateEvolutionId(evolutionId);
    const root = await repositoryRoot(rootInput);
    const pending = async () => (await readPendingTransaction(root, evolutionId)) !== undefined;
    const readOnce = async () => {
        const loaded = await loadEvolution(root, evolutionId);
        return (await pending()) ? undefined : loaded;
    };
    try {
        return await readOnce();
    }
    catch (firstError) {
        if (firstError instanceof SourceEvolutionError &&
            (firstError.code === "EVOLUTION_NOT_FOUND" ||
                firstError.code === "UNSAFE_TARGET")) {
            throw firstError;
        }
        if (await pending())
            return undefined;
        try {
            return await readOnce();
        }
        catch (secondError) {
            if (await pending())
                return undefined;
            throw secondError;
        }
    }
}
async function readEvolutionApplicationIdentity(rootInput, evolutionId) {
    validateEvolutionId(evolutionId);
    const root = await repositoryRoot(rootInput);
    const paths = storagePaths(evolutionId);
    await assertSafeDirectory(root, paths.directory);
    const statePath = await assertSafeRegularFile(root, paths.statePath);
    let state;
    try {
        state = parseSourceEvolutionState(JSON.parse(await readFile(statePath, "utf8")));
        validateStoredState(state);
    }
    catch (error) {
        if (error instanceof SourceEvolutionError)
            throw error;
        throw new SourceEvolutionError("STATE_TAMPERED", "Evolution state failed strict validation while deriving its application lock", { cause: error });
    }
    if (state.evolutionId !== evolutionId) {
        throw new SourceEvolutionError("STATE_TAMPERED", "Evolution directory and state ids do not match");
    }
    return { root, appId: state.app.appId };
}
async function applicationEvolutionStates(root, appId) {
    const base = path.join(root, ...safeSegments(STORAGE_ROOT));
    await assertSafeDirectory(root, STORAGE_ROOT);
    const entries = await readdir(base, { withFileTypes: true });
    const states = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!EVOLUTION_ID.test(entry.name))
            continue;
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
            throw new SourceEvolutionError("UNSAFE_TARGET", `Evolution storage entry is not a real directory: ${entry.name}`);
        }
        const identity = await readEvolutionApplicationIdentity(root, entry.name);
        if (identity.appId !== appId)
            continue;
        const state = await withEvolutionLock(root, entry.name, () => getEvolutionStatusUnlocked(root, entry.name));
        if (state.app.appId !== appId) {
            throw new SourceEvolutionError("STORAGE_CONFLICT", "An evolution changed application identity while its application lock was held");
        }
        states.push(state);
    }
    return states;
}
async function withApplicationMutationLock(root, evolutionId, rejectActiveSibling, action) {
    const identity = await readEvolutionApplicationIdentity(root, evolutionId);
    const applicationLock = await acquireApplicationLock(identity.root, identity.appId);
    try {
        if (rejectActiveSibling) {
            const states = await applicationEvolutionStates(applicationLock.root, identity.appId);
            const conflict = states.find((state) => state.evolutionId !== evolutionId &&
                (state.status === "approved" || state.status === "applied"));
            if (conflict !== undefined) {
                throw new SourceEvolutionError("INVALID_TRANSITION", `Application '${identity.appId}' already has active sibling evolution '${conflict.evolutionId}' in '${conflict.status}' state`);
            }
        }
        return await withEvolutionLock(applicationLock.root, evolutionId, async () => {
            const state = await getEvolutionStatusUnlocked(applicationLock.root, evolutionId);
            if (state.app.appId !== identity.appId) {
                throw new SourceEvolutionError("STORAGE_CONFLICT", "The evolution changed application identity before mutation");
            }
            return action();
        });
    }
    finally {
        await releaseLeaseLock(applicationLock);
    }
}
export async function approveSourceEvolution(input) {
    return withApplicationMutationLock(input.root, input.evolutionId, true, () => approveSourceEvolutionUnlocked(input));
}
export async function applySourceEvolution(input) {
    return withApplicationMutationLock(input.root, input.evolutionId, true, () => applySourceEvolutionUnlocked(input));
}
export async function rollbackSourceEvolution(input) {
    return withApplicationMutationLock(input.root, input.evolutionId, false, () => rollbackSourceEvolutionUnlocked(input));
}
export async function getEvolutionStatus(root, evolutionId) {
    const settled = await loadSettledEvolutionReadOnly(root, evolutionId);
    if (settled !== undefined)
        return settled.state;
    return withEvolutionLock(root, evolutionId, () => getEvolutionStatusUnlocked(root, evolutionId));
}
export async function getEvolutionReceipts(root, evolutionId) {
    const settled = await loadSettledEvolutionReadOnly(root, evolutionId);
    if (settled !== undefined) {
        return Object.freeze([...settled.receipts]);
    }
    return withEvolutionLock(root, evolutionId, async () => {
        const loaded = await loadEvolution(root, evolutionId);
        return Object.freeze([...loaded.receipts]);
    });
}
export async function listEvolutionStatuses(rootInput) {
    const root = await repositoryRoot(rootInput);
    const base = path.join(root, ...safeSegments(STORAGE_ROOT));
    if ((await statOrUndefined(base)) === undefined)
        return [];
    await assertSafeDirectory(root, STORAGE_ROOT);
    const entries = await readdir(base, { withFileTypes: true });
    const summaries = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!EVOLUTION_ID.test(entry.name))
            continue;
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
            throw new SourceEvolutionError("UNSAFE_TARGET", `Evolution storage entry is not a real directory: ${entry.name}`);
        }
        const state = await getEvolutionStatus(root, entry.name);
        summaries.push(sourceEvolutionSummarySchema.parse({
            evolutionId: state.evolutionId,
            appId: state.app.appId,
            status: state.status,
            targetPath: state.artifact.target.path,
            artifactHash: state.artifact.contentHash,
            proofHash: state.proof.proofHash,
            updatedAt: state.updatedAt,
        }));
    }
    return summaries;
}
//# sourceMappingURL=lifecycle.js.map