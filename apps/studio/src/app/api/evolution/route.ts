import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { loadAutomaticEvolutionInput } from "@living-software/cli";
import {
  gpt56EvolutionBriefSchema,
  intelligenceProvenanceSchema,
} from "@living-software/contracts";
import {
  applySourceEvolution,
  approveSourceEvolution,
  compileLeadReviewNavigation,
  getEvolutionStatus,
  listEvolutionStatuses,
  prepareSourceEvolution,
  rollbackSourceEvolution,
  SOURCE_EVOLUTION_TARGET_PATH,
  type SourceEvolutionState,
} from "@living-software/evolution";
import {
  createCodexCliTransport,
  createFetchTransport,
  createIntelligenceClient,
} from "@living-software/intelligence";

import { loadStudioEvolutionConnection } from "@/lib/evolution-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const MAX_COMMAND_BYTES = 4 * 1024;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

type CommandBody = Readonly<{
  action: "prepare" | "approve" | "activate" | "rollback";
  appId: string;
  snapshotHash: string;
  opportunityId: string | null;
  eventSetHash: string | null;
  evolutionId?: string;
  expectedRevision?: number;
  provider?: "codex" | "api";
  approver?: string;
  confirmed?: boolean;
  expectedArtifactHash?: string;
  expectedProofHash?: string;
}>;

let commandInFlight = false;
const patchPreviewCache = new Map<string, string | null>();

function emptyStatus(
  connected: boolean,
  error?: string,
): Record<string, unknown> {
  return {
    connected,
    phase: "ready",
    evolutionId: null,
    revision: 0,
    title: null,
    interpretation: null,
    proposalSummary: null,
    modelChangeSummary: null,
    modelAffectedNodeIds: [],
    targetPath: null,
    preHash: null,
    postHash: null,
    hostSourceHash: null,
    artifactHash: null,
    proofHash: null,
    patchPreview: null,
    proofPassed: false,
    approvalActor: null,
    receiptCount: 0,
    provider: null,
    evidenceRelation: null,
    ...(error === undefined ? {} : { error }),
  };
}

function phaseFor(
  status: SourceEvolutionState["status"],
): "draft_ready" | "approved" | "active" | "rolled_back" {
  switch (status) {
    case "prepared":
      return "draft_ready";
    case "approved":
      return "approved";
    case "applied":
      return "active";
    case "rolled-back":
      return "rolled_back";
  }
}

function projectStatus(
  state: SourceEvolutionState,
  evidenceRelation: "exact" | "stale",
  error?: string,
): Record<string, unknown> {
  return {
    connected: true,
    phase: phaseFor(state.status),
    evolutionId: state.evolutionId,
    revision: state.receiptCount,
    title: state.inputs.brief.title,
    interpretation: state.inputs.brief.interpretation,
    proposalSummary:
      "Add Previous/Next lead review navigation to remove repeated list backtracking.",
    modelChangeSummary: state.inputs.brief.proposedChange.summary,
    modelAffectedNodeIds: state.inputs.brief.proposedChange.affectedProductNodeIds,
    targetPath: state.artifact.target.path,
    preHash: state.artifact.target.preimageHash,
    postHash: state.artifact.target.postimageHash,
    artifactHash: state.artifact.contentHash,
    proofHash: state.proof.proofHash,
    patchPreview: cachedPatchPreview(state),
    proofPassed: state.proof.verdict === "passed",
    approvalActor: state.approval?.humanId ?? null,
    receiptCount: state.receiptCount,
    provider:
      state.modelProvenance.transport === "codex-cli" ? "codex" : "api",
    evidenceRelation,
    ...(error === undefined ? {} : { error }),
  };
}

type DiffLine = Readonly<{
  kind: "same" | "remove" | "add";
  value: string;
  oldLine: number;
  newLine: number;
}>;

