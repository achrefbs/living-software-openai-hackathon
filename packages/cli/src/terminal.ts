import {
  applySourceEvolution,
  approveSourceEvolution,
  getEvolutionStatus,
  listEvolutionStatuses,
  prepareSourceEvolution,
  rollbackSourceEvolution,
  type PrepareSourceEvolutionInput,
  type SourceEvolutionProgressObserver,
  type SourceEvolutionState,
  type SourceEvolutionSummary,
  sourcePatchModelProvenanceSchema,
  sourcePatchProposalSchema,
} from "@living-software/evolution";
import {
  gpt56EvolutionBriefSchema,
  intelligenceProvenanceSchema,
  parseInstallRecord,
} from "@living-software/contracts";
import {
  createCodexCliTransport,
  createFetchTransport,
  createIntelligenceClient,
  type DraftEvolutionBriefResult,
  type DraftSourcePatchResult,
  type IntelligenceLifecycleEvent,
  type IntelligenceLifecycleReporter,
  type IntelligenceClient,
  type IntelligenceTokenUsage,
} from "@living-software/intelligence";
import { isDeepStrictEqual } from "node:util";

import {
  loadAutomaticEvolutionInput,
  runRootCommand,
  type AutomaticEvolutionInput,
} from "./root-mode.js";
import {
  collectSourceCandidates,
  type SourceCandidate,
} from "./source-candidates.js";

export type TerminalProvider = "codex" | "api";

type BaseTerminalArguments = Readonly<{
  mode: "terminal";
  rootPath: string;
  json: boolean;
}>;

export type InstallArguments = BaseTerminalArguments & Readonly<{
  command: "install";
  synthetic: boolean;
}>;

export type ImproveArguments = BaseTerminalArguments & Readonly<{
  command: "improve";
  provider: TerminalProvider;
}>;

export type StatusArguments = BaseTerminalArguments & Readonly<{
  command: "status";
}>;

export type ApproveArguments = BaseTerminalArguments & Readonly<{
  command: "approve";
  evolutionId: string;
  actor: string;
  expectedArtifactHash: string;
  expectedProofHash: string;
  applyAfterApproval: boolean;
}>;

export type ApplyArguments = BaseTerminalArguments & Readonly<{
  command: "apply";
  evolutionId: string;
}>;

export type RollbackArguments = BaseTerminalArguments & Readonly<{
  command: "rollback";
  evolutionId: string;
  actor: string;
}>;

export type TerminalArguments =
  | InstallArguments
  | ImproveArguments
  | StatusArguments
  | ApproveArguments
  | ApplyArguments
  | RollbackArguments;

export type TerminalResult = Readonly<
  Record<string, unknown> & {
    schemaVersion: "living.terminal-result/v1";
    command: TerminalArguments["command"];
    outcome: string;
    message: string;
    nextCommand?: string;
  }
>;

export type TerminalModelOperation = "interpretation" | "source-patch";

/**
 * Safe, closed lifecycle metadata for the terminal-first improve path. Model
 * prompts, response text, reasoning, source content, stdout, and stderr are
 * deliberately absent.
 */
export type TerminalLifecycleEvent =
  | Readonly<{
      type: "evidence.package.validated";
      appId: string;
      manifestHash: string;
      opportunityId: string;
      eventSetHash: string;
      dataOrigin: AutomaticEvolutionInput["application"]["dataOrigin"];
    }>
  | Readonly<{
      type: "proposal.reused";
      summary: "Existing evidence-bound proposal reused";
      evolutionId: string;
      status: SourceEvolutionState["status"];
      artifactHash: string;
      proofHash: string;
      receiptCount: number;
    }>
  | Readonly<{
      type: "model.request.dispatched";
      operation: TerminalModelOperation;
      transport: IntelligenceLifecycleEvent["transport"];
    }>
  | Readonly<{
      type: "model.thread.started";
      operation: TerminalModelOperation;
      transport: "codex-cli";
      threadId: string;
    }>
  | Readonly<{
      type: "model.turn.started";
      operation: TerminalModelOperation;
      transport: "codex-cli";
      threadId: string;
    }>
  | Readonly<{
      type: "model.turn.completed";
      operation: TerminalModelOperation;
      transport: "codex-cli";
      threadId: string;
      tokenUsage: IntelligenceTokenUsage;
    }>
  | Readonly<{
      type: "model.result.validated";
      operation: TerminalModelOperation;
      transport: DraftEvolutionBriefResult["provenance"]["transport"];
      runId: string | null;
      tokenUsage: IntelligenceTokenUsage | null;
    }>
  | Readonly<{
      type: "source-candidates.selected";
      count: number;
      candidates: readonly Readonly<{
        path: string;
        preimageHash: string;
      }>[];
    }>
  | Readonly<{
      type: "evolution.preparation.started";
      proposalId: string;
      targetPath: string;
      preimageHash: string;
    }>
  | Readonly<{
      type: "evolution.prepared";
      evolutionId: string;
      targetPath: string;
      artifactHash: string;
      proofHash: string;
      preimageHash: string;
      postimageHash: string;
      proofChecks: readonly Readonly<{
        id: string;
        status: "passed" | "failed";
      }>[];
      receiptCount: number;
      chainHead: string;
    }>;

