import { randomUUID } from "node:crypto";
import {
  lstat,
  link,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import {
  evolutionReceiptSchema,
  gpt56EvolutionBriefSchema,
  identifierSchema,
  installRecordSchema,
  intelligenceProvenanceSchema,
  opportunitySchema,
  productManifestSchema,
  type EvolutionReceipt,
  type Gpt56EvolutionBrief,
  type IntelligenceProvenance,
  type JsonObject,
  type Opportunity,
  type ProductManifest,
  type Sha256,
} from "@living-software/contracts";

import {
  compileLeadReviewNavigation,
  verifyLeadReviewNavigation,
} from "./adapter.js";
import { canonicalJson, hashBytes, hashJson } from "./canonical.js";
import {
  SOURCE_EVOLUTION_ADAPTER,
  SOURCE_EVOLUTION_PROHIBITIONS,
  SOURCE_EVOLUTION_TARGET_PATH,
  parseSourceEvolutionState,
  sourceEvolutionApplicationSchema,
  sourceEvolutionArtifactSchema,
  sourceEvolutionContractSchema,
  sourceEvolutionProofSchema,
  sourceEvolutionSummarySchema,
  type SourceEvolutionApplication,
  type SourceEvolutionArtifact,
  type SourceEvolutionContract,
  type SourceEvolutionProof,
  type SourceEvolutionState,
  type SourceEvolutionSummary,
} from "./contracts.js";
import { SourceEvolutionError } from "./errors.js";
import {
  buildEvolutionReceipt,
  parseEvolutionReceiptStream,
  serializeEvolutionReceipt,
} from "./receipts.js";

const EVOLUTION_ID = /^evolution\.source\.[a-f0-9]{24}$/u;
const STORAGE_ROOT = ".living/data/evolutions";
const ENGINE_ACTOR = {
  type: "system",
  component: "source-evolution-engine",
  version: "0.1.0",
} as const;

type Clock = () => Date;

export type PrepareSourceEvolutionInput = Readonly<{
  root: string;
  app: SourceEvolutionApplication;
  manifest: ProductManifest;
  opportunity: Opportunity;
  brief: Gpt56EvolutionBrief;
  modelProvenance: IntelligenceProvenance;
  target: Readonly<{
    path: typeof SOURCE_EVOLUTION_TARGET_PATH;
    preimage: string;
  }>;
  clock?: Clock;
}>;

export type ApproveSourceEvolutionInput = Readonly<{
  root: string;
  evolutionId: string;
  humanId: string;
  expectedArtifactHash: Sha256;
  expectedProofHash: Sha256;
  expectedRevision: number;
  clock?: Clock;
}>;

export type ApplySourceEvolutionInput = Readonly<{
  root: string;
  evolutionId: string;
  expectedRevision: number;
  clock?: Clock;
}>;

export type RollbackSourceEvolutionInput = Readonly<{
  root: string;
  evolutionId: string;
  humanId: string;
  expectedRevision: number;
  clock?: Clock;
}>;

function now(clock?: Clock): string {
  return (clock ?? (() => new Date()))().toISOString();
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function statOrUndefined(candidate: string) {
  try {
    return await lstat(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function repositoryRoot(rootInput: string): Promise<string> {
  let root: string;
  try {
    root = await realpath(rootInput);
  } catch (error) {
    throw new SourceEvolutionError(
      "UNSAFE_TARGET",
      "The repository root does not exist or cannot be resolved",
      { cause: error },
    );
  }
  const stats = await lstat(root);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new SourceEvolutionError(
      "UNSAFE_TARGET",
      "The resolved repository root must be a real directory",
    );
  }
  return root;
}

function safeSegments(relative: string): string[] {
  const normalized = relative.replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.split("/").some((segment) => segment === "" || segment === "..")
  ) {
    throw new SourceEvolutionError(
      "UNSAFE_TARGET",
      `Unsafe repository-relative path: ${relative}`,
    );
  }
  return normalized.split("/");
}

async function assertSafeDirectory(
  root: string,
  relative: string,
): Promise<string> {
  let cursor = root;
  for (const segment of safeSegments(relative)) {
    cursor = path.join(cursor, segment);
    const stats = await statOrUndefined(cursor);
    if (
      stats === undefined ||
      !stats.isDirectory() ||
      stats.isSymbolicLink()
    ) {
      throw new SourceEvolutionError(
        "UNSAFE_TARGET",
        `Expected a real directory inside the repository: ${relative}`,
      );
    }
  }
  const resolved = await realpath(cursor);
  if (!inside(root, resolved)) {
    throw new SourceEvolutionError(
      "UNSAFE_TARGET",
      `Directory escapes the repository root: ${relative}`,
    );
  }
  return cursor;
}

async function ensureSafeDirectory(
  root: string,
  relative: string,
): Promise<string> {
  let cursor = root;
  for (const segment of safeSegments(relative)) {
    cursor = path.join(cursor, segment);
    let stats = await statOrUndefined(cursor);
    if (stats === undefined) {
      try {
        await mkdir(cursor);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      stats = await lstat(cursor);
    }
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new SourceEvolutionError(
        "UNSAFE_TARGET",
        `Storage traverses a non-directory or symlink: ${relative}`,
      );
    }
  }
  const resolved = await realpath(cursor);
  if (!inside(root, resolved)) {
    throw new SourceEvolutionError(
      "UNSAFE_TARGET",
      `Storage escapes the repository root: ${relative}`,
    );
  }
  return cursor;
}

async function assertSafeRegularFile(
  root: string,
  relative: string,
): Promise<string> {
  const segments = safeSegments(relative);
  let cursor = root;
  for (const [index, segment] of segments.entries()) {
    cursor = path.join(cursor, segment);
    const stats = await statOrUndefined(cursor);
    const last = index === segments.length - 1;
    if (stats === undefined || stats.isSymbolicLink()) {
      throw new SourceEvolutionError(
        "UNSAFE_TARGET",
        `Target must exist and must not traverse a symlink: ${relative}`,
      );
    }
    if ((!last && !stats.isDirectory()) || (last && !stats.isFile())) {
      throw new SourceEvolutionError(
        "UNSAFE_TARGET",
        `Target must be a regular file: ${relative}`,
      );
    }
  }
  const resolved = await realpath(cursor);
  if (!inside(root, resolved)) {
    throw new SourceEvolutionError(
      "UNSAFE_TARGET",
      `Target escapes the repository root: ${relative}`,
    );
  }
  return cursor;
}

async function validateInstalledHost(
  root: string,
  app: SourceEvolutionApplication,
): Promise<void> {
  const relative = ".living/install-record.json";
  const candidate = path.join(root, ...safeSegments(relative));
  if ((await statOrUndefined(candidate)) === undefined) {
    throw new SourceEvolutionError(
      "HOST_NOT_INSTALLED",
      "Living Software must be installed before source evolution can be prepared",
    );
  }
  const recordPath = await assertSafeRegularFile(root, relative);
  let record;
  try {
    record = installRecordSchema.parse(
      JSON.parse(await readFile(recordPath, "utf8")),
    );
  } catch (error) {
    throw new SourceEvolutionError(
      "HOST_INSTALL_MISMATCH",
      "The Living Software install record is invalid",
      { cause: error },
    );
  }
  if (
    record.appId !== app.appId ||
    record.manifestHash !== app.manifestHash
  ) {
    throw new SourceEvolutionError(
      "HOST_INSTALL_MISMATCH",
      "The installed host identity does not match the prepared application",
    );
  }
}

async function readExpectedTarget(
  root: string,
  expectedContent: string,
  expectedHash: Sha256,
  mismatchCode: "TARGET_PREIMAGE_MISMATCH" | "TARGET_POSTIMAGE_MISMATCH",
): Promise<Readonly<{ path: string; mode: number }>> {
  const target = await assertSafeRegularFile(
    root,
    SOURCE_EVOLUTION_TARGET_PATH,
  );
  const bytes = await readFile(target);
  if (
    hashBytes(bytes) !== expectedHash ||
    !bytes.equals(Buffer.from(expectedContent, "utf8"))
  ) {
    throw new SourceEvolutionError(
      mismatchCode,
      mismatchCode === "TARGET_PREIMAGE_MISMATCH"
        ? "The target no longer matches the exact approved preimage"
        : "Rollback requires the exact installed postimage",
    );
  }
  return { path: target, mode: (await lstat(target)).mode };
}

async function atomicReplaceTarget(
  root: string,
  expectedContent: string,
  expectedHash: Sha256,
  nextContent: string,
  evolutionId: string,
  mismatchCode: "TARGET_PREIMAGE_MISMATCH" | "TARGET_POSTIMAGE_MISMATCH",
): Promise<void> {
  const target = await readExpectedTarget(
    root,
    expectedContent,
    expectedHash,
    mismatchCode,
  );
  const temporary = path.join(
    path.dirname(target.path),
    `.${path.basename(target.path)}.${evolutionId}.${randomUUID()}.tmp`,
  );
  const existingTemporary = await statOrUndefined(temporary);
  if (existingTemporary !== undefined) {
    throw new SourceEvolutionError(
      "STORAGE_CONFLICT",
      "A prior source-evolution temporary file already exists",
    );
  }
  const handle = await open(temporary, "wx", target.mode);
  try {
    await handle.writeFile(nextContent, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await readExpectedTarget(
      root,
      expectedContent,
      expectedHash,
      mismatchCode,
    );
    await rename(temporary, target.path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function validateEvolutionId(evolutionId: string): void {
  if (!EVOLUTION_ID.test(evolutionId)) {
    throw new SourceEvolutionError(
      "INVALID_INPUT",
      "Invalid deterministic source evolution id",
    );
  }
}

function assertExpectedRevision(
  state: SourceEvolutionState,
  expectedRevision: number,
): void {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision !== state.receiptCount
  ) {
    throw new SourceEvolutionError(
      "STALE_REVISION",
      `Expected revision ${expectedRevision}; current revision is ${state.receiptCount}`,
    );
  }
}

function storagePaths(evolutionId: string) {
  const directory = `${STORAGE_ROOT}/${evolutionId}`;
  return {
    directory,
    statePath: `${directory}/state.json`,
    receiptsPath: `${directory}/receipts.ndjson`,
  } as const;
}

const LOCK_LEASE_MS = 60_000;

type EvolutionLock = Readonly<{
  root: string;
  path: string;
  ownerToken: string;
  handle: Awaited<ReturnType<typeof open>>;
}>;

async function acquireEvolutionLock(
  rootInput: string,
  evolutionId: string,
): Promise<EvolutionLock> {
  validateEvolutionId(evolutionId);
  const root = await repositoryRoot(rootInput);
  const directory = await assertSafeDirectory(
    root,
    storagePaths(evolutionId).directory,
  );
  const lockPath = path.join(directory, "mutation.lock");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ownerToken = randomUUID();
    let handle;
    try {
      handle = await open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stats = await lstat(lockPath);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new SourceEvolutionError(
          "UNSAFE_TARGET",
          "The evolution lock is not a regular file",
        );
      }
      let existing: { ownerToken?: unknown; expiresAt?: unknown };
      try {
        existing = JSON.parse(await readFile(lockPath, "utf8"));
      } catch {
        throw new SourceEvolutionError(
          "EVOLUTION_BUSY",
          "The evolution is locked by an unreadable owner record",
        );
      }
      if (
        typeof existing.ownerToken !== "string" ||
        typeof existing.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(existing.expiresAt)) ||
        Date.parse(existing.expiresAt) > Date.now()
      ) {
        throw new SourceEvolutionError(
          "EVOLUTION_BUSY",
          "Another process currently owns this evolution",
        );
      }
      // The repository controls the lock contents, so the owner token must
      // never become part of a filesystem path. A fresh UUID keeps the
      // quarantine name inside this exact evolution directory. hard-link(2)
      // is used as a no-overwrite capture before the stale path is unlinked.
      const stalePath = path.join(
        directory,
        `mutation.lock.stale.${randomUUID()}.json`,
      );
      if (
        path.dirname(stalePath) !== directory ||
        !inside(directory, stalePath)
      ) {
        throw new SourceEvolutionError(
          "UNSAFE_TARGET",
          "The stale-lock quarantine path escaped the evolution directory",
        );
      }
      try {
        await link(lockPath, stalePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        throw new SourceEvolutionError(
          "EVOLUTION_BUSY",
          "Another process changed or could not quarantine the evolution lock",
          { cause: error },
        );
      }
      try {
        const captured = JSON.parse(await readFile(stalePath, "utf8")) as {
          ownerToken?: unknown;
          expiresAt?: unknown;
        };
        const [sourceStats, capturedStats] = await Promise.all([
          lstat(lockPath),
          lstat(stalePath),
        ]);
        if (
          captured.ownerToken !== existing.ownerToken ||
          captured.expiresAt !== existing.expiresAt ||
          typeof captured.expiresAt !== "string" ||
          Date.parse(captured.expiresAt) > Date.now() ||
          sourceStats.dev !== capturedStats.dev ||
          sourceStats.ino !== capturedStats.ino
        ) {
          throw new SourceEvolutionError(
            "EVOLUTION_BUSY",
            "Another process replaced the evolution lock during quarantine",
          );
        }
        await unlink(lockPath);
      } catch (error) {
        await unlink(stalePath).catch(() => undefined);
        if (error instanceof SourceEvolutionError) throw error;
        throw new SourceEvolutionError(
          "EVOLUTION_BUSY",
          "Another process changed the evolution lock during quarantine",
          { cause: error },
        );
      }
      continue;
    }
    const acquiredAt = new Date();
    try {
      await handle.writeFile(
        `${canonicalJson({
          schemaVersion: "living.source-evolution-lock/v1",
          ownerToken,
          acquiredAt: acquiredAt.toISOString(),
          expiresAt: new Date(acquiredAt.getTime() + LOCK_LEASE_MS).toISOString(),
        })}\n`,
        "utf8",
      );
      await handle.sync();
      return { root, path: lockPath, ownerToken, handle };
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(lockPath).catch(() => undefined);
      throw error;
    }
  }
  throw new SourceEvolutionError(
    "EVOLUTION_BUSY",
    "Unable to acquire the evolution lock",
  );
}

async function releaseEvolutionLock(lock: EvolutionLock): Promise<void> {
  await lock.handle.close();
  let existing: { ownerToken?: unknown };
  try {
    existing = JSON.parse(await readFile(lock.path, "utf8"));
  } catch (error) {
    throw new SourceEvolutionError(
      "STORAGE_CONFLICT",
      "The evolution lock disappeared before release",
      { cause: error },
    );
  }
  if (existing.ownerToken !== lock.ownerToken) {
    throw new SourceEvolutionError(
      "STORAGE_CONFLICT",
      "The evolution lock owner changed before release",
    );
  }
  await unlink(lock.path);
}

async function withEvolutionLock<T>(
  root: string,
  evolutionId: string,
  action: () => Promise<T>,
): Promise<T> {
  const lock = await acquireEvolutionLock(root, evolutionId);
  try {
    await recoverPendingTransaction(lock.root, evolutionId);
    return await action();
  } finally {
    await releaseEvolutionLock(lock);
  }
}

async function writeNewFile(target: string, content: string): Promise<void> {
  const handle = await open(target, "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replaceStateFile(
  statePath: string,
  state: SourceEvolutionState,
): Promise<void> {
  const stats = await lstat(statePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new SourceEvolutionError(
      "STORAGE_CONFLICT",
      "Evolution state is not a regular file",
    );
  }
  const temporary = `${statePath}.${randomUUID()}.tmp`;
  if ((await statOrUndefined(temporary)) !== undefined) {
    throw new SourceEvolutionError(
      "STORAGE_CONFLICT",
      "A prior state-write temporary file already exists",
    );
  }
  const handle = await open(temporary, "wx", stats.mode);
  try {
    await handle.writeFile(`${canonicalJson(state)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, statePath);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function replaceReceiptsFile(
  receiptsPath: string,
  receipts: readonly EvolutionReceipt[],
): Promise<void> {
  const stats = await lstat(receiptsPath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new SourceEvolutionError(
      "STORAGE_CONFLICT",
      "Evolution receipts are not a regular file",
    );
  }
  const temporary = `${receiptsPath}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", stats.mode);
  try {
    await handle.writeFile(
      receipts.map(serializeEvolutionReceipt).join(""),
      "utf8",
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, receiptsPath);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}


function validateInputBindings(
  app: SourceEvolutionApplication,
  manifest: ProductManifest,
  opportunity: Opportunity,
  brief: Gpt56EvolutionBrief,
  provenance: IntelligenceProvenance,
): void {
  const mismatch = (message: string): never => {
    throw new SourceEvolutionError("INVALID_INPUT", message);
  };
  if (
    app.appId !== manifest.appId ||
    app.appId !== opportunity.appId ||
    app.appId !== brief.appId
  ) {
    mismatch("App, manifest, opportunity, and brief app ids must match");
  }
  if (
    app.manifestHash !== manifest.contentHash ||
    app.manifestHash !== opportunity.manifestHash ||
    app.manifestHash !== brief.manifestHash
  ) {
    mismatch("App, manifest, opportunity, and brief manifest hashes must match");
  }
  if (app.releaseRevision !== manifest.release.revision) {
    mismatch("Application and manifest release revisions must match");
  }
  if (
    app.dataOrigin !== opportunity.evidence.dataOrigin ||
    app.dataOrigin !== brief.evidenceScope.origin
  ) {
    mismatch("Application, opportunity, and brief evidence origins must match");
  }
  if (
    brief.opportunityId !== opportunity.opportunityId ||
    brief.evidenceCitations.eventSetHash !==
      opportunity.evidence.eventSetHash ||
    opportunity.evidence.bundle.sha256 !==
      opportunity.evidence.eventSetHash
  ) {
    mismatch("Brief and opportunity evidence identities must match exactly");
  }
  const sampled = new Set(opportunity.evidence.sampleEventIds);
  if (
    brief.evidenceCitations.sampleEventIds.some(
      (eventId) => !sampled.has(eventId),
    )
  ) {
    mismatch("Every brief evidence citation must exist in the opportunity");
  }
  const metrics = new Map(
    opportunity.signal.metrics.map((metric) => [metric.name, metric.observed]),
  );
  if (
    brief.evidenceCitations.metrics.some(
      (metric) => metrics.get(metric.name) !== metric.observed,
    )
  ) {
    mismatch("Every brief metric must exactly match the opportunity");
  }
  const nodeIds = new Set(manifest.nodes.map((node) => node.id));
  if (
    brief.proposedChange.affectedProductNodeIds.some(
      (nodeId) => !nodeIds.has(nodeId),
    )
  ) {
    mismatch("Every affected product node must exist in the manifest");
  }
  const targetNodeIds = new Set(
    manifest.nodes
      .filter((node) =>
        node.provenance.sources.some(
          (source) =>
            source.path.replaceAll("\\", "/") ===
            SOURCE_EVOLUTION_TARGET_PATH,
        ),
      )
      .map((node) => node.id),
  );
  if (targetNodeIds.size === 0) {
    mismatch("The manifest must include a node sourced from the target file");
  }
  if (opportunity.signal.kind !== "backtracking") {
    mismatch("This adapter accepts only a deterministic backtracking opportunity");
  }
  if (provenance.transport === "codex-cli") {
    if (
      provenance.transportRequestedModel !== "gpt-5.6-terra" ||
      provenance.responseId !== null ||
      provenance.codexThreadId === null ||
      provenance.localSessionPersisted !== false
    ) {
      mismatch("Codex CLI model provenance is internally inconsistent");
    }
  } else if (
    provenance.transportRequestedModel !== "gpt-5.6" ||
    provenance.responseId === null ||
    provenance.codexThreadId !== null ||
    provenance.responseStoreRequested !== false
  ) {
    mismatch("Responses API model provenance is internally inconsistent");
  }
}

function validateStoredState(state: SourceEvolutionState): void {
  validateInputBindings(
    state.app,
    state.inputs.manifest,
    state.inputs.opportunity,
    state.inputs.brief,
    state.modelProvenance,
  );
  const expectedStorage = storagePaths(state.evolutionId);
  if (
    state.storage.directory !== expectedStorage.directory ||
    state.storage.statePath !== expectedStorage.statePath ||
    state.storage.receiptsPath !== expectedStorage.receiptsPath ||
    hashBytes(state.source.preimage) !== state.artifact.target.preimageHash ||
    hashBytes(state.source.postimage) !== state.artifact.target.postimageHash ||
    state.bindings.appHash !== hashJson(state.app)
  ) {
    throw new SourceEvolutionError(
      "STATE_TAMPERED",
      "Stored evolution source, paths, or input hashes no longer match",
    );
  }
  verifyLeadReviewNavigation(state.source.preimage, state.source.postimage);
}

const SOURCE_LIFECYCLE_RECEIPT_KINDS = new Set<EvolutionReceipt["kind"]>([
  "contract.confirmed",
  "activation.approved",
  "installation.activated",
  "installation.disabled",
  "installation.rolled-back",
]);

function lifecycleReceiptError(message: string): never {
  throw new SourceEvolutionError("RECEIPT_CHAIN_INVALID", message);
}

function assertExactLifecycleReceipt(
  receipt: EvolutionReceipt | undefined,
  expected: Readonly<{
    kind: EvolutionReceipt["kind"];
    actor: EvolutionReceipt["actor"];
    recordedAt: string;
    refs: EvolutionReceipt["refs"];
    payload: JsonObject;
  }>,
): asserts receipt is EvolutionReceipt {
  if (
    receipt === undefined ||
    receipt.kind !== expected.kind ||
    receipt.recordedAt !== expected.recordedAt ||
    canonicalJson(receipt.actor) !== canonicalJson(expected.actor) ||
    canonicalJson(receipt.refs) !== canonicalJson(expected.refs) ||
    canonicalJson(receipt.payload) !== canonicalJson(expected.payload)
  ) {
    lifecycleReceiptError(
      `The '${expected.kind}' lifecycle receipt does not match its exact state binding`,
    );
  }
}

function lifecycleRefs(
  state: SourceEvolutionState,
): EvolutionReceipt["refs"] {
  return {
    manifestHash: state.bindings.manifestHash,
    opportunityHash: state.bindings.opportunityHash,
    contractHash: state.contract.contentHash,
    artifactHash: state.artifact.contentHash,
    proofHash: state.proof.proofHash,
  };
}

function pointedReceiptIndex(
  receipts: readonly EvolutionReceipt[],
  receiptHash: Sha256,
  label: string,
): number {
  const index = receipts.findIndex(
    (receipt) => receipt.receiptHash === receiptHash,
  );
  if (index < 0) {
    lifecycleReceiptError(
      `The ${label} lifecycle pointer is absent from the receipt chain`,
    );
  }
  return index;
}

function validateLifecycleReceiptBindings(
  state: SourceEvolutionState,
  receipts: readonly EvolutionReceipt[],
): void {
  const expectedKinds: readonly EvolutionReceipt["kind"][] =
    state.status === "prepared"
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
    lifecycleReceiptError(
      "The receipt chain lifecycle sequence contradicts the stored state",
    );
  }

  const approval = state.approval;
  if (approval === null) return;
  if (
    approval.contractHash !== state.contract.contentHash ||
    approval.artifactHash !== state.artifact.contentHash ||
    approval.proofHash !== state.proof.proofHash
  ) {
    lifecycleReceiptError(
      "The stored approval hashes do not bind the exact contract, artifact, and proof",
    );
  }

  const refs = lifecycleRefs(state);
  const approvalIndex = pointedReceiptIndex(
    receipts,
    approval.receiptHash,
    "approval",
  );
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
    lifecycleReceiptError(
      "Activation approval must immediately follow its exact human contract confirmation",
    );
  }

  const application = state.application;
  if (application === null) {
    if (approvalReceipt.receiptHash !== state.chainHead) {
      lifecycleReceiptError(
        "The approved state must end at its exact activation approval receipt",
      );
    }
    return;
  }
  if (
    application.preimageHash !== state.artifact.target.preimageHash ||
    application.postimageHash !== state.artifact.target.postimageHash
  ) {
    lifecycleReceiptError(
      "The stored application hashes do not bind the exact source transition",
    );
  }
  const applicationIndex = pointedReceiptIndex(
    receipts,
    application.receiptHash,
    "application",
  );
  const applicationReceipt = receipts[applicationIndex];
  assertExactLifecycleReceipt(applicationReceipt, {
    kind: "installation.activated",
    actor: ENGINE_ACTOR,
    recordedAt: application.appliedAt,
    refs,
    payload: {
      targetPath: SOURCE_EVOLUTION_TARGET_PATH,
      fromHash: state.artifact.target.preimageHash,
      toHash: state.artifact.target.postimageHash,
      approvedBy: approval.humanId,
    },
  });
  if (
    applicationIndex !== approvalIndex + 1 ||
    applicationReceipt.previousHash !== approvalReceipt.receiptHash
  ) {
    lifecycleReceiptError(
      "Source application must immediately follow its exact activation approval",
    );
  }

  const rollback = state.rollback;
  if (rollback === null) {
    if (applicationReceipt.receiptHash !== state.chainHead) {
      lifecycleReceiptError(
        "The applied state must end at its exact installation receipt",
      );
    }
    return;
  }
  if (
    rollback.fromHash !== state.artifact.target.postimageHash ||
    rollback.toHash !== state.artifact.target.preimageHash
  ) {
    lifecycleReceiptError(
      "The stored rollback hashes do not bind the exact reverse source transition",
    );
  }
  const rollbackIndex = pointedReceiptIndex(
    receipts,
    rollback.receiptHash,
    "rollback",
  );
  const rollbackReceipt = receipts[rollbackIndex];
  assertExactLifecycleReceipt(rollbackReceipt, {
    kind: "installation.rolled-back",
    actor: { type: "human", id: rollback.humanId },
    recordedAt: rollback.rolledBackAt,
    refs,
    payload: {
      targetPath: SOURCE_EVOLUTION_TARGET_PATH,
      fromHash: state.artifact.target.postimageHash,
      toHash: state.artifact.target.preimageHash,
      trigger: "explicit-human-rollback",
    },
  });
  if (
    rollbackIndex !== applicationIndex + 1 ||
    rollbackReceipt.previousHash !== applicationReceipt.receiptHash ||
    rollbackReceipt.receiptHash !== state.chainHead
  ) {
    lifecycleReceiptError(
      "Rollback must immediately follow and reverse the exact installation receipt",
    );
  }
}

async function loadEvolution(
  rootInput: string,
  evolutionId: string,
): Promise<Readonly<{
  root: string;
  state: SourceEvolutionState;
  receipts: readonly EvolutionReceipt[];
  statePath: string;
  receiptsPath: string;
}>> {
  validateEvolutionId(evolutionId);
  const root = await repositoryRoot(rootInput);
  const paths = storagePaths(evolutionId);
  try {
    await assertSafeDirectory(root, paths.directory);
  } catch (error) {
    if (
      error instanceof SourceEvolutionError &&
      error.code === "UNSAFE_TARGET" &&
      (await statOrUndefined(path.join(root, ...safeSegments(paths.directory)))) ===
        undefined
    ) {
      throw new SourceEvolutionError(
        "EVOLUTION_NOT_FOUND",
        `Evolution '${evolutionId}' does not exist`,
      );
    }
    throw error;
  }
  const statePath = await assertSafeRegularFile(root, paths.statePath);
  const receiptsPath = await assertSafeRegularFile(root, paths.receiptsPath);
  let state: SourceEvolutionState;
  try {
    state = parseSourceEvolutionState(
      JSON.parse(await readFile(statePath, "utf8")),
    );
    validateStoredState(state);
  } catch (error) {
    if (error instanceof SourceEvolutionError) throw error;
    throw new SourceEvolutionError(
      "STATE_TAMPERED",
      "Evolution state failed strict validation",
      { cause: error },
    );
  }
  if (state.evolutionId !== evolutionId) {
    throw new SourceEvolutionError(
      "STATE_TAMPERED",
      "Evolution directory and state ids do not match",
    );
  }
  const receipts = parseEvolutionReceiptStream(
    await readFile(receiptsPath, "utf8"),
    { appId: state.app.appId, evolutionId },
  );
  const chainHead = receipts.at(-1)?.receiptHash;
  if (
    receipts.length !== state.receiptCount ||
    chainHead === undefined ||
    chainHead !== state.chainHead
  ) {
    throw new SourceEvolutionError(
      "RECEIPT_CHAIN_INVALID",
      "State lifecycle pointers do not match the receipt chain",
    );
  }
  validateLifecycleReceiptBindings(state, receipts);
  return { root, state, receipts, statePath, receiptsPath };
}

export type SourceEvolutionFaultPoint =
  | "after-journal"
  | "after-target"
  | "after-receipts"
  | "after-state";

let sourceEvolutionFaultInjector:
  | ((point: SourceEvolutionFaultPoint) => void | Promise<void>)
  | undefined;

export function setSourceEvolutionFaultInjectorForTests(
  injector?: (point: SourceEvolutionFaultPoint) => void | Promise<void>,
): void {
  sourceEvolutionFaultInjector = injector;
}

async function injectFault(point: SourceEvolutionFaultPoint): Promise<void> {
  await sourceEvolutionFaultInjector?.(point);
}

type PendingOperation = "approve" | "apply" | "rollback";

type PendingTarget = Readonly<{
  fromHash: Sha256;
  toHash: Sha256;
}>;

type PendingTransactionContent = Readonly<{
  schemaVersion: "living.source-evolution-transaction/v1";
  transactionId: string;
  evolutionId: string;
  appId: string;
  operation: PendingOperation;
  base: Readonly<{
    receiptCount: number;
    chainHead: Sha256;
    stateHash: Sha256;
  }>;
  additions: readonly EvolutionReceipt[];
  nextState: SourceEvolutionState;
  target: PendingTarget | null;
  createdAt: string;
}>;

type PendingTransaction = PendingTransactionContent &
  Readonly<{ transactionHash: Sha256 }>;

function transactionRelativePath(evolutionId: string): string {
  return `${storagePaths(evolutionId).directory}/pending-transaction.json`;
}

function parsePendingTransaction(input: unknown): PendingTransaction {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Pending transaction must be an object",
    );
  }
  const record = input as Record<string, unknown>;
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
  if (
    Object.keys(record).sort().join("\0") !== expectedKeys.join("\0") ||
    record.schemaVersion !== "living.source-evolution-transaction/v1" ||
    typeof record.transactionId !== "string" ||
    typeof record.evolutionId !== "string" ||
    typeof record.appId !== "string" ||
    !["approve", "apply", "rollback"].includes(String(record.operation)) ||
    typeof record.createdAt !== "string" ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    typeof record.transactionHash !== "string"
  ) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Pending transaction has an invalid envelope",
    );
  }
  identifierSchema.parse(record.transactionId);
  validateEvolutionId(record.evolutionId);
  const { transactionHash, ...content } = record;
  if (hashJson(content) !== transactionHash) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Pending transaction hash does not match its content",
    );
  }
  if (
    record.base === null ||
    typeof record.base !== "object" ||
    Array.isArray(record.base)
  ) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Pending transaction base is invalid",
    );
  }
  const base = record.base as Record<string, unknown>;
  if (
    Object.keys(base).sort().join("\0") !==
      ["chainHead", "receiptCount", "stateHash"].join("\0") ||
    !Number.isSafeInteger(base.receiptCount) ||
    typeof base.chainHead !== "string" ||
    typeof base.stateHash !== "string"
  ) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Pending transaction CAS base is invalid",
    );
  }
  if (!Array.isArray(record.additions) || record.additions.length === 0) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Pending transaction must add at least one receipt",
    );
  }
  const additions = record.additions.map((receipt) =>
    evolutionReceiptSchema.parse(receipt),
  );
  const nextState = parseSourceEvolutionState(record.nextState);
  validateStoredState(nextState);
  const operation = record.operation as PendingOperation;
  const parsedBase = {
    receiptCount: base.receiptCount as number,
    chainHead: base.chainHead as Sha256,
    stateHash: base.stateHash as Sha256,
  };
  let previousHash: Sha256 | null = parsedBase.chainHead;
  for (const [index, receipt] of additions.entries()) {
    const { receiptHash, ...receiptContent } = receipt;
    if (
      receipt.appId !== record.appId ||
      receipt.evolutionId !== record.evolutionId ||
      receipt.sequence !== parsedBase.receiptCount + index ||
      receipt.previousHash !== previousHash ||
      receipt.payloadHash !== hashJson(receipt.payload) ||
      receiptHash !== hashJson(receiptContent)
    ) {
      throw new SourceEvolutionError(
        "TRANSACTION_RECOVERY_FAILED",
        "Pending transaction receipt additions are not one exact chain",
      );
    }
    previousHash = receipt.receiptHash;
  }
  if (
    nextState.evolutionId !== record.evolutionId ||
    nextState.app.appId !== record.appId ||
    nextState.receiptCount !== parsedBase.receiptCount + additions.length ||
    nextState.chainHead !== previousHash ||
    (operation === "approve" && nextState.status !== "approved") ||
    (operation === "apply" && nextState.status !== "applied") ||
    (operation === "rollback" && nextState.status !== "rolled-back")
  ) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Pending transaction next state contradicts its operation",
    );
  }
  let target: PendingTarget | null = null;
  if (record.target !== null) {
    if (
      typeof record.target !== "object" ||
      Array.isArray(record.target) ||
      Object.keys(record.target).sort().join("\0") !==
        ["fromHash", "toHash"].join("\0")
    ) {
      throw new SourceEvolutionError(
        "TRANSACTION_RECOVERY_FAILED",
        "Pending transaction target is invalid",
      );
    }
    const candidate = record.target as Record<string, unknown>;
    if (
      typeof candidate.fromHash !== "string" ||
      typeof candidate.toHash !== "string"
    ) {
      throw new SourceEvolutionError(
        "TRANSACTION_RECOVERY_FAILED",
        "Pending transaction target hashes are invalid",
      );
    }
    target = {
      fromHash: candidate.fromHash as Sha256,
      toHash: candidate.toHash as Sha256,
    };
  }
  const expectedTarget =
    operation === "apply"
      ? {
          fromHash: nextState.artifact.target.preimageHash,
          toHash: nextState.artifact.target.postimageHash,
        }
      : operation === "rollback"
        ? {
            fromHash: nextState.artifact.target.postimageHash,
            toHash: nextState.artifact.target.preimageHash,
          }
        : null;
  if (canonicalJson(target) !== canonicalJson(expectedTarget)) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Pending transaction target does not match its lifecycle operation",
    );
  }
  return {
    schemaVersion: "living.source-evolution-transaction/v1",
    transactionId: record.transactionId,
    evolutionId: record.evolutionId,
    appId: record.appId,
    operation,
    base: parsedBase,
    additions,
    nextState,
    target,
    createdAt: record.createdAt,
    transactionHash: transactionHash as Sha256,
  };
}