function cachedPatchPreview(state: SourceEvolutionState): string | null {
  const key = state.artifact.contentHash;
  if (patchPreviewCache.has(key)) return patchPreviewCache.get(key) ?? null;
  let preview: string | null = null;
  try {
    preview = unifiedPatchPreview(
      state.source.preimage,
      state.source.postimage,
      state.artifact.target.path,
    );
  } catch {
    preview = null;
  }
  if (patchPreviewCache.size >= 8) {
    const oldest = patchPreviewCache.keys().next().value as string | undefined;
    if (oldest !== undefined) patchPreviewCache.delete(oldest);
  }
  patchPreviewCache.set(key, preview);
  return preview;
}

function unifiedPatchPreview(
  before: string,
  after: string,
  targetPath: string,
): string | null {
  const left = before.replaceAll("\r\n", "\n").split("\n");
  const right = after.replaceAll("\r\n", "\n").split("\n");
  if (left.length > 2_000 || right.length > 2_000) {
    return null;
  }
  const width = right.length + 1;
  const table = new Uint32Array((left.length + 1) * width);
  for (let oldIndex = left.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = right.length - 1; newIndex >= 0; newIndex -= 1) {
      const offset = oldIndex * width + newIndex;
      table[offset] = left[oldIndex] === right[newIndex]
        ? table[(oldIndex + 1) * width + newIndex + 1]! + 1
        : Math.max(
            table[(oldIndex + 1) * width + newIndex]!,
            table[oldIndex * width + newIndex + 1]!,
          );
    }
  }

  const operations: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let oldLine = 1;
  let newLine = 1;
  while (oldIndex < left.length || newIndex < right.length) {
    if (
      oldIndex < left.length &&
      newIndex < right.length &&
      left[oldIndex] === right[newIndex]
    ) {
      operations.push({
        kind: "same",
        value: left[oldIndex]!,
        oldLine,
        newLine,
      });
      oldIndex += 1;
      newIndex += 1;
      oldLine += 1;
      newLine += 1;
    } else if (
      newIndex < right.length &&
      (
        oldIndex >= left.length ||
        table[oldIndex * width + newIndex + 1]! >=
          table[(oldIndex + 1) * width + newIndex]!
      )
    ) {
      operations.push({
        kind: "add",
        value: right[newIndex]!,
        oldLine,
        newLine,
      });
      newIndex += 1;
      newLine += 1;
    } else {
      operations.push({
        kind: "remove",
        value: left[oldIndex]!,
        oldLine,
        newLine,
      });
      oldIndex += 1;
      oldLine += 1;
    }
  }

  const changed = operations.flatMap((line, index) =>
    line.kind === "same" ? [] : [index],
  );
  if (changed.length === 0) return null;
  const included = new Set<number>();
  for (const index of changed) {
    for (
      let context = Math.max(0, index - 3);
      context <= Math.min(operations.length - 1, index + 3);
      context += 1
    ) {
      included.add(context);
    }
  }

  const output = [`--- a/${targetPath}`, `+++ b/${targetPath}`];
  let cursor = 0;
  while (cursor < operations.length) {
    while (cursor < operations.length && !included.has(cursor)) cursor += 1;
    if (cursor >= operations.length) break;
    const start = cursor;
    while (cursor < operations.length && included.has(cursor)) cursor += 1;
    const hunk = operations.slice(start, cursor);
    const oldStart = hunk[0]!.oldLine;
    const newStart = hunk[0]!.newLine;
    const oldCount = hunk.filter((line) => line.kind !== "add").length;
    const newCount = hunk.filter((line) => line.kind !== "remove").length;
    output.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const line of hunk) {
      output.push(
        (line.kind === "same" ? " " : line.kind === "add" ? "+" : "-") +
          line.value,
      );
    }
  }
  const preview = output.join("\n");
  if (Buffer.byteLength(preview, "utf8") > 100_000) {
    return null;
  }
  return preview;
}