export type TerminalLifecycleReporter = (
  event: TerminalLifecycleEvent,
) => void;

export type TerminalRunOptions = Readonly<{
  lifecycleReporter?: TerminalLifecycleReporter;
  evolutionProgressObserver?: SourceEvolutionProgressObserver;
}>;

export type TerminalIntelligenceOptions = Readonly<{
  lifecycleReporter?: IntelligenceLifecycleReporter;
}>;

export type TerminalDependencies = Readonly<{
  runRoot: typeof runRootCommand;
  loadEvolutionInput: typeof loadAutomaticEvolutionInput;
  collectCandidates: typeof collectSourceCandidates;
  createIntelligence(
    provider: TerminalProvider,
    options?: TerminalIntelligenceOptions,
  ): IntelligenceClient;
  prepareEvolution(input: PrepareSourceEvolutionInput): Promise<SourceEvolutionState>;
  approveEvolution: typeof approveSourceEvolution;
  applyEvolution: typeof applySourceEvolution;
  rollbackEvolution: typeof rollbackSourceEvolution;
  getEvolution: typeof getEvolutionStatus;
  listEvolutions: typeof listEvolutionStatuses;
}>;

const defaultDependencies: TerminalDependencies = {
  runRoot: runRootCommand,
  loadEvolutionInput: loadAutomaticEvolutionInput,
  collectCandidates: collectSourceCandidates,
  createIntelligence(provider, options = {}) {
    return createIntelligenceClient(
      provider === "codex"
        ? createCodexCliTransport()
        : createFetchTransport(),
      {
        timeoutMs: 120_000,
        maxPatchOutputTokens: 8_000,
        ...(options.lifecycleReporter === undefined
          ? {}
          : { lifecycleReporter: options.lifecycleReporter }),
      },
    );
  },
  prepareEvolution: prepareSourceEvolution,
  approveEvolution: approveSourceEvolution,
  applyEvolution: applySourceEvolution,
  rollbackEvolution: rollbackSourceEvolution,
  getEvolution: getEvolutionStatus,
  listEvolutions: listEvolutionStatuses,
};

function result(
  command: TerminalArguments["command"],
  outcome: string,
  message: string,
  fields: Record<string, unknown> = {},
): TerminalResult {
  return Object.freeze({
    schemaVersion: "living.terminal-result/v1" as const,
    command,
    outcome,
    message,
    ...fields,
  });
}

function reportTerminalLifecycle(
  reporter: TerminalLifecycleReporter | undefined,
  event: TerminalLifecycleEvent,
): void {
  if (reporter === undefined) return;
  try {
    const reported = reporter(Object.freeze(event));
    void Promise.resolve(reported).catch(() => undefined);
  } catch {
    // Reporting is observational and must never alter lifecycle authority.
  }
}

function lifecycleTokenUsage(
  value: IntelligenceTokenUsage,
): IntelligenceTokenUsage;
function lifecycleTokenUsage(value: null): null;
function lifecycleTokenUsage(
  value: IntelligenceTokenUsage | null,
): IntelligenceTokenUsage | null;
function lifecycleTokenUsage(
  value: IntelligenceTokenUsage | null,
): IntelligenceTokenUsage | null {
  return value === null
    ? null
    : Object.freeze({
        inputTokens: value.inputTokens,
        cachedInputTokens: value.cachedInputTokens,
        outputTokens: value.outputTokens,
        reasoningOutputTokens: value.reasoningOutputTokens,
      });
}

