import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  compileModelPatch,
  type SourceEvolutionState,
} from "@living-software/evolution";
import type {
  DraftEvolutionBriefResult,
  DraftSourcePatchResult,
  IntelligenceClient,
} from "@living-software/intelligence";

import type { AutomaticEvolutionInput } from "./root-mode.js";
import {
  formatTerminalResult,
  runTerminalCommand,
  type TerminalDependencies,
  type TerminalLifecycleEvent,
} from "./terminal.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;

const patchProposal = {
  schemaVersion: "living.source-patch-proposal/v1",
  proposalId: "proposal.source.demo",
  appId: "crm-demo",
  opportunityId: "opportunity.backtracking.demo",
  manifestHash: HASH_A,
  briefId: "brief.demo",
  summary: "Keep reviewers in context with inline navigation.",
  rationale: "Repeated list revisits indicate lost review context.",
  target: {
    path: "src/app/leads/[id]/page.tsx",
    preimageHash: HASH_B,
  },
  edits: [
    {
      anchor: "<section>Lead</section>",
      replacement:
        "<nav><button>Previous</button><button>Next</button></nav>",
    },
  ],
  governance: {
    status: "draft",
    humanApprovalRequired: true,
    applicationAllowed: false,
  },
} as const;

const briefResult = {
  draft: {
    schemaVersion: "living.evolution-brief/v1",
    briefId: "brief.demo",
    appId: "crm-demo",
    opportunityId: "opportunity.backtracking.demo",
    manifestHash: HASH_A,
    title: "Reduce lead-review backtracking",
    interpretation: "Reviewers repeatedly lose list context.",
    proposedChange: {
      kind: "workflow-assist",
      summary: "Add direct lead navigation.",
      userValue: "Review adjacent leads without returning to the list.",
      affectedProductNodeIds: ["surface.lead-detail"],
      excludedWork: [],
    },
    evidenceCitations: {
      eventSetHash: HASH_C,
      sampleEventIds: ["event-1"],
      metrics: [{ name: "revisit_count", observed: 18 }],
    },
    successCriteria: [
      {
        metric: "revisit_count",
        direction: "decrease",
        target: "below baseline",
        measurementWindow: "next synthetic run",
      },
    ],
    risks: ["Navigation order may need validation."],
    openQuestions: [],
    limitations: ["Synthetic evidence only."],
    evidenceScope: {
      origin: "synthetic",
      claimScope: "synthetic-only",
      productionGeneralizationAllowed: false,
    },
    governance: {
      status: "draft",
      humanApprovalRequired: true,
      activationAllowed: false,
    },
  },
  provenance: {
    provider: "openai",
    transport: "codex-cli",
    boundaryRequestedModel: "gpt-5.6",
    transportRequestedModel: "gpt-5.6-terra",
    actualResponseModel: null,
    responseId: null,
    codexThreadId: "thread-brief-demo",
    responseStoreRequested: null,
    localSessionPersisted: false,
    tokenUsage: {
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 10,
      reasoningOutputTokens: 2,
    },
    evidenceAliases: [{ alias: "evidence-001", eventId: "event-1" }],
  },
} satisfies DraftEvolutionBriefResult;

const patchResult = {
  proposal: patchProposal,
  provenance: {
    provider: "openai",
    transport: "codex-cli",
    boundaryRequestedModel: "gpt-5.6",
    transportRequestedModel: "gpt-5.6-terra",
    actualResponseModel: null,
    responseId: null,
    codexThreadId: "thread-code-demo",
    responseStoreRequested: null,
    localSessionPersisted: false,
    tokenUsage: {
      inputTokens: 20,
      cachedInputTokens: 0,
      outputTokens: 20,
      reasoningOutputTokens: 4,
    },
    sourceCandidates: [
      {
        path: patchProposal.target.path,
        preimageHash: patchProposal.target.preimageHash,
      },
    ],
  },
} satisfies DraftSourcePatchResult;