function json(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function assertLocalRequest(request: Request): void {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.LIVING_STUDIO_EVOLUTION_ENABLED !== "1"
  ) {
    throw new TypeError(
      "Local evolution controls are disabled outside the explicit development broker",
    );
  }
  const url = new URL(request.url);
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new TypeError("Local evolution controls are available only on loopback");
  }
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== url.origin) {
    throw new TypeError("Cross-origin evolution commands are not allowed");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Evolution command must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function parseCommand(value: unknown): CommandBody {
  const body = asRecord(value);
  const action = body.action;
  if (
    action !== "prepare" &&
    action !== "approve" &&
    action !== "activate" &&
    action !== "rollback"
  ) {
    throw new TypeError("Unknown evolution action");
  }
  if (typeof body.appId !== "string" || !IDENTIFIER.test(body.appId)) {
    throw new TypeError("Invalid application identity");
  }
  const allowed = new Set([
    "action",
    "appId",
    "snapshotHash",
    "opportunityId",
    "eventSetHash",
  ]);
  const validOpportunityId =
    body.opportunityId === null ||
    (typeof body.opportunityId === "string" && IDENTIFIER.test(body.opportunityId));
  const validEventSetHash =
    body.eventSetHash === null ||
    (typeof body.eventSetHash === "string" && SHA256.test(body.eventSetHash));
  if (
    typeof body.snapshotHash !== "string" ||
    !SHA256.test(body.snapshotHash) ||
    !validOpportunityId ||
    !validEventSetHash ||
    (body.opportunityId === null) !== (body.eventSetHash === null) ||
    (action !== "rollback" && body.opportunityId === null)
  ) {
    throw new TypeError("Command requires the exact rendered snapshot identity");
  }
  if (action !== "prepare") {
    allowed.add("evolutionId");
    allowed.add("expectedRevision");
    if (
      typeof body.evolutionId !== "string" ||
      !IDENTIFIER.test(body.evolutionId) ||
      !Number.isSafeInteger(body.expectedRevision) ||
      Number(body.expectedRevision) < 1
    ) {
      throw new TypeError(
        "Lifecycle commands require an evolution id and expected revision",
      );
    }
  }
  if (action === "prepare") {
    allowed.add("provider");
    if (body.provider !== "codex" && body.provider !== "api") {
      throw new TypeError("Prepare requires provider codex or api");
    }
  }
  if (action === "approve") {
    allowed.add("approver");
    allowed.add("confirmed");
    allowed.add("expectedArtifactHash");
    allowed.add("expectedProofHash");
    if (
      body.confirmed !== true ||
      typeof body.approver !== "string" ||
      !IDENTIFIER.test(body.approver) ||
      typeof body.expectedArtifactHash !== "string" ||
      !SHA256.test(body.expectedArtifactHash) ||
      typeof body.expectedProofHash !== "string" ||
      !SHA256.test(body.expectedProofHash)
    ) {
      throw new TypeError(
        "Approval requires a human id, explicit confirmation, and exact hashes",
      );
    }
  }
  if (action === "rollback") {
    allowed.add("approver");
    if (typeof body.approver !== "string" || !IDENTIFIER.test(body.approver)) {
      throw new TypeError("Rollback requires a human id");
    }
  }
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new TypeError("Evolution command contains unknown fields");
  }
  return body as CommandBody;
}

async function readTargetPreimage(rootInput: string): Promise<string> {
  const root = await realpath(rootInput);
  const target = path.resolve(root, ...SOURCE_EVOLUTION_TARGET_PATH.split("/"));
  const relative = path.relative(root, target);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new TypeError("Evolution target escaped the connected host root");
  }
  const parent = await realpath(path.dirname(target));
  const parentRelative = path.relative(root, parent);
  if (
    parentRelative === ".." ||
    parentRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(parentRelative)
  ) {
    throw new TypeError("Evolution target traversed a symlink outside the host");
  }
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000) {
    throw new TypeError("Evolution target must be a bounded regular file");
  }
  return readFile(target, "utf8");
}

function stateMatchesEvidence(
  state: SourceEvolutionState,
  connection: NonNullable<Awaited<ReturnType<typeof loadStudioEvolutionConnection>>>,
): boolean {
  return (
    connection.opportunityId !== null &&
    connection.eventSetHash !== null &&
    state.app.appId === connection.appId &&
    state.app.manifestHash === connection.manifestHash &&
    state.bindings.opportunityId === connection.opportunityId &&
    state.inputs.opportunity.evidence.eventSetHash === connection.eventSetHash
  );
}

