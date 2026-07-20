import assert from "node:assert/strict";
import test from "node:test";

import type { SourceEvolutionState } from "@living-software/evolution";
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
    },
  },
  evidenceEvents: [],
} as unknown as AutomaticEvolutionInput;

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
              nodes: [{}, {}],
              edges: [{}],
            },
          },
          result: { status: "installed" },
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
  assert.match(String(output.nextCommand), /^living improve --root/u);
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
    /^living approve --root .* --artifact-hash sha256:[a-f0-9]{64} --proof-hash sha256:[a-f0-9]{64} --apply$/u,
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

test("approve --apply preserves separate approval and application transitions", async () => {
  const calls: unknown[] = [];
  const approved = state("approved");
  const applied = state("applied");
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
  );

  assert.equal(calls.length, 2);
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
  assert.match(String(output.nextCommand), /^living rollback --root/u);
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
  const prepared = state("prepared");
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
    /^living approve --root .* --artifact-hash sha256:[a-f0-9]{64} --proof-hash sha256:[a-f0-9]{64} --apply$/u,
  );
});