function state(
  status: SourceEvolutionState["status"] = "prepared",
): SourceEvolutionState {
  return {
    schemaVersion: "living.source-evolution-state/v2",
    evolutionId: "evolution.source.v2.demo",
    app: {
      appId: "crm-demo",
      displayName: "CRM Demo",
      environment: "development",
      releaseRevision: HASH_A,
      manifestHash: HASH_A,
      dataOrigin: "synthetic",
    },
    status,
    bindings: {
      manifestHash: HASH_A,
      opportunityId: "opportunity.backtracking.demo",
    },
    inputs: {
      patchProposal,
    },
    modelProvenance: {
      brief: briefResult.provenance,
      patch: patchResult.provenance,
    },
    artifact: {
      contentHash: HASH_B,
      target: {
        path: patchProposal.target.path,
        preimageHash: HASH_B,
        postimageHash: HASH_C,
      },
    },
    proof: {
      proofHash: HASH_C,
      verdict: "passed",
      checks: [{ id: "proposal.schema", status: "passed" }],
    },
    receiptCount:
      status === "prepared"
        ? 5
        : status === "approved"
          ? 7
          : status === "applied"
            ? 8
          : 9,
    chainHead: HASH_A,
    updatedAt: "2026-07-20T12:00:00.000Z",
  } as unknown as SourceEvolutionState;
}

function summary(source: SourceEvolutionState) {
  return {
    evolutionId: source.evolutionId,
    appId: source.app.appId,
    status: source.status,
    targetPath: source.artifact.target.path,
    artifactHash: source.artifact.contentHash,
    proofHash: source.proof.proofHash,
    updatedAt: source.updatedAt,
  };
}

const automaticInput = {
  root: "C:\\demo\\crm",
  snapshotHash: HASH_C,
  application: {
    appId: "crm-demo",
    displayName: "CRM Demo",
    environment: "development",
    releaseRevision: HASH_A,
    manifestHash: HASH_A,
    dataOrigin: "synthetic",
  },
  manifest: {
    schemaVersion: "living.product-manifest/v1",
    appId: "crm-demo",
  },
  opportunity: {
    opportunityId: "opportunity.backtracking.demo",
    signal: { kind: "backtracking" },
    confidence: { score: 0.9 },
    evidence: {
      subjectCount: 3,
      occurrenceCount: 18,
      dataOrigin: "synthetic",
      eventSetHash: HASH_C,
    },
  },
  evidenceEvents: [],
} as unknown as AutomaticEvolutionInput;

function exactPreparedState(): SourceEvolutionState {
  const preimage = "<section>Lead</section>";
  const proposal = {
    ...patchProposal,
    target: {
      ...patchProposal.target,
      preimageHash: `sha256:${createHash("sha256").update(preimage).digest("hex")}`,
    },
  } as const;
  const compiled = compileModelPatch(proposal, preimage);
  const base = state("prepared");
  return {
    ...base,
    inputs: {
      ...base.inputs,
      opportunity: automaticInput.opportunity,
      patchProposal: proposal,
    },
    artifact: {
      ...base.artifact,
      target: {
        ...base.artifact.target,
        preimageHash: compiled.preimageHash,
        postimageHash: compiled.postimageHash,
      },
    },
    source: {
      preimage,
      postimage: compiled.postimage,
    },
  } as SourceEvolutionState;
}