async function readPendingTransaction(
  root: string,
  evolutionId: string,
): Promise<Readonly<{ path: string; transaction: PendingTransaction }> | undefined> {
  const relative = transactionRelativePath(evolutionId);
  const candidate = path.join(root, ...safeSegments(relative));
  if ((await statOrUndefined(candidate)) === undefined) return undefined;
  const transactionPath = await assertSafeRegularFile(root, relative);
  try {
    return {
      path: transactionPath,
      transaction: parsePendingTransaction(
        JSON.parse(await readFile(transactionPath, "utf8")),
      ),
    };
  } catch (error) {
    if (error instanceof SourceEvolutionError) throw error;
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Pending transaction cannot be parsed",
      { cause: error },
    );
  }
}

async function targetTransitionState(
  root: string,
  transaction: PendingTransaction,
): Promise<"from" | "to"> {
  if (transaction.target === null) return "to";
  const targetPath = await assertSafeRegularFile(
    root,
    SOURCE_EVOLUTION_TARGET_PATH,
  );
  const bytes = await readFile(targetPath);
  const preimage = transaction.nextState.source.preimage;
  const postimage = transaction.nextState.source.postimage;
  const fromContent =
    transaction.operation === "apply" ? preimage : postimage;
  const toContent =
    transaction.operation === "apply" ? postimage : preimage;
  if (
    hashBytes(bytes) === transaction.target.toHash &&
    bytes.equals(Buffer.from(toContent, "utf8"))
  ) {
    return "to";
  }
  if (
    hashBytes(bytes) === transaction.target.fromHash &&
    bytes.equals(Buffer.from(fromContent, "utf8"))
  ) {
    return "from";
  }
  throw new SourceEvolutionError(
    "TRANSACTION_RECOVERY_FAILED",
    "Host source matches neither side of the pending exact transition",
  );
}