function lifecycleRunId(value: string | null): string | null {
  return value !== null && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value)
    ? value
    : null;
}

function modelOperation(
  schemaName: IntelligenceLifecycleEvent["schemaName"],
): TerminalModelOperation {
  return schemaName === "living_evolution_brief"
    ? "interpretation"
    : "source-patch";
}

function reportIntelligenceToTerminal(
  reporter: TerminalLifecycleReporter | undefined,
  event: IntelligenceLifecycleEvent,
): void {
  const operation = modelOperation(event.schemaName);
  switch (event.type) {
    case "request.dispatched":
      reportTerminalLifecycle(reporter, {
        type: "model.request.dispatched",
        operation,
        transport: event.transport,
      });
      return;
    case "thread.started":
      reportTerminalLifecycle(reporter, {
        type: "model.thread.started",
        operation,
        transport: "codex-cli",
        threadId: event.threadId,
      });
      return;
    case "turn.started":
      reportTerminalLifecycle(reporter, {
        type: "model.turn.started",
        operation,
        transport: "codex-cli",
        threadId: event.threadId,
      });
      return;
    case "turn.completed":
      reportTerminalLifecycle(reporter, {
        type: "model.turn.completed",
        operation,
        transport: "codex-cli",
        threadId: event.threadId,
        tokenUsage: lifecycleTokenUsage(event.tokenUsage),
      });
  }
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function nextCommand(
  root: string,
  state:
    | Pick<
        SourceEvolutionState,
        "evolutionId" | "status" | "artifact" | "proof"
      >
    | Pick<
        SourceEvolutionSummary,
        "evolutionId" | "status" | "artifactHash" | "proofHash"
      >,
): string | undefined {
  switch (state.status) {
    case "prepared": {
      const artifactHash = "artifact" in state
        ? state.artifact.contentHash
        : state.artifactHash;
      const proofHash = "proof" in state
        ? state.proof.proofHash
        : state.proofHash;
      return `npm run living -- approve --root ${quote(root)} --evolution ${state.evolutionId} --actor hackathon-demo --artifact-hash ${artifactHash} --proof-hash ${proofHash} --apply`;
    }
    case "approved":
      return `npm run living -- apply --root ${quote(root)} --evolution ${state.evolutionId}`;
    case "applied":
      return `npm run living -- rollback --root ${quote(root)} --evolution ${state.evolutionId} --actor hackathon-demo`;
    case "rolled-back":
      return undefined;
  }
}

function evolutionProjection(state: SourceEvolutionState): Record<string, unknown> {
  return {
    evolutionId: state.evolutionId,
    status: state.status,
    targetPath: state.artifact.target.path,
    artifactHash: state.artifact.contentHash,
    proofHash: state.proof.proofHash,
    proofVerdict: state.proof.verdict,
    proofChecks: state.proof.checks.length,
    receiptCount: state.receiptCount,
    updatedAt: state.updatedAt,
  };
}

const MAX_PATCH_PREVIEW_BYTES = 12 * 1024;

function boundedPatchPreview(
  edits: DraftSourcePatchResult["proposal"]["edits"],
): Readonly<{
  text: string;
  truncated: boolean;
  totalBytes: number;
}> {
  const exact = edits
    .flatMap((edit, index) => [
      `@@ edit ${index + 1} @@`,
      `- ${JSON.stringify(edit.anchor)}`,
      `+ ${JSON.stringify(edit.replacement)}`,
    ])
    .join("\n");
  const totalBytes = Buffer.byteLength(exact, "utf8");
  if (totalBytes <= MAX_PATCH_PREVIEW_BYTES) {
    return { text: exact, truncated: false, totalBytes };
  }
  let low = 0;
  let high = Math.min(exact.length, MAX_PATCH_PREVIEW_BYTES);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (
      Buffer.byteLength(exact.slice(0, middle), "utf8") <=
      MAX_PATCH_PREVIEW_BYTES
    ) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return {
    text: `${exact.slice(0, low)}\n… [preview truncated; exact patch remains hash-bound in the local evolution ledger]`,
    truncated: true,
    totalBytes,
  };
}

function proposalProjection(
  patch: DraftSourcePatchResult,
): Record<string, unknown> {
  return {
    proposalId: patch.proposal.proposalId,
    summary: patch.proposal.summary,
    rationale: patch.proposal.rationale,
    targetPath: patch.proposal.target.path,
    preimageHash: patch.proposal.target.preimageHash,
    edits: patch.proposal.edits.map((edit, index) => ({
      number: index + 1,
      anchorCharacters: edit.anchor.length,
      replacementCharacters: edit.replacement.length,
      anchorPreview: edit.anchor.replace(/\s+/gu, " ").trim().slice(0, 120),
    })),
    patchPreview: boundedPatchPreview(patch.proposal.edits),
  };
}

function storedProposalProjection(
  state: SourceEvolutionState,
): Record<string, unknown> | null {
  const inputs = record(state.inputs);
  const patch = record(inputs?.patchProposal);
  if (patch === null) return null;
  const target = record(patch.target);
  const edits = Array.isArray(patch.edits)
    ? patch.edits.filter(
        (edit): edit is Readonly<{ anchor: string; replacement: string }> => {
          const candidate = record(edit);
          return (
            candidate !== null &&
            typeof candidate.anchor === "string" &&
            typeof candidate.replacement === "string"
          );
        },
      )
    : [];
  if (
    typeof patch.proposalId !== "string" ||
    typeof patch.summary !== "string" ||
    target === null ||
    typeof target.path !== "string"
  ) {
    return null;
  }
  return {
    proposalId: patch.proposalId,
    summary: patch.summary,
    rationale:
      typeof patch.rationale === "string" ? patch.rationale : "",
    targetPath: target.path,
    edits: edits.map((edit, index) => ({
      number: index + 1,
      anchorCharacters: edit.anchor.length,
      replacementCharacters: edit.replacement.length,
    })),
    patchPreview: boundedPatchPreview(edits),
  };
}

function storedProviderProjection(
  state: SourceEvolutionState,
): Record<string, unknown> | null {
  const combined = record(state.modelProvenance);
  const brief = record(combined?.brief);
  const patch = record(combined?.patch);
  if (patch === null) return null;
  return {
    requested:
      patch.transport === "codex-cli" ? "codex" : "api",
    briefTransport: brief?.transport ?? null,
    briefRunId: brief?.codexThreadId ?? brief?.responseId ?? null,
    patchTransport: patch.transport ?? null,
    patchRunId: patch.codexThreadId ?? patch.responseId ?? null,
  };
}

async function exactExistingEvolution(
  root: string,
  input: AutomaticEvolutionInput,
  dependencies: TerminalDependencies,
  summaries: readonly SourceEvolutionSummary[],
): Promise<SourceEvolutionState | null> {
  for (const summary of summaries) {
    if (summary.appId !== input.application.appId) continue;
    const state = await dependencies.getEvolution(root, summary.evolutionId);
    if (
      state.app.appId === input.application.appId &&
      state.bindings.manifestHash === input.application.manifestHash &&
      state.bindings.opportunityId === input.opportunity.opportunityId &&
      isDeepStrictEqual(state.inputs.opportunity, input.opportunity)
    ) {
      return state;
    }
  }
  return null;
}

const ACTIVE_EVOLUTION_STATUSES = new Set<SourceEvolutionState["status"]>([
  "approved",
  "applied",
]);

function conflictingActiveEvolution(
  summaries: readonly SourceEvolutionSummary[],
  appId: string,
  currentEvolutionId?: string,
): SourceEvolutionSummary | undefined {
  return summaries.find(
    (summary) =>
      summary.appId === appId &&
      summary.evolutionId !== currentEvolutionId &&
      ACTIVE_EVOLUTION_STATUSES.has(summary.status),
  );
}

async function assertNoConflictingActiveEvolution(
  root: string,
  appId: string,
  dependencies: TerminalDependencies,
  action: "prepare" | "approve" | "apply",
  currentEvolutionId?: string,
): Promise<void> {
  const conflict = conflictingActiveEvolution(
    await dependencies.listEvolutions(root),
    appId,
    currentEvolutionId,
  );
  if (conflict !== undefined) {
    throw new TypeError(
      `Evolution '${conflict.evolutionId}' is already ${conflict.status} for app '${appId}'. Roll it back before attempting to ${action} another evolution.`,
    );
  }
}

async function install(
  args: InstallArguments,
  dependencies: TerminalDependencies,
): Promise<TerminalResult> {
  const installed = await dependencies.runRoot("init", {
    root: args.rootPath,
    apply: true,
    synthetic: args.synthetic,
    syntheticSpecified: true,
  });
  const discovery = installed.discovery as
    | Readonly<{
        manifest?: Readonly<{
          appId?: string;
          contentHash?: string;
          nodes?: readonly unknown[];
          edges?: readonly unknown[];
        }>;
        stats?: Readonly<Record<string, unknown>>;
      }>
    | undefined;
  const installResult = installed.result as
    | Readonly<{ status?: string; record?: unknown }>
    | undefined;
  if (
    discovery?.manifest?.appId === undefined ||
    discovery.manifest.contentHash === undefined ||
    (installResult?.status !== "installed" &&
      installResult?.status !== "unchanged") ||
    installResult.record === undefined
  ) {
    throw new TypeError(
      "Installation did not return a validated public install result",
    );
  }
  const installRecord = parseInstallRecord(installResult.record);
  if (
    installRecord.appId !== discovery.manifest.appId ||
    installRecord.manifestHash !== discovery.manifest.contentHash
  ) {
    throw new TypeError(
      "Installed record identity does not match the discovered application",
    );
  }
  const application = {
    appId: discovery.manifest.appId,
    nodes: discovery.manifest.nodes?.length ?? 0,
    edges: discovery.manifest.edges?.length ?? 0,
  };
  return result(
    "install",
    installResult.status,
    "Living Software is installed and observation is ready.",
    {
      root: installed.root,
      synthetic: args.synthetic,
      application,
      installRecord: {
        installId: installRecord.installId,
        manifestHash: installRecord.manifestHash,
        mutationPolicy: installRecord.mutationPolicy,
      },
      nextCommand: `npm run living -- improve --root ${quote(args.rootPath)} --provider codex`,
    },
  );
}

async function improve(
  args: ImproveArguments,
  dependencies: TerminalDependencies,
  options: TerminalRunOptions,
): Promise<TerminalResult> {
  const input = await dependencies.loadEvolutionInput(args.rootPath);
  reportTerminalLifecycle(options.lifecycleReporter, {
    type: "evidence.package.validated",
    appId: input.application.appId,
    manifestHash: input.application.manifestHash,
    opportunityId: input.opportunity.opportunityId,
    eventSetHash: input.opportunity.evidence.eventSetHash,
    dataOrigin: input.application.dataOrigin,
  });
  const summaries = [...await dependencies.listEvolutions(args.rootPath)].sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt),
  );
  const existing = await exactExistingEvolution(
    args.rootPath,
    input,
    dependencies,
    summaries,
  );
  const activeConflict = conflictingActiveEvolution(
    summaries,
    input.application.appId,
    existing?.evolutionId,
  );
  if (activeConflict !== undefined) {
    throw new TypeError(
      `Evolution '${activeConflict.evolutionId}' is already ${activeConflict.status} for app '${input.application.appId}'. Roll it back before attempting to prepare another evolution.`,
    );
  }
  if (existing !== null) {
    if (existing.status === "rolled-back") {
      throw new TypeError(
        "This evidence already produced a rolled-back evolution. Capture new workflow evidence before improving again.",
      );
    }
    reportTerminalLifecycle(options.lifecycleReporter, {
      type: "proposal.reused",
      summary: "Existing evidence-bound proposal reused",
      evolutionId: existing.evolutionId,
      status: existing.status,
      artifactHash: existing.artifact.contentHash,
      proofHash: existing.proof.proofHash,
      receiptCount: existing.receiptCount,
    });
    return result(
      "improve",
      existing.status,
      "Existing evidence-bound proposal reused. No model call was made.",
      {
        root: input.root,
        reused: true,
        opportunity: {
          opportunityId: input.opportunity.opportunityId,
          signal: input.opportunity.signal.kind,
          confidence: input.opportunity.confidence.score,
        },
      evolution: evolutionProjection(existing),
      nextCommand: nextCommand(input.root, existing),
      ...(existing.status === "prepared"
        ? {
            nextActionDetail:
              "The recommended command records exact human approval, then writes that same approved postimage.",
          }
        : {}),
      },
    );
  }

  const intelligence = dependencies.createIntelligence(args.provider, {
    lifecycleReporter: (event) =>
      reportIntelligenceToTerminal(options.lifecycleReporter, event),
  });
  const brief = await intelligence.draftEvolutionBrief({
    manifest: input.manifest,
    opportunity: input.opportunity,
    evidenceEvents: input.evidenceEvents,
  });
  reportTerminalLifecycle(options.lifecycleReporter, {
    type: "model.result.validated",
    operation: "interpretation",
    transport: brief.provenance.transport,
    runId: lifecycleRunId(
      brief.provenance.codexThreadId ?? brief.provenance.responseId,
    ),
    tokenUsage: lifecycleTokenUsage(brief.provenance.tokenUsage),
  });
  const candidates = await dependencies.collectCandidates({
    repositoryRoot: input.root,
    manifest: input.manifest,
    brief: {
      affectedProductNodeIds:
        brief.draft.proposedChange.affectedProductNodeIds,
    },
  });
  reportTerminalLifecycle(options.lifecycleReporter, {
    type: "source-candidates.selected",
    count: candidates.length,
    candidates: Object.freeze(
      candidates.map((candidate) =>
        Object.freeze({
          path: candidate.path,
          preimageHash: candidate.preimageHash,
        })
      ),
    ),
  });
  const patch = await intelligence.draftSourcePatch({
    brief: brief.draft,
    candidates,
  });
  reportTerminalLifecycle(options.lifecycleReporter, {
    type: "model.result.validated",
    operation: "source-patch",
    transport: patch.provenance.transport,
    runId: lifecycleRunId(
      patch.provenance.codexThreadId ?? patch.provenance.responseId,
    ),
    tokenUsage: lifecycleTokenUsage(patch.provenance.tokenUsage),
  });
  const target = candidates.find(
    (candidate: SourceCandidate) =>
      candidate.path === patch.proposal.target.path &&
      candidate.preimageHash === patch.proposal.target.preimageHash,
  );
  if (target === undefined) {
    throw new TypeError(
      "GPT-5.6 selected a source target outside the exact candidate projection",
    );
  }

  await assertNoConflictingActiveEvolution(
    input.root,
    input.application.appId,
    dependencies,
    "prepare",
  );

  reportTerminalLifecycle(options.lifecycleReporter, {
    type: "evolution.preparation.started",
    proposalId: patch.proposal.proposalId,
    targetPath: target.path,
    preimageHash: target.preimageHash,
  });
  const state = await dependencies.prepareEvolution({
    root: input.root,
    app: input.application,
    manifest: input.manifest,
    opportunity: input.opportunity,
    brief: gpt56EvolutionBriefSchema.parse(brief.draft),
    briefModelProvenance: intelligenceProvenanceSchema.parse(
      brief.provenance,
    ),
    patchProposal: sourcePatchProposalSchema.parse(patch.proposal),
    patchModelProvenance: sourcePatchModelProvenanceSchema.parse(
      patch.provenance,
    ),
    target: {
      path: target.path,
      preimage: target.content,
    },
    ...(options.evolutionProgressObserver === undefined
      ? {}
      : { progress: options.evolutionProgressObserver }),
  });
  reportTerminalLifecycle(options.lifecycleReporter, {
    type: "evolution.prepared",
    evolutionId: state.evolutionId,
    targetPath: state.artifact.target.path,
    artifactHash: state.artifact.contentHash,
    proofHash: state.proof.proofHash,
    preimageHash: state.artifact.target.preimageHash,
    postimageHash: state.artifact.target.postimageHash,
    proofChecks: Object.freeze(
      state.proof.checks.map((check) =>
        Object.freeze({ id: check.id, status: check.status })
      ),
    ),
    receiptCount: state.receiptCount,
    chainHead: state.chainHead,
  });
  return result(
    "improve",
    "prepared",
    "GPT-5.6 proposed one bounded change. Proof passed; the source is still unchanged.",
    {
      root: input.root,
      reused: false,
      provider: {
        requested: args.provider,
        briefTransport: brief.provenance.transport,
        briefRunId:
          brief.provenance.codexThreadId ?? brief.provenance.responseId,
        patchTransport: patch.provenance.transport,
        patchRunId:
          patch.provenance.codexThreadId ?? patch.provenance.responseId,
      },
      opportunity: {
        opportunityId: input.opportunity.opportunityId,
        signal: input.opportunity.signal.kind,
        confidence: input.opportunity.confidence.score,
        affectedCases: input.opportunity.evidence.subjectCount,
        occurrences: input.opportunity.evidence.occurrenceCount,
        dataOrigin: input.opportunity.evidence.dataOrigin,
      },
      interpretation: {
        title: brief.draft.title,
        summary: brief.draft.proposedChange.summary,
        userValue: brief.draft.proposedChange.userValue,
      },
      proposal: proposalProjection(patch),
      evolution: evolutionProjection(state),
      nextCommand: nextCommand(input.root, state),
      nextActionDetail:
        "The recommended command records exact human approval, then writes that same approved postimage.",
    },
  );
}