test("install is an explicit apply alias and keeps synthetic provenance", async () => {
  let invocation: unknown;
  const output = await runTerminalCommand(
    {
      mode: "terminal",
      command: "install",
      rootPath: "C:\\demo\\crm",
      synthetic: true,
      json: false,
    },
    {
      async runRoot(command, options) {
        invocation = { command, options };
        return {
          root: options.root,
          discovery: {
            manifest: {
              appId: "crm-demo",
              contentHash: HASH_A,
              nodes: [{}, {}],
              edges: [{}],
            },
          },
          result: {
            status: "installed",
            record: {
              schemaVersion: "living.install-record/v1",
              installId: "install.crm-demo",
              installedAt: "2026-07-20T12:00:00.000Z",
              appId: "crm-demo",
              adapter: { id: "nextjs", version: "1.0.0" },
              manifestHash: HASH_A,
              mutationPolicy: "create-only",
              files: [{ path: ".living/config.json", installedHash: HASH_B }],
              preservedDataPaths: [".living/data"],
            },
          },
        };
      },
    },
  );

  assert.deepEqual(invocation, {
    command: "init",
    options: {
      root: "C:\\demo\\crm",
      apply: true,
      synthetic: true,
      syntheticSpecified: true,
    },
  });
  assert.equal(output.outcome, "installed");
  assert.deepEqual(output.installRecord, {
    installId: "install.crm-demo",
    manifestHash: HASH_A,
    mutationPolicy: "create-only",
  });
  assert.match(String(output.nextCommand), /^npm run living -- improve --root/u);
});

test("install rejects completion without a public validated install record", async () => {
  await assert.rejects(
    runTerminalCommand(
      {
        mode: "terminal",
        command: "install",
        rootPath: "C:\\demo\\crm",
        synthetic: true,
        json: false,
      },
      {
        async runRoot(_command, options) {
          return {
            root: options.root,
            discovery: {
              manifest: { appId: "crm-demo", contentHash: HASH_A },
            },
            result: { status: "installed" },
          };
        },
      },
    ),
    /validated public install result/u,
  );
});