type AutomaticAnalysisIdentity = Readonly<{
  appId: string;
  manifestHash: string;
  opportunityId: string;
  eventSetHash: string;
  snapshotHash: string;
}>;

export function assertCurrentAnalysisIdentityMatches(
  current: AutomaticAnalysisIdentity,
  expected: AutomaticAnalysisIdentity,
): void {
  if (
    current.appId !== expected.appId ||
    current.manifestHash !== expected.manifestHash ||
    current.opportunityId !== expected.opportunityId ||
    current.eventSetHash !== expected.eventSetHash ||
    current.snapshotHash !== expected.snapshotHash
  ) {
    throw new TypeError("Connected evidence identity changed; sync Studio again");
  }
}

async function currentState(
  root: string,
  connection: NonNullable<Awaited<ReturnType<typeof loadStudioEvolutionConnection>>>,
): Promise<Readonly<{
  state: SourceEvolutionState;
  evidenceRelation: "exact" | "stale";
}> | null> {
  const summaries = await listEvolutionStatuses(root);
  const newestFirst = [...summaries].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  const states: SourceEvolutionState[] = [];
  for (const summary of newestFirst) {
    const state = await getEvolutionStatus(root, summary.evolutionId);
    if (state.app.appId === connection.appId) states.push(state);
  }
  const active = states.find((state) => state.status === "applied");
  if (active !== undefined) {
    return {
      state: active,
      evidenceRelation: stateMatchesEvidence(active, connection) ? "exact" : "stale",
    };
  }
  const exact = states.find((state) => stateMatchesEvidence(state, connection));
  if (exact !== undefined) return { state: exact, evidenceRelation: "exact" };
  return null;
}