async function recoverPendingTransaction(
  root: string,
  evolutionId: string,
): Promise<SourceEvolutionState | undefined> {
  const pending = await readPendingTransaction(root, evolutionId);
  if (pending === undefined) return undefined;
  const { transaction } = pending;
  const paths = storagePaths(evolutionId);
  const statePath = await assertSafeRegularFile(root, paths.statePath);
  const receiptsPath = await assertSafeRegularFile(root, paths.receiptsPath);
  let currentState: SourceEvolutionState;
  try {
    currentState = parseSourceEvolutionState(
      JSON.parse(await readFile(statePath, "utf8")),
    );
    validateStoredState(currentState);
  } catch (error) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Current state is invalid during transaction recovery",
      { cause: error },
    );
  }
  const beforeState =
    currentState.receiptCount === transaction.base.receiptCount &&
    currentState.chainHead === transaction.base.chainHead &&
    hashJson(currentState) === transaction.base.stateHash;
  const afterState =
    canonicalJson(currentState) === canonicalJson(transaction.nextState);
  if (!beforeState && !afterState) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Current state is neither the exact before nor after transaction state",
    );
  }
  const currentReceipts = parseEvolutionReceiptStream(
    await readFile(receiptsPath, "utf8"),
    { appId: transaction.appId, evolutionId },
  );
  const baseReceipt = currentReceipts.at(transaction.base.receiptCount - 1);
  if (
    baseReceipt?.receiptHash !== transaction.base.chainHead ||
    currentReceipts.length < transaction.base.receiptCount ||
    currentReceipts.length > transaction.nextState.receiptCount
  ) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Current receipt stream does not contain the transaction CAS base",
    );
  }
  for (
    let sequence = transaction.base.receiptCount;
    sequence < currentReceipts.length;
    sequence += 1
  ) {
    if (
      currentReceipts[sequence]?.receiptHash !==
      transaction.additions[sequence - transaction.base.receiptCount]?.receiptHash
    ) {
      throw new SourceEvolutionError(
        "TRANSACTION_RECOVERY_FAILED",
        "Current receipt suffix differs from the pending transaction",
      );
    }
  }
  const finalReceipts = [
    ...currentReceipts.slice(0, transaction.base.receiptCount),
    ...transaction.additions,
  ];
  parseEvolutionReceiptStream(
    finalReceipts.map(serializeEvolutionReceipt).join(""),
    { appId: transaction.appId, evolutionId },
  );
  validateLifecycleReceiptBindings(transaction.nextState, finalReceipts);

  if (transaction.target !== null) {
    const transitionState = await targetTransitionState(root, transaction);
    if (transitionState === "from") {
      const fromContent =
        transaction.operation === "apply"
          ? transaction.nextState.source.preimage
          : transaction.nextState.source.postimage;
      const toContent =
        transaction.operation === "apply"
          ? transaction.nextState.source.postimage
          : transaction.nextState.source.preimage;
      await atomicReplaceTarget(
        root,
        fromContent,
        transaction.target.fromHash,
        toContent,
        evolutionId,
        transaction.operation === "apply"
          ? "TARGET_PREIMAGE_MISMATCH"
          : "TARGET_POSTIMAGE_MISMATCH",
      );
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
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Pending transaction journal changed before completion",
    );
  }
  await unlink(pending.path);
  return transaction.nextState;
}