async function status(
  args: StatusArguments,
  dependencies: TerminalDependencies,
): Promise<TerminalResult> {
  const doctor = await dependencies.runRoot("doctor", { root: args.rootPath });
  const diagnostics = Array.isArray(doctor.diagnostics)
    ? doctor.diagnostics as readonly Readonly<{
        code?: string;
        severity?: string;
        message?: string;
      }>[]
    : [];
  const installed = !diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "NOT_INSTALLED" ||
      diagnostic.severity === "error",
  );
  const evolutions = [...await dependencies.listEvolutions(args.rootPath)].sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt),
  );
  const newest = evolutions[0];
  const newestState = newest === undefined
    ? null
    : await dependencies.getEvolution(args.rootPath, newest.evolutionId);
  const storedProposal = newestState === null
    ? null
    : storedProposalProjection(newestState);
  const storedProvider = newestState === null
    ? null
    : storedProviderProjection(newestState);
  return result(
    "status",
    installed ? "ready" : "attention-required",
    installed
      ? evolutions.length === 0
        ? "Living Software is installed. No improvement has been prepared yet."
        : `Living Software is installed. Latest improvement is ${newest!.status}.`
      : "Living Software needs attention before it can improve this application.",
    {
      root: doctor.root ?? args.rootPath,
      installed,
      diagnostics,
      evolutions,
      ...(storedProposal === null ? {} : { proposal: storedProposal }),
      ...(storedProvider === null ? {} : { provider: storedProvider }),
      ...(newest === undefined
        ? {
            nextCommand: installed
              ? `npm run living -- improve --root ${quote(args.rootPath)} --provider codex`
              : `npm run living -- install --root ${quote(args.rootPath)}`,
          }
        : {
            nextCommand: nextCommand(args.rootPath, newest),
          }),
    },
  );
}