async function connectionAndState() {
  const connection = await loadStudioEvolutionConnection();
  if (connection === null) {
    return { connection: null, state: null, evidenceRelation: null };
  }
  const selected = await currentState(connection.hostRoot, connection);
  return {
    connection,
    state: selected?.state ?? null,
    evidenceRelation: selected?.evidenceRelation ?? null,
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    assertLocalRequest(request);
    const { connection, state, evidenceRelation } = await connectionAndState();
    if (connection === null) {
      return json(emptyStatus(false, "Run studio:sync with the instrumented CRM first"), 503);
    }
    if (state === null) return json(emptyStatus(true));
    const hostSource = await readTargetPreimage(connection.hostRoot);
    const hostSourceHash =
      `sha256:${createHash("sha256").update(hostSource, "utf8").digest("hex")}`;
    return json({
      ...projectStatus(state, evidenceRelation ?? "stale"),
      hostSourceHash,
    });
  } catch (error) {
    return json(
      emptyStatus(false, error instanceof Error ? error.message : "Evolution status failed"),
      500,
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  let lastState: SourceEvolutionState | null = null;
  let lastEvidenceRelation: "exact" | "stale" = "stale";
  let acquiredCommandLock = false;
  try {
    assertLocalRequest(request);
    if (commandInFlight) {
      return json(emptyStatus(true, "Another evolution command is still running"), 409);
    }
    commandInFlight = true;
    acquiredCommandLock = true;
    const contentType = request.headers.get("content-type") ?? "";
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (
      !contentType.toLowerCase().startsWith("application/json") ||
      !Number.isFinite(contentLength) ||
      contentLength > MAX_COMMAND_BYTES
    ) {
      throw new TypeError("Evolution commands require bounded application/json");
    }
    const source = await request.text();
    if (Buffer.byteLength(source, "utf8") > MAX_COMMAND_BYTES) {
      throw new TypeError("Evolution command is too large");
    }
    const command = parseCommand(JSON.parse(source) as unknown);
    const { connection, state, evidenceRelation } = await connectionAndState();
    lastState = state;
    lastEvidenceRelation = evidenceRelation ?? "stale";
    if (connection === null) {
      return json(emptyStatus(false, "Studio is not connected to an instrumented host"), 503);
    }
    if (command.appId !== connection.appId) {
      throw new TypeError("Command appId does not match the connected host");
    }
    if (
      command.snapshotHash !== connection.snapshotHash ||
      command.opportunityId !== connection.opportunityId ||
      command.eventSetHash !== connection.eventSetHash
    ) {
      throw new TypeError(
        "Studio evidence changed since this page rendered; refresh before continuing",
      );
    }

    let next: SourceEvolutionState;
    if (command.action === "prepare") {
      if (state !== null) {
        throw new TypeError("The current evolution must finish before preparing another");
      }
      const input = await loadAutomaticEvolutionInput(connection.hostRoot);
      assertCurrentAnalysisIdentityMatches(
        {
          appId: input.application.appId,
          manifestHash: input.application.manifestHash,
          opportunityId: input.opportunity.opportunityId,
          eventSetHash: input.opportunity.evidence.eventSetHash,
          snapshotHash: input.snapshotHash,
        },
        {
          appId: connection.appId,
          manifestHash: connection.manifestHash,
          opportunityId: connection.opportunityId!,
          eventSetHash: connection.eventSetHash!,
          snapshotHash: connection.snapshotHash,
        },
      );
      const preimage = await readTargetPreimage(connection.hostRoot);
      const postimage = compileLeadReviewNavigation(preimage);
      if (
        unifiedPatchPreview(
          preimage,
          postimage,
          SOURCE_EVOLUTION_TARGET_PATH,
        ) === null
      ) {
        throw new TypeError(
          "The deterministic candidate exceeds Studio's bounded review limits",
        );
      }
      const intelligence = createIntelligenceClient(
        command.provider === "codex"
          ? createCodexCliTransport()
          : createFetchTransport(),
        { timeoutMs: 120_000 },
      );
      const modelRun = await intelligence.draftEvolutionBrief({
        manifest: input.manifest,
        opportunity: input.opportunity,
        evidenceEvents: input.evidenceEvents,
      });
      next = await prepareSourceEvolution({
        root: connection.hostRoot,
        app: input.application,
        manifest: input.manifest,
        opportunity: input.opportunity,
        brief: gpt56EvolutionBriefSchema.parse(modelRun.draft),
        modelProvenance: intelligenceProvenanceSchema.parse(
          modelRun.provenance,
        ),
        target: {
          path: SOURCE_EVOLUTION_TARGET_PATH,
          preimage,
        },
      });
    } else {
      if (state === null) throw new TypeError("No prepared evolution exists");
      if (
        (
          command.action !== "rollback" &&
          !stateMatchesEvidence(state, connection)
        ) ||
        state.evolutionId !== command.evolutionId ||
        state.receiptCount !== command.expectedRevision
      ) {
        throw new TypeError(
          "Evolution identity or revision changed; refresh before continuing",
        );
      }
      if (command.action === "approve") {
        next = await approveSourceEvolution({
          root: connection.hostRoot,
          evolutionId: state.evolutionId,
          humanId: command.approver!,
          expectedArtifactHash: command.expectedArtifactHash!,
          expectedProofHash: command.expectedProofHash!,
          expectedRevision: command.expectedRevision!,
        });
      } else if (command.action === "activate") {
        next = await applySourceEvolution({
          root: connection.hostRoot,
          evolutionId: state.evolutionId,
          expectedRevision: command.expectedRevision!,
        });
      } else {
        next = await rollbackSourceEvolution({
          root: connection.hostRoot,
          evolutionId: state.evolutionId,
          humanId: command.approver!,
          expectedRevision: command.expectedRevision!,
        });
      }
    }
    return json(projectStatus(
      next,
      stateMatchesEvidence(next, connection) ? "exact" : "stale",
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evolution command failed";
    return json(
      lastState === null
        ? emptyStatus(true, message)
        : projectStatus(lastState, lastEvidenceRelation, message),
      error instanceof SyntaxError || error instanceof TypeError ? 400 : 409,
    );
  } finally {
    if (acquiredCommandLock) commandInFlight = false;
  }
}