async function installPendingTransaction(
  transactionPath: string,
  transaction: PendingTransaction,
): Promise<void> {
  if ((await statOrUndefined(transactionPath)) !== undefined) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "A pending transaction already exists after locked recovery",
    );
  }
  const temporary = `${transactionPath}.${randomUUID()}.tmp`;
  try {
    await writeNewFile(temporary, `${canonicalJson(transaction)}\n`);
    if ((await statOrUndefined(transactionPath)) !== undefined) {
      throw new SourceEvolutionError(
        "TRANSACTION_RECOVERY_FAILED",
        "A pending transaction appeared before journal publication",
      );
    }
    await rename(temporary, transactionPath);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function commitLifecycleTransaction(
  loaded: Awaited<ReturnType<typeof loadEvolution>>,
  nextState: SourceEvolutionState,
  additions: readonly EvolutionReceipt[],
  operation: PendingOperation,
  target: PendingTarget | null,
): Promise<SourceEvolutionState> {
  if (target !== null) {
    await readExpectedTarget(
      loaded.root,
      operation === "apply"
        ? nextState.source.preimage
        : nextState.source.postimage,
      target.fromHash,
      operation === "apply"
        ? "TARGET_PREIMAGE_MISMATCH"
        : "TARGET_POSTIMAGE_MISMATCH",
    );
  }

  const content: PendingTransactionContent = {
    schemaVersion: "living.source-evolution-transaction/v1",
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
  const recovered = await recoverPendingTransaction(
    loaded.root,
    loaded.state.evolutionId,
  );
  if (recovered === undefined) {
    throw new SourceEvolutionError(
      "TRANSACTION_RECOVERY_FAILED",
      "Pending transaction disappeared before completion",
    );
  }
  return recovered;
}

function makeContract(): SourceEvolutionContract {
  const content = {
    schemaVersion: "living.source-evolution-contract/v1" as const,
    adapter: SOURCE_EVOLUTION_ADAPTER,
    target: {
      path: SOURCE_EVOLUTION_TARGET_PATH,
      allowedFileCount: 1 as const,
      mutationMode: "exact-source-transform" as const,
    },
    requiredHooks: [
      "lead-review-navigation",
      "previous-lead-button",
      "lead-review-position",
      "next-lead-button",
    ],
    prohibitions: [...SOURCE_EVOLUTION_PROHIBITIONS],
    deterministicTests: [
      "adapter.exact",
      "binding.exact",
      "target.single-file",
      "target.preimage-hash",
      "patch.deterministic",
      "ui.hooks-exact",
      "navigation.host-derived",
      "authority.model-free",
      "prohibitions.static",
      "rollback.exact-postimage",
    ],
    generation: {
      kind: "deterministic-adapter" as const,
      modelOutputAccepted: false as const,
      arbitraryCodeAccepted: false as const,
      gitInvocationAllowed: false as const,
    },
    approval: {
      humanRequired: true as const,
      bindsExactContractArtifactAndProof: true as const,
    },
    rollback: {
      required: true as const,
      condition: "exact-postimage-only" as const,
    },
  };
  return sourceEvolutionContractSchema.parse({
    ...content,
    contentHash: hashJson(content),
  });
}

function appendReceipt(
  receipts: EvolutionReceipt[],
  input: Omit<
    Parameters<typeof buildEvolutionReceipt>[0],
    "sequence" | "previousHash"
  >,
): EvolutionReceipt {
  const receipt = buildEvolutionReceipt({
    ...input,
    sequence: receipts.length,
    previousHash: receipts.at(-1)?.receiptHash ?? null,
  });
  receipts.push(receipt);
  return receipt;
}

export async function prepareSourceEvolution(
  input: PrepareSourceEvolutionInput,
): Promise<SourceEvolutionState> {
  const app = sourceEvolutionApplicationSchema.parse(input.app);
  const manifest = productManifestSchema.parse(input.manifest);
  const opportunity = opportunitySchema.parse(input.opportunity);
  const brief = gpt56EvolutionBriefSchema.parse(input.brief);
  const modelProvenance = intelligenceProvenanceSchema.parse(
    input.modelProvenance,
  );
  if (input.target.path !== SOURCE_EVOLUTION_TARGET_PATH) {
    throw new SourceEvolutionError(
      "INVALID_INPUT",
      `The adapter can modify only ${SOURCE_EVOLUTION_TARGET_PATH}`,
    );
  }
  validateInputBindings(app, manifest, opportunity, brief, modelProvenance);

  const root = await repositoryRoot(input.root);
  await validateInstalledHost(root, app);
  const preimageHash = hashBytes(input.target.preimage);
  await readExpectedTarget(
    root,
    input.target.preimage,
    preimageHash,
    "TARGET_PREIMAGE_MISMATCH",
  );
  const postimage = compileLeadReviewNavigation(input.target.preimage);
  const postimageHash = hashBytes(postimage);
  const appHash = hashJson(app);
  const manifestInputHash = hashJson(manifest);
  const opportunityHash = hashJson(opportunity);
  const briefHash = hashJson(brief);
  const modelProvenanceHash = hashJson(modelProvenance);
  const bindings = {
    appHash,
    manifestHash: manifest.contentHash,
    manifestInputHash,
    opportunityId: opportunity.opportunityId,
    opportunityHash,
    briefId: brief.briefId,
    briefHash,
    modelProvenanceHash,
  };
  const identityHash = hashJson({
    schemaVersion: "living.source-evolution-identity/v1",
    adapter: SOURCE_EVOLUTION_ADAPTER,
    app,
    manifest,
    opportunity,
    brief,
    modelProvenance,
    target: { path: input.target.path, preimageHash },
  });
  const evolutionId = `evolution.source.${identityHash.slice(7, 31)}`;
  const contract = makeContract();
  const artifactContent = {
    schemaVersion: "living.source-evolution-artifact/v1" as const,
    artifactId: `artifact.source.${identityHash.slice(7, 31)}`,
    adapter: SOURCE_EVOLUTION_ADAPTER,
    contractHash: contract.contentHash,
    bindings,
    interpretation: {
      briefRole: "evidence-interpretation-only" as const,
      implementsBrief: false as const,
      adapterCandidateBasis: "deterministic-opportunity-and-host" as const,
    },
    target: {
      path: SOURCE_EVOLUTION_TARGET_PATH,
      allowedFileCount: 1 as const,
      preimageHash,
      postimageHash,
    },
    transform: SOURCE_EVOLUTION_ADAPTER.key,
  };
  const artifact: SourceEvolutionArtifact =
    sourceEvolutionArtifactSchema.parse({
      ...artifactContent,
      contentHash: hashJson(artifactContent),
    });
  const proofContent = {
    schemaVersion: "living.source-evolution-proof/v1" as const,
    proofId: `proof.source.${artifact.contentHash.slice(7, 31)}`,
    contractHash: contract.contentHash,
    artifactHash: artifact.contentHash,
    target: { path: SOURCE_EVOLUTION_TARGET_PATH, preimageHash, postimageHash },
    checks: verifyLeadReviewNavigation(input.target.preimage, postimage),
    verdict: "passed" as const,
  };
  const proof: SourceEvolutionProof = sourceEvolutionProofSchema.parse({
    ...proofContent,
    proofHash: hashJson(proofContent),
  });

  const recordedAt = now(input.clock);
  const receipts: EvolutionReceipt[] = [];
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
      model: modelProvenance.transportRequestedModel,
      runId: `model-run.${modelProvenanceHash.slice(7, 31)}`,
    },
    refs: { manifestHash: manifest.contentHash, opportunityHash },
    payload: {
      briefId: brief.briefId,
      briefHash,
      modelProvenanceHash,
      transport: modelProvenance.transport,
      briefRole: "evidence-interpretation-only",
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
      adapter: SOURCE_EVOLUTION_ADAPTER.key,
      targetPath: SOURCE_EVOLUTION_TARGET_PATH,
      allowedFileCount: 1,
      generation: "deterministic-adapter",
      modelCodeAccepted: false,
      briefRole: "evidence-interpretation-only",
      implementsBrief: false,
      adapterCandidateBasis: "deterministic-opportunity-and-host",
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
    schemaVersion: "living.source-evolution-state/v1",
    evolutionId,
    app,
    status: "prepared",
    bindings,
    inputs: { manifest, opportunity, brief },
    modelProvenance,
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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new SourceEvolutionError(
        "EVOLUTION_ALREADY_EXISTS",
        `Evolution '${evolutionId}' has already been prepared`,
      );
    }
    throw error;
  }
  const statePath = path.join(evolutionDirectory, "state.json");
  const receiptsPath = path.join(evolutionDirectory, "receipts.ndjson");
  await writeNewFile(
    receiptsPath,
    receipts.map(serializeEvolutionReceipt).join(""),
  );
  await writeNewFile(statePath, `${canonicalJson(state)}\n`);
  return state;
}