async function lifecycle(
  args: ApproveArguments | ApplyArguments | RollbackArguments,
  dependencies: TerminalDependencies,
  options: TerminalRunOptions,
): Promise<TerminalResult> {
  const current = await dependencies.getEvolution(
    args.rootPath,
    args.evolutionId,
  );
  let updated: SourceEvolutionState;
  if (args.command === "approve") {
    await assertNoConflictingActiveEvolution(
      args.rootPath,
      current.app.appId,
      dependencies,
      "approve",
      current.evolutionId,
    );
    const approved = await dependencies.approveEvolution({
      root: args.rootPath,
      evolutionId: current.evolutionId,
      humanId: args.actor,
      expectedArtifactHash: args.expectedArtifactHash,
      expectedProofHash: args.expectedProofHash,
      expectedRevision: current.receiptCount,
      ...(options.evolutionProgressObserver === undefined
        ? {}
        : { progress: options.evolutionProgressObserver }),
    });
    if (args.applyAfterApproval) {
      await assertNoConflictingActiveEvolution(
        args.rootPath,
        approved.app.appId,
        dependencies,
        "apply",
        approved.evolutionId,
      );
      updated = await dependencies.applyEvolution({
          root: args.rootPath,
          evolutionId: approved.evolutionId,
          expectedRevision: approved.receiptCount,
          ...(options.evolutionProgressObserver === undefined
            ? {}
            : { progress: options.evolutionProgressObserver }),
        });
    } else {
      updated = approved;
    }
  } else if (args.command === "apply") {
    await assertNoConflictingActiveEvolution(
      args.rootPath,
      current.app.appId,
      dependencies,
      "apply",
      current.evolutionId,
    );
    updated = await dependencies.applyEvolution({
      root: args.rootPath,
      evolutionId: current.evolutionId,
      expectedRevision: current.receiptCount,
      ...(options.evolutionProgressObserver === undefined
        ? {}
        : { progress: options.evolutionProgressObserver }),
    });
  } else {
    updated = await dependencies.rollbackEvolution({
      root: args.rootPath,
      evolutionId: current.evolutionId,
      humanId: args.actor,
      expectedRevision: current.receiptCount,
      ...(options.evolutionProgressObserver === undefined
        ? {}
        : { progress: options.evolutionProgressObserver }),
    });
  }
  const messages = {
    approve: args.command === "approve" && args.applyAfterApproval
      ? "The exact artifact and proof were approved, then that approved postimage was applied to the application source."
      : "The exact artifact and proof are approved. The application source is still unchanged.",
    apply:
      "The approved postimage was applied to the application source. Verify the running application next.",
    rollback:
      "The exact preimage was restored and the rollback receipt was recorded.",
  } as const;
  return result(args.command, updated.status, messages[args.command], {
    root: args.rootPath,
    evolution: evolutionProjection(updated),
    nextCommand: nextCommand(args.rootPath, updated),
  });
}