test("improve performs both GPT runs, prepares only, and prints exact model-authored edits", async () => {
  const calls: string[] = [];
  let preparedInput: unknown;
  const intelligence: IntelligenceClient = {
    async draftEvolutionBrief() {
      calls.push("brief");
      return briefResult;
    },
    async draftSourcePatch() {
      calls.push("patch");
      return patchResult;
    },
  };
  const output = await runTerminalCommand(
    {
      mode: "terminal",
      command: "improve",
      rootPath: automaticInput.root,
      provider: "codex",
      json: false,
    },
    {
      async loadEvolutionInput() {
        calls.push("evidence");
        return automaticInput;
      },
      async listEvolutions() {
        return [];
      },
      createIntelligence(provider) {
        assert.equal(provider, "codex");
        return intelligence;
      },
      async collectCandidates(input) {
        calls.push("candidates");
        assert.deepEqual(input.brief.affectedProductNodeIds, [
          "surface.lead-detail",
        ]);
        return [
          {
            path: patchProposal.target.path,
            content: patchProposal.edits[0].anchor,
            preimageHash: HASH_B,
          },
        ];
      },
      async prepareEvolution(input) {
        calls.push("prepare");
        preparedInput = input;
        return state("prepared");
      },
    },
  );

  assert.deepEqual(calls, [
    "evidence",
    "brief",
    "candidates",
    "patch",
    "prepare",
  ]);
  assert.equal(
    (preparedInput as { target: { preimage: string } }).target.preimage,
    patchProposal.edits[0].anchor,
  );
  assert.equal(output.outcome, "prepared");
  assert.match(
    String(output.nextCommand),
    /^npm run living -- approve --root .* --artifact-hash sha256:[a-f0-9]{64} --proof-hash sha256:[a-f0-9]{64} --apply$/u,
  );
  const human = formatTerminalResult(output);
  assert.match(human, /GPT patch preview \(exact model-authored edits\)/u);
  assert.match(human, /- "<section>Lead<\/section>"/u);
  assert.match(human, /\+ "<nav><button>Previous/u);
  assert.match(human, /code run thread-code-demo/u);
  assert.match(human, /records exact human approval, then writes/u);
  assert.match(human, new RegExp(`Artifact hash: ${HASH_B}`, "u"));
  assert.match(human, new RegExp(`Proof hash: ${HASH_C}`, "u"));
});

test("improve reports ordered safe milestones only after each awaited result validates", async () => {
  function deferred(): Readonly<{
    promise: Promise<void>;
    resolve(): void;
  }> {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { promise, resolve: release };
  }

  const briefEntered = deferred();
  const briefRelease = deferred();
  const candidatesEntered = deferred();
  const candidatesRelease = deferred();
  const patchEntered = deferred();
  const patchRelease = deferred();
  const prepareEntered = deferred();
  const prepareRelease = deferred();
  const lifecycleEvents: TerminalLifecycleEvent[] = [];
  const evolutionProgressObserver = () => undefined;
  const candidate = {
    path: patchProposal.target.path,
    content: patchProposal.edits[0].anchor,
    preimageHash: HASH_B,
  } as const;

  const pending = runTerminalCommand(
    {
      mode: "terminal",
      command: "improve",
      rootPath: automaticInput.root,
      provider: "codex",
      json: false,
    },
    {
      async loadEvolutionInput() {
        return automaticInput;
      },
      async listEvolutions() {
        return [];
      },
      createIntelligence(_provider, options) {
        const report = options?.lifecycleReporter;
        assert.ok(report);
        const reportRun = (
          schemaName: "living_evolution_brief" | "living_source_patch",
          threadId: string,
        ) => {
          report({ type: "request.dispatched", schemaName, transport: "codex-cli" });
          report({ type: "thread.started", schemaName, transport: "codex-cli", threadId });
          report({ type: "turn.started", schemaName, transport: "codex-cli", threadId });
          report({
            type: "turn.completed",
            schemaName,
            transport: "codex-cli",
            threadId,
            tokenUsage: briefResult.provenance.tokenUsage!,
          });
        };
        return {
          async draftEvolutionBrief() {
            reportRun("living_evolution_brief", "thread-brief-demo");
            briefEntered.resolve();
            await briefRelease.promise;
            return briefResult;
          },
          async draftSourcePatch() {
            reportRun("living_source_patch", "thread-code-demo");
            patchEntered.resolve();
            await patchRelease.promise;
            return patchResult;
          },
        };
      },
      async collectCandidates() {
        candidatesEntered.resolve();
        await candidatesRelease.promise;
        return [candidate];
      },
      async prepareEvolution(input) {
        assert.equal(input.progress, evolutionProgressObserver);
        prepareEntered.resolve();
        await prepareRelease.promise;
        return state("prepared");
      },
    },
    {
      async lifecycleReporter(event) {
        lifecycleEvents.push(event);
        throw new Error("broken visualization reporter");
      },
      evolutionProgressObserver,
    },
  );

  await briefEntered.promise;
  assert.deepEqual(
    lifecycleEvents.map((event) => event.type),
    [
      "evidence.package.validated",
      "model.request.dispatched",
      "model.thread.started",
      "model.turn.started",
      "model.turn.completed",
    ],
  );
  assert.equal(
    lifecycleEvents.some((event) => event.type === "model.result.validated"),
    false,
  );

  briefRelease.resolve();
  await candidatesEntered.promise;
  assert.equal(lifecycleEvents.at(-1)?.type, "model.result.validated");
  assert.equal(
    lifecycleEvents.filter((event) => event.type === "model.result.validated").length,
    1,
  );

  candidatesRelease.resolve();
  await patchEntered.promise;
  assert.deepEqual(
    lifecycleEvents.slice(-5).map((event) => event.type),
    [
      "source-candidates.selected",
      "model.request.dispatched",
      "model.thread.started",
      "model.turn.started",
      "model.turn.completed",
    ],
  );

  patchRelease.resolve();
  await prepareEntered.promise;
  assert.deepEqual(
    lifecycleEvents.slice(-2).map((event) => event.type),
    ["model.result.validated", "evolution.preparation.started"],
  );
  assert.equal(
    lifecycleEvents.some((event) => event.type === "evolution.prepared"),
    false,
  );

  prepareRelease.resolve();
  const output = await pending;
  assert.equal(output.outcome, "prepared");
  assert.equal(lifecycleEvents.at(-1)?.type, "evolution.prepared");
  assert.ok(lifecycleEvents.every((event) => Object.isFrozen(event)));
  const serialized = JSON.stringify(lifecycleEvents);
  for (const forbidden of [
    patchProposal.edits[0].anchor,
    patchProposal.edits[0].replacement,
    briefResult.draft.interpretation,
    "broken visualization reporter",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("improve reuses only an exact full Opportunity contract", async () => {
  const exact = exactPreparedState();
  let modelRequested = false;
  const reuseEvents: TerminalLifecycleEvent[] = [];
  const reused = await runTerminalCommand(
    {
      mode: "terminal",
      command: "improve",
      rootPath: automaticInput.root,
      provider: "codex",
      json: false,
    },
    {
      async loadEvolutionInput() {
        return automaticInput;
      },
      async listEvolutions() {
        return [summary(exact)];
      },
      async getEvolution() {
        return exact;
      },
      createIntelligence() {
        modelRequested = true;
        throw new Error("an exact Opportunity must not call the model");
      },
    },
    {
      lifecycleReporter(event) {
        reuseEvents.push(event);
      },
    },
  );
  assert.equal(reused.reused, true);
  assert.equal(modelRequested, false);
  assert.deepEqual(
    reuseEvents.map((event) => event.type),
    ["evidence.package.validated", "proposal.reused"],
  );
  assert.equal(
    reuseEvents.some((event) => event.type.startsWith("model.")),
    false,
  );
  const reuse = reuseEvents[1];
  assert.equal(
    reuse?.type === "proposal.reused" ? reuse.summary : undefined,
    "Existing evidence-bound proposal reused",
  );

  const driftedInput = {
    ...automaticInput,
    opportunity: {
      ...automaticInput.opportunity,
      confidence: { score: 0.8 },
    },
  } as AutomaticEvolutionInput;
  await assert.rejects(
    runTerminalCommand(
      {
        mode: "terminal",
        command: "improve",
        rootPath: automaticInput.root,
        provider: "codex",
        json: false,
      },
      {
        async loadEvolutionInput() {
          return driftedInput;
        },
        async listEvolutions() {
          return [summary(exact)];
        },
        async getEvolution() {
          return exact;
        },
        createIntelligence() {
          modelRequested = true;
          throw new Error("model-requested-after-opportunity-drift");
        },
      },
    ),
    /model-requested-after-opportunity-drift/u,
  );
  assert.equal(modelRequested, true);
});

test("improve preserves but does not reuse prepared artifacts that fail current proof", async () => {
  const exact = exactPreparedState();
  const invalidProposal = {
    ...exact,
    inputs: {
      ...exact.inputs,
      patchProposal: {
        ...exact.inputs.patchProposal,
        edits: [
          {
            anchor: "<section>Lead</section>",
            replacement: "\0return <main>",
          },
        ],
      },
    },
  } as SourceEvolutionState;
  const mismatchedPostimage = {
    ...exact,
    source: {
      ...exact.source,
      postimage: `${exact.source.postimage}\n// stale`,
    },
  } as SourceEvolutionState;

  for (const stale of [invalidProposal, mismatchedPostimage]) {
    const before = structuredClone(stale);
    let modelRequested = false;
    await assert.rejects(
      runTerminalCommand(
        {
          mode: "terminal",
          command: "improve",
          rootPath: automaticInput.root,
          provider: "codex",
          json: false,
        },
        {
          async loadEvolutionInput() {
            return automaticInput;
          },
          async listEvolutions() {
            return [summary(stale)];
          },
          async getEvolution() {
            return stale;
          },
          createIntelligence() {
            modelRequested = true;
            throw new Error("fresh-model-requested-after-stale-proof");
          },
        },
      ),
      /fresh-model-requested-after-stale-proof/u,
    );
    assert.equal(modelRequested, true);
    assert.deepEqual(stale, before);
  }
});

test("approve --apply preserves separate approval and application transitions", async () => {
  const calls: unknown[] = [];
  const approved = state("approved");
  const applied = state("applied");
  const progress = () => undefined;
  const output = await runTerminalCommand(
    {
      mode: "terminal",
      command: "approve",
      rootPath: "C:\\demo\\crm",
      evolutionId: state().evolutionId,
      actor: "operator.demo",
      expectedArtifactHash: HASH_A,
      expectedProofHash: HASH_B,
      applyAfterApproval: true,
      json: false,
    },
    {
      async getEvolution() {
        return state("prepared");
      },
      async listEvolutions() {
        return [summary(state("prepared"))];
      },
      async approveEvolution(input) {
        calls.push({ transition: "approve", input });
        return approved;
      },
      async applyEvolution(input) {
        calls.push({ transition: "apply", input });
        return applied;
      },
    },
    { evolutionProgressObserver: progress },
  );

  assert.equal(calls.length, 2);
  assert.equal((calls[0] as { input: { progress: unknown } }).input.progress, progress);
  assert.equal((calls[1] as { input: { progress: unknown } }).input.progress, progress);
  assert.equal(
    (calls[0] as { transition: string }).transition,
    "approve",
  );
  assert.equal(
    (calls[1] as { input: { expectedRevision: number } }).input
      .expectedRevision,
    approved.receiptCount,
  );
  assert.equal(
    (calls[0] as { input: { expectedArtifactHash: string } }).input
      .expectedArtifactHash,
    HASH_A,
  );
  assert.equal(
    (calls[0] as { input: { expectedProofHash: string } }).input
      .expectedProofHash,
    HASH_B,
  );
  assert.equal(output.outcome, "applied");
  assert.match(output.message, /approved, then/u);
  assert.match(String(output.nextCommand), /^npm run living -- rollback --root/u);
});

test("rollback passes the non-authoritative progress observer to the evolution engine", async () => {
  const progress = () => undefined;
  let receivedProgress: unknown;
  const output = await runTerminalCommand(
    {
      mode: "terminal",
      command: "rollback",
      rootPath: "C:\\demo\\crm",
      evolutionId: state().evolutionId,
      actor: "operator.demo",
      json: false,
    },
    {
      async getEvolution() {
        return state("applied");
      },
      async rollbackEvolution(input) {
        receivedProgress = input.progress;
        return state("rolled-back");
      },
    },
    { evolutionProgressObserver: progress },
  );

  assert.equal(receivedProgress, progress);
  assert.equal(output.outcome, "rolled-back");
  assert.equal(output.nextCommand, undefined);
});
test("improve refuses to prepare beside an approved or applied evolution for the same app and root", async () => {
  for (const activeStatus of ["approved", "applied"] as const) {
    const active = {
      ...state(activeStatus),
      evolutionId: `evolution.source.v2.active-${activeStatus}`,
      bindings: {
        manifestHash: HASH_A,
        opportunityId: "opportunity.other-evidence",
      },
    } as SourceEvolutionState;
    let modelRequested = false;
    let prepared = false;

    await assert.rejects(
      runTerminalCommand(
        {
          mode: "terminal",
          command: "improve",
          rootPath: automaticInput.root,
          provider: "codex",
          json: false,
        },
        {
          async loadEvolutionInput() {
            return automaticInput;
          },
          async listEvolutions() {
            return [summary(active)];
          },
          async getEvolution() {
            return active;
          },
          createIntelligence() {
            modelRequested = true;
            throw new Error("model must not run");
          },
          async prepareEvolution() {
            prepared = true;
            return state("prepared");
          },
        },
      ),
      new RegExp(`already ${activeStatus}.*Roll it back`, "u"),
    );
    assert.equal(modelRequested, false);
    assert.equal(prepared, false);
  }
});

test("apply refuses a second approved or applied evolution for the same app and root", async () => {
  const target = state("approved");
  const active = {
    ...state("applied"),
    evolutionId: "evolution.source.v2.already-active",
  } as SourceEvolutionState;
  let applied = false;

  await assert.rejects(
    runTerminalCommand(
      {
        mode: "terminal",
        command: "apply",
        rootPath: automaticInput.root,
        evolutionId: target.evolutionId,
        json: false,
      },
      {
        async getEvolution() {
          return target;
        },
        async listEvolutions() {
          return [summary(target), summary(active)];
        },
        async applyEvolution() {
          applied = true;
          return state("applied");
        },
      },
    ),
    /already applied.*Roll it back/u,
  );
  assert.equal(applied, false);
});

test("status retains the stored GPT proposal, exact patch preview, and code-run provenance", async () => {
  const prepared = exactPreparedState();
  const output = await runTerminalCommand(
    {
      mode: "terminal",
      command: "status",
      rootPath: "C:\\demo\\crm",
      json: false,
    },
    {
      async runRoot() {
        return {
          root: "C:\\demo\\crm",
          diagnostics: [
            {
              code: "INSTALL_HEALTHY",
              severity: "info",
              message: "Healthy",
            },
          ],
        };
      },
      async listEvolutions() {
        return [
          {
            evolutionId: prepared.evolutionId,
            appId: "crm-demo",
            status: "prepared",
            targetPath: patchProposal.target.path,
            artifactHash: HASH_B,
            proofHash: HASH_C,
            updatedAt: prepared.updatedAt,
          },
        ];
      },
      async getEvolution() {
        return prepared;
      },
    },
  );

  const human = formatTerminalResult(output);
  assert.match(human, /Keep reviewers in context/u);
  assert.match(human, /exact model-authored edits/u);
  assert.match(human, /code run thread-code-demo/u);
  assert.match(human, new RegExp(`Artifact hash: ${HASH_B}`, "u"));
  assert.match(human, new RegExp(`Proof hash: ${HASH_C}`, "u"));
  assert.match(
    String(output.nextCommand),
    /^npm run living -- approve --root .* --artifact-hash sha256:[a-f0-9]{64} --proof-hash sha256:[a-f0-9]{64} --apply$/u,
  );
});

test("status blocks activation commands for a prepared artifact invalid under current proof", async () => {
  const current = exactPreparedState();
  const historical = {
    ...current,
    inputs: {
      ...current.inputs,
      patchProposal: {
        ...current.inputs.patchProposal,
        edits: [
          {
            anchor: "<section>Lead</section>",
            replacement: "\0return <main>",
          },
        ],
      },
    },
  } as SourceEvolutionState;
  const before = structuredClone(historical);
  const output = await runTerminalCommand(
    {
      mode: "terminal",
      command: "status",
      rootPath: "C:\\demo\\crm",
      json: false,
    },
    {
      async runRoot() {
        return {
          root: "C:\\demo\\crm",
          diagnostics: [
            {
              code: "INSTALL_HEALTHY",
              severity: "info",
              message: "Healthy",
            },
          ],
        };
      },
      async listEvolutions() {
        return [summary(historical)];
      },
      async getEvolution() {
        return historical;
      },
    },
  );

  const human = formatTerminalResult(output);
  assert.match(output.message, /historical and invalid under the current proof policy/u);
  assert.deepEqual(output.proofPolicy, {
    status: "historical-invalid",
    activationAllowed: false,
    detail: "The preserved proposal fails the current proof policy. Approval and application are blocked.",
  });
  assert.match(String(output.nextCommand), /living -- improve/u);
  assert.doesNotMatch(String(output.nextCommand), /living -- (?:approve|apply)\b/u);
  assert.match(human, /Proof policy: HISTORICAL \/ INVALID/u);
  assert.match(human, /approval and application are blocked/u);
  assert.doesNotMatch(human, /living -- (?:approve|apply)\b/u);
  assert.deepEqual(historical, before);
});