async function approveSourceEvolutionUnlocked(
  input: ApproveSourceEvolutionInput,
): Promise<SourceEvolutionState> {
  const humanId = identifierSchema.parse(input.humanId);
  const loaded = await loadEvolution(input.root, input.evolutionId);
  const { state } = loaded;
  assertExpectedRevision(state, input.expectedRevision);
  if (state.status !== "prepared") {
    throw new SourceEvolutionError(
      "EVOLUTION_REPLAY_REJECTED",
      `Approval is valid only from prepared state, not '${state.status}'`,
    );
  }
  if (
    input.expectedArtifactHash !== state.artifact.contentHash ||
    input.expectedProofHash !== state.proof.proofHash
  ) {
    throw new SourceEvolutionError(
      "APPROVAL_HASH_MISMATCH",
      "Human approval hashes do not match the exact prepared artifact and proof",
    );
  }
  const recordedAt = now(input.clock);
  const additions: EvolutionReceipt[] = [];
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
  ] as const) {
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
      payload: payload as JsonObject,
    });
    additions.push(receipt);
    previousHash = receipt.receiptHash;
  }
  const approvalReceipt = additions.at(-1);
  if (approvalReceipt === undefined) {
    throw new SourceEvolutionError(
      "STATE_TAMPERED",
      "Approval receipt generation failed",
    );
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
  return commitLifecycleTransaction(loaded, next, additions, "approve", null);
}