export async function runTerminalCommand(
  args: TerminalArguments,
  overrides: Partial<TerminalDependencies> = {},
  options: TerminalRunOptions = {},
): Promise<TerminalResult> {
  const dependencies: TerminalDependencies = {
    ...defaultDependencies,
    ...overrides,
  };
  switch (args.command) {
    case "install":
      return install(args, dependencies);
    case "improve":
      return improve(args, dependencies, options);
    case "status":
      return status(args, dependencies);
    case "approve":
    case "apply":
    case "rollback":
      return lifecycle(args, dependencies, options);
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

export function formatTerminalResult(output: TerminalResult): string {
  const lines = ["", output.message];
  const application = record(output.application);
  if (application !== null) {
    lines.push(
      `App: ${String(application.appId)} · ${String(application.nodes)} mapped nodes · ${String(application.edges)} relationships`,
    );
  }
  const opportunity = record(output.opportunity);
  if (opportunity !== null) {
    lines.push(
      `Trigger: ${String(opportunity.signal)} · confidence ${Math.round(Number(opportunity.confidence) * 100)}%`,
    );
    if (opportunity.affectedCases !== undefined) {
      lines.push(
        `Evidence: ${String(opportunity.affectedCases)} workflows · ${String(opportunity.occurrences)} occurrences · ${String(opportunity.dataOrigin)}`,
      );
    }
  }
  const interpretation = record(output.interpretation);
  if (interpretation !== null) {
    lines.push(`Problem: ${String(interpretation.title)}`);
  }
  const proposal = record(output.proposal);
  if (proposal !== null) {
    lines.push(`Proposal: ${String(proposal.summary)}`);
    lines.push(`File: ${String(proposal.targetPath)}`);
    const edits = Array.isArray(proposal.edits) ? proposal.edits : [];
    lines.push(`Edits: ${edits.length} bounded replacement${edits.length === 1 ? "" : "s"}`);
    const preview = record(proposal.patchPreview);
    if (preview !== null && typeof preview.text === "string") {
      lines.push(
        "",
        preview.truncated === true
          ? "GPT patch preview (bounded; truncated):"
          : "GPT patch preview (exact model-authored edits):",
        preview.text,
      );
    }
  }
  const provider = record(output.provider);
  if (provider !== null) {
    lines.push(
      `Model: ${String(provider.requested)} · brief run ${String(provider.briefRunId)} · code run ${String(provider.patchRunId)}`,
    );
  }
  const evolution = record(output.evolution);
  if (evolution !== null) {
    lines.push(
      `Evolution: ${String(evolution.evolutionId)} · ${String(evolution.status)}`,
    );
    if (evolution.artifactHash !== undefined) {
      lines.push(`Artifact hash: ${String(evolution.artifactHash)}`);
    }
    if (evolution.proofHash !== undefined) {
      lines.push(`Proof hash: ${String(evolution.proofHash)}`);
    }
    if (evolution.proofVerdict !== undefined) {
      lines.push(
        `Proof: ${String(evolution.proofVerdict)} · ${String(evolution.proofChecks)} checks`,
      );
    }
  }
  if (Array.isArray(output.evolutions) && output.evolutions.length > 0) {
    lines.push("Evolutions:");
    for (const item of output.evolutions as readonly SourceEvolutionSummary[]) {
      lines.push(`  ${item.status.padEnd(11)} ${item.evolutionId} · ${item.targetPath}`);
      lines.push(`    Artifact hash: ${item.artifactHash}`);
      lines.push(`    Proof hash: ${item.proofHash}`);
    }
  }
  if (typeof output.nextCommand === "string") {
    lines.push("", "Next:", `  ${output.nextCommand}`);
    if (typeof output.nextActionDetail === "string") {
      lines.push(`  ${output.nextActionDetail}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