async function applySourceEvolutionUnlocked(
  input: ApplySourceEvolutionInput,
): Promise<SourceEvolutionState> {
  const loaded = await loadEvolution(input.root, input.evolutionId);
  const { state } = loaded;
  assertExpectedRevision(state, input.expectedRevision);
  if (state.status === "prepared") {
    throw new SourceEvolutionError(
      "APPROVAL_REQUIRED",
      "A human must approve the exact artifact and proof before application",
    );
  }
  if (state.status !== "approved" || state.approval === null) {
    throw new SourceEvolutionError(
      "EVOLUTION_REPLAY_REJECTED",
      `Application is valid only from approved state, not '${state.status}'`,
    );
  }
  if (
    state.approval.contractHash !== state.contract.contentHash ||
    state.approval.artifactHash !== state.artifact.contentHash ||
    state.approval.proofHash !== state.proof.proofHash
  ) {
    throw new SourceEvolutionError(
      "APPROVAL_HASH_MISMATCH",
      "Stored human approval is not sealed to this exact evolution",
    );
  }
  // Approval is bound to the installed application identity as well as the
  // exact source bytes. Re-check at the mutation boundary so a copied ledger
  // or an uninstall/reinstall drift cannot authorize another host.
  await validateInstalledHost(loaded.root, state.app);
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
      targetPath: SOURCE_EVOLUTION_TARGET_PATH,
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
  return commitLifecycleTransaction(loaded, next, [receipt], "apply", {
    fromHash: state.artifact.target.preimageHash,
    toHash: state.artifact.target.postimageHash,
  });
}

async function rollbackSourceEvolutionUnlocked(
  input: RollbackSourceEvolutionInput,
): Promise<SourceEvolutionState> {
  const humanId = identifierSchema.parse(input.humanId);
  const loaded = await loadEvolution(input.root, input.evolutionId);
  const { state } = loaded;
  assertExpectedRevision(state, input.expectedRevision);
  if (state.status !== "applied" || state.application === null) {
    throw new SourceEvolutionError(
      "EVOLUTION_REPLAY_REJECTED",
      `Rollback is valid only from applied state, not '${state.status}'`,
    );
  }
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
      targetPath: SOURCE_EVOLUTION_TARGET_PATH,
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
  return commitLifecycleTransaction(loaded, next, [receipt], "rollback", {
    fromHash: state.artifact.target.postimageHash,
    toHash: state.artifact.target.preimageHash,
  });
}

async function getEvolutionStatusUnlocked(
  root: string,
  evolutionId: string,
): Promise<SourceEvolutionState> {
  return (await loadEvolution(root, evolutionId)).state;
}

export async function approveSourceEvolution(
  input: ApproveSourceEvolutionInput,
): Promise<SourceEvolutionState> {
  return withEvolutionLock(input.root, input.evolutionId, () =>
    approveSourceEvolutionUnlocked(input),
  );
}

export async function applySourceEvolution(
  input: ApplySourceEvolutionInput,
): Promise<SourceEvolutionState> {
  return withEvolutionLock(input.root, input.evolutionId, () =>
    applySourceEvolutionUnlocked(input),
  );
}

export async function rollbackSourceEvolution(
  input: RollbackSourceEvolutionInput,
): Promise<SourceEvolutionState> {
  return withEvolutionLock(input.root, input.evolutionId, () =>
    rollbackSourceEvolutionUnlocked(input),
  );
}

export async function getEvolutionStatus(
  root: string,
  evolutionId: string,
): Promise<SourceEvolutionState> {
  return withEvolutionLock(root, evolutionId, () =>
    getEvolutionStatusUnlocked(root, evolutionId),
  );
}

export async function listEvolutionStatuses(
  rootInput: string,
): Promise<readonly SourceEvolutionSummary[]> {
  const root = await repositoryRoot(rootInput);
  const base = path.join(root, ...safeSegments(STORAGE_ROOT));
  if ((await statOrUndefined(base)) === undefined) return [];
  await assertSafeDirectory(root, STORAGE_ROOT);
  const entries = await readdir(base, { withFileTypes: true });
  const summaries: SourceEvolutionSummary[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (!EVOLUTION_ID.test(entry.name)) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new SourceEvolutionError(
        "UNSAFE_TARGET",
        `Evolution storage entry is not a real directory: ${entry.name}`,
      );
    }
    const state = await getEvolutionStatus(root, entry.name);
    summaries.push(
      sourceEvolutionSummarySchema.parse({
        evolutionId: state.evolutionId,
        appId: state.app.appId,
        status: state.status,
        targetPath: state.artifact.target.path,
        artifactHash: state.artifact.contentHash,
        proofHash: state.proof.proofHash,
        updatedAt: state.updatedAt,
      }),
    );
  }
  return summaries;
}
