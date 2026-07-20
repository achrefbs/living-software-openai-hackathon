import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  EvolutionReceipt,
  Gpt56EvolutionBrief,
  IntelligenceProvenance,
  Opportunity,
  ProductManifest,
} from "@living-software/contracts";

import { hashBytes } from "./canonical.js";
import {
  SourceEvolutionError,
  applySourceEvolution,
  approveSourceEvolution,
  getEvolutionStatus,
  listEvolutionStatuses,
  prepareSourceEvolution,
  rollbackSourceEvolution,
  type PrepareSourceEvolutionInput,
  type SourceEvolutionApplication,
  type SourceEvolutionState,
  type SourcePatchModelProvenance,
  type SourcePatchProposal,
} from "./index.js";
import { setSourceEvolutionFaultInjectorForTests } from "./lifecycle.js";

const MANIFEST_HASH = `sha256:${"a".repeat(64)}` as const;
const EVENT_HASH = `sha256:${"b".repeat(64)}` as const;
const CONFIG_HASH = `sha256:${"c".repeat(64)}` as const;
const REVISION = "revision-test-1";
const AT = "2026-07-20T12:00:00.000Z";

type Variant = "lead-navigation" | "priority-card";

const VARIANTS = {
  "lead-navigation": {
    targetPath: "src/app/leads/page.tsx",
    nodeId: "route.leads",
    opportunityId: "opportunity.lead-navigation",
    briefId: "brief.lead-navigation",
    proposalId: "proposal.lead-navigation",
    signalKind: "backtracking" as const,
    metric: "workflow.revisits",
    preimage: `"use client";

export default function LeadsPage() {
  return <main><h1>Leads</h1><p>Review the current pipeline.</p></main>;
}
`,
    anchor: "<h1>Leads</h1>",
    replacement:
      '<nav aria-label="Lead review"><button>Previous</button><strong>Leads</strong><button>Next</button></nav>',
  },
  "priority-card": {
    targetPath: "src/components/LeadCard.tsx",
    nodeId: "component.lead-card",
    opportunityId: "opportunity.priority-card",
    briefId: "brief.priority-card",
    proposalId: "proposal.priority-card",
    signalKind: "rework-loop" as const,
    metric: "workflow.priority_rechecks",
    preimage: `export function LeadCard({ name }: { name: string }) {
  return <article className="lead-card"><h2>{name}</h2></article>;
}
`,
    anchor: '<article className="lead-card">',
    replacement:
      '<article className="lead-card lead-card-priority" data-priority="high">',
  },
} as const;

function app(): SourceEvolutionApplication {
  return {
    appId: "surus.crm",
    displayName: "Surus CRM",
    environment: "development",
    releaseRevision: REVISION,
    manifestHash: MANIFEST_HASH,
    dataOrigin: "synthetic",
  };
}

function sourceProvenance(sourcePath: string) {
  return {
    origin: "scanned" as const,
    confidence: 1,
    sources: [{ path: sourcePath, revision: REVISION }],
  };
}

function manifest(variant: Variant): ProductManifest {
  const selected = VARIANTS[variant];
  return {
    schemaVersion: "living.product-manifest/v1",
    appId: "surus.crm",
    release: { revision: REVISION, version: "0.1.0" },
    generatedAt: AT,
    generators: [{ adapterId: "next-app-router", adapterVersion: "0.1.0" }],
    nodes: [
      {
        id: selected.nodeId,
        kind: variant === "lead-navigation" ? "route" : "surface",
        displayName:
          variant === "lead-navigation" ? "Lead list" : "Lead card",
        provenance: sourceProvenance(selected.targetPath),
      },
      {
        id: "component.unrelated",
        kind: "surface",
        displayName: "Unrelated component",
        provenance: sourceProvenance("src/components/Unrelated.tsx"),
      },
    ],
    edges: [],
    contentHash: MANIFEST_HASH,
  };
}

function opportunity(variant: Variant): Opportunity {
  const selected = VARIANTS[variant];
  return {
    schemaVersion: "living.opportunity/v1",
    opportunityId: selected.opportunityId,
    appId: "surus.crm",
    manifestHash: MANIFEST_HASH,
    detectedAt: AT,
    detector: {
      id: `detector.${variant}`,
      version: "1.1.0",
      configHash: CONFIG_HASH,
    },
    window: { from: AT, to: "2026-07-20T12:05:00.000Z" },
    signal: {
      kind: selected.signalKind,
      metrics: [{ name: selected.metric, unit: "count", observed: 17 }],
    },
    evidence: {
      bundle: {
        uri: `living://evidence/${variant}`,
        mediaType: "application/json",
        sha256: EVENT_HASH,
      },
      eventSetHash: EVENT_HASH,
      sampleEventIds: [`event-${variant}`],
      subjectCount: 3,
      sessionCount: 3,
      occurrenceCount: 17,
      dataOrigin: "synthetic",
    },
    confidence: { score: 0.74, reasonCodes: ["workflow-threshold"] },
  };
}

function brief(variant: Variant): Gpt56EvolutionBrief {
  const selected = VARIANTS[variant];
  return {
    schemaVersion: "living.evolution-brief/v1",
    briefId: selected.briefId,
    appId: "surus.crm",
    opportunityId: selected.opportunityId,
    manifestHash: MANIFEST_HASH,
    title:
      variant === "lead-navigation"
        ? "Reduce lead-review backtracking"
        : "Surface priority during lead review",
    interpretation: "The captured workflow shows avoidable repeated review work.",
    proposedChange: {
      kind: "workflow-assist",
      summary: "Add one bounded client-side workflow aid.",
      userValue: "Reduce repeated review work without automation authority.",
      affectedProductNodeIds: [selected.nodeId],
      excludedWork: ["No external access", "No server mutation"],
    },
    evidenceCitations: {
      eventSetHash: EVENT_HASH,
      sampleEventIds: [`event-${variant}`],
      metrics: [{ name: selected.metric, observed: 17 }],
    },
    successCriteria: [
      {
        metric: selected.metric,
        direction: "decrease",
        target: "Fewer repeats in the synthetic replay",
        measurementWindow: "Next five synthetic sessions",
      },
    ],
    risks: ["The workflow aid may not help every reviewer"],
    openQuestions: ["Should the presentation be configurable later?"],
    limitations: ["Synthetic evidence does not generalize to production"],
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
  };
}

function briefModelProvenance(variant: Variant): IntelligenceProvenance {
  return {
    provider: "openai",
    transport: "codex-cli",
    boundaryRequestedModel: "gpt-5.6",
    transportRequestedModel: "gpt-5.6-terra",
    actualResponseModel: null,
    responseId: null,
    codexThreadId: `thread-brief-${variant}`,
    responseStoreRequested: null,
    localSessionPersisted: false,
    tokenUsage: {
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 50,
      reasoningOutputTokens: 20,
    },
    evidenceAliases: [
      { alias: "evidence-001", eventId: `event-${variant}` },
    ],
  };
}

function patchProposal(variant: Variant): SourcePatchProposal {
  const selected = VARIANTS[variant];
  return {
    schemaVersion: "living.source-patch-proposal/v1",
    proposalId: selected.proposalId,
    appId: "surus.crm",
    opportunityId: selected.opportunityId,
    manifestHash: MANIFEST_HASH,
    briefId: selected.briefId,
    summary: `Apply the ${variant} workflow aid.`,
    rationale: "The exact evidence-bound brief supports this bounded UI edit.",
    target: {
      path: selected.targetPath,
      preimageHash: hashBytes(selected.preimage),
    },
    edits: [{ anchor: selected.anchor, replacement: selected.replacement }],
    governance: {
      status: "draft",
      humanApprovalRequired: true,
      applicationAllowed: false,
    },
  };
}

function patchModelProvenance(variant: Variant): SourcePatchModelProvenance {
  const proposal = patchProposal(variant);
  return {
    provider: "openai",
    transport: "codex-cli",
    boundaryRequestedModel: "gpt-5.6",
    transportRequestedModel: "gpt-5.6-terra",
    actualResponseModel: null,
    responseId: null,
    codexThreadId: `thread-patch-${variant}`,
    responseStoreRequested: null,
    localSessionPersisted: false,
    tokenUsage: {
      inputTokens: 140,
      cachedInputTokens: 20,
      outputTokens: 80,
      reasoningOutputTokens: 30,
    },
    sourceCandidates: [proposal.target],
  };
}

async function rootFixture(variant: Variant): Promise<string> {
  const selected = VARIANTS[variant];
  const root = await mkdtemp(path.join(os.tmpdir(), "living-evolution-v2-"));
  const target = path.join(root, ...selected.targetPath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, selected.preimage, "utf8");
  await mkdir(path.join(root, ".living"), { recursive: true });
  await writeFile(
    path.join(root, ".living", "install-record.json"),
    JSON.stringify({
      schemaVersion: "living.install-record/v1",
      installId: "install-test",
      installedAt: AT,
      appId: "surus.crm",
      adapter: { id: "next-app-router", version: "0.1.0" },
      manifestHash: MANIFEST_HASH,
      mutationPolicy: "create-only",
      files: [
        {
          path: ".living/config.json",
          installedHash: `sha256:${"e".repeat(64)}`,
        },
      ],
      preservedDataPaths: [".living/data"],
    }),
    "utf8",
  );
  return root;
}

async function sameAppRootFixture(): Promise<string> {
  const root = await rootFixture("lead-navigation");
  const selected = VARIANTS["priority-card"];
  const target = path.join(root, ...selected.targetPath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, selected.preimage, "utf8");
  return root;
}

function prepareInput(root: string, variant: Variant): PrepareSourceEvolutionInput {
  const selected = VARIANTS[variant];
  return {
    root,
    app: app(),
    manifest: manifest(variant),
    opportunity: opportunity(variant),
    brief: brief(variant),
    briefModelProvenance: briefModelProvenance(variant),
    patchProposal: patchProposal(variant),
    patchModelProvenance: patchModelProvenance(variant),
    target: { path: selected.targetPath, preimage: selected.preimage },
    clock: () => new Date(AT),
  };
}

function approveInput(root: string, state: SourceEvolutionState) {
  return {
    root,
    evolutionId: state.evolutionId,
    humanId: "reviewer-1",
    expectedArtifactHash: state.artifact.contentHash,
    expectedProofHash: state.proof.proofHash,
    expectedRevision: state.receiptCount,
    clock: () => new Date("2026-07-20T12:10:00.000Z"),
  } as const;
}

async function expectCode(
  promise: Promise<unknown>,
  code: SourceEvolutionError["code"],
): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof SourceEvolutionError && error.code === code,
  );
}

function storageFile(
  root: string,
  state: SourceEvolutionState,
  name: "state.json" | "receipts.ndjson" | "pending-transaction.json",
): string {
  return path.join(root, ...state.storage.directory.split("/"), name);
}

async function receipts(
  root: string,
  state: SourceEvolutionState,
): Promise<readonly EvolutionReceipt[]> {
  return (await readFile(storageFile(root, state, "receipts.ndjson"), "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as EvolutionReceipt);
}

test("two materially different GPT proposals complete prepare, approve, apply, and rollback", async () => {
  const postimages = new Set<string>();
  for (const variant of ["lead-navigation", "priority-card"] as const) {
    const selected = VARIANTS[variant];
    const root = await rootFixture(variant);
    const target = path.join(root, ...selected.targetPath.split("/"));
    const prepared = await prepareSourceEvolution(prepareInput(root, variant));

    assert.equal(prepared.schemaVersion, "living.source-evolution-state/v2");
    assert.match(prepared.evolutionId, /^evolution\.source\.v2\./u);
    assert.equal(prepared.status, "prepared");
    assert.equal(prepared.receiptCount, 5);
    assert.equal(prepared.artifact.target.path, selected.targetPath);
    assert.equal(prepared.inputs.patchProposal.proposalId, selected.proposalId);
    assert.equal(prepared.modelProvenance.patch.sourceCandidates[0]?.path, selected.targetPath);
    assert.equal(prepared.contract.generation.modelApplicationAuthority, false);
    assert.equal(prepared.artifact.generation.proposalOrigin, "gpt-5.6");
    assert.equal(await readFile(target, "utf8"), selected.preimage);
    postimages.add(prepared.source.postimage);

    const preparationReceipts = await receipts(root, prepared);
    assert.deepEqual(
      preparationReceipts.map((receipt) => receipt.kind),
      [
        "opportunity.detected",
        "hypothesis.created",
        "artifact.generated",
        "artifact.compiled",
        "proof.completed",
      ],
    );
    assert.equal(preparationReceipts[2]?.actor.type, "model");
    assert.equal(preparationReceipts[3]?.actor.type, "system");
    assert.equal(
      preparationReceipts[2]?.payload.patchModelProvenanceHash,
      prepared.bindings.patchModelProvenanceHash,
    );

    const approved = await approveSourceEvolution(approveInput(root, prepared));
    assert.equal(approved.status, "approved");
    assert.equal(approved.receiptCount, 7);
    assert.equal(await readFile(target, "utf8"), selected.preimage);

    const applied = await applySourceEvolution({
      root,
      evolutionId: approved.evolutionId,
      expectedRevision: approved.receiptCount,
    });
    assert.equal(applied.status, "applied");
    assert.equal(applied.receiptCount, 8);
    assert.equal(await readFile(target, "utf8"), applied.source.postimage);

    const rolledBack = await rollbackSourceEvolution({
      root,
      evolutionId: applied.evolutionId,
      humanId: "reviewer-1",
      expectedRevision: applied.receiptCount,
    });
    assert.equal(rolledBack.status, "rolled-back");
    assert.equal(rolledBack.receiptCount, 9);
    assert.equal(await readFile(target, "utf8"), selected.preimage);
    assert.equal((await getEvolutionStatus(root, rolledBack.evolutionId)).status, "rolled-back");
    assert.equal((await listEvolutionStatuses(root))[0]?.targetPath, selected.targetPath);
    await rm(root, { recursive: true, force: true });
  }
  assert.equal(postimages.size, 2);
});

test("rejects a target that is not sourced by a brief-affected manifest node", async () => {
  const root = await rootFixture("lead-navigation");
  const input = prepareInput(root, "lead-navigation");
  const unrelatedBrief: Gpt56EvolutionBrief = {
    ...input.brief,
    proposedChange: {
      ...input.brief.proposedChange,
      affectedProductNodeIds: ["component.unrelated"],
    },
  };
  await expectCode(
    prepareSourceEvolution({ ...input, brief: unrelatedBrief }),
    "INVALID_INPUT",
  );
  assert.deepEqual(await listEvolutionStatuses(root), []);
  await rm(root, { recursive: true, force: true });
});

test("preparation is preview-only and exact human hashes are required", async () => {
  const root = await rootFixture("lead-navigation");
  const prepared = await prepareSourceEvolution(
    prepareInput(root, "lead-navigation"),
  );
  await expectCode(
    applySourceEvolution({
      root,
      evolutionId: prepared.evolutionId,
      expectedRevision: prepared.receiptCount,
    }),
    "APPROVAL_REQUIRED",
  );
  await expectCode(
    approveSourceEvolution({
      ...approveInput(root, prepared),
      expectedArtifactHash: `sha256:${"f".repeat(64)}`,
    }),
    "APPROVAL_HASH_MISMATCH",
  );
  assert.equal(
    await readFile(
      path.join(root, ...VARIANTS["lead-navigation"].targetPath.split("/")),
      "utf8",
    ),
    VARIANTS["lead-navigation"].preimage,
  );
  await rm(root, { recursive: true, force: true });
});

test("apply rejects source drift after approval and preserves approved state", async () => {
  const root = await rootFixture("priority-card");
  const prepared = await prepareSourceEvolution(prepareInput(root, "priority-card"));
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  const target = path.join(root, ...VARIANTS["priority-card"].targetPath.split("/"));
  await writeFile(target, `${VARIANTS["priority-card"].preimage}// drift\n`, "utf8");
  await expectCode(
    applySourceEvolution({
      root,
      evolutionId: approved.evolutionId,
      expectedRevision: approved.receiptCount,
    }),
    "TARGET_PREIMAGE_MISMATCH",
  );
  assert.equal((await getEvolutionStatus(root, approved.evolutionId)).status, "approved");
  await rm(root, { recursive: true, force: true });
});

test("rollback requires the exact installed postimage", async () => {
  const root = await rootFixture("lead-navigation");
  const prepared = await prepareSourceEvolution(prepareInput(root, "lead-navigation"));
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  const applied = await applySourceEvolution({
    root,
    evolutionId: approved.evolutionId,
    expectedRevision: approved.receiptCount,
  });
  const target = path.join(root, ...VARIANTS["lead-navigation"].targetPath.split("/"));
  await writeFile(target, `${applied.source.postimage}// drift\n`, "utf8");
  await expectCode(
    rollbackSourceEvolution({
      root,
      evolutionId: applied.evolutionId,
      humanId: "reviewer-1",
      expectedRevision: applied.receiptCount,
    }),
    "TARGET_POSTIMAGE_MISMATCH",
  );
  assert.equal((await getEvolutionStatus(root, applied.evolutionId)).status, "applied");
  await rm(root, { recursive: true, force: true });
});

test("stored proposal tampering is rejected before lifecycle mutation", async () => {
  const root = await rootFixture("priority-card");
  const prepared = await prepareSourceEvolution(prepareInput(root, "priority-card"));
  await writeFile(
    storageFile(root, prepared, "state.json"),
    `${JSON.stringify({
      ...prepared,
      inputs: {
        ...prepared.inputs,
        patchProposal: {
          ...prepared.inputs.patchProposal,
          summary: "tampered summary",
        },
      },
    })}\n`,
    "utf8",
  );
  await expectCode(
    getEvolutionStatus(root, prepared.evolutionId),
    "STATE_TAMPERED",
  );
  await rm(root, { recursive: true, force: true });
});

test("v2 listing ignores isolated legacy v1 storage", async () => {
  const root = await rootFixture("lead-navigation");
  const legacy = path.join(
    root,
    ".living",
    "data",
    "evolutions",
    `evolution.source.${"a".repeat(24)}`,
  );
  await mkdir(legacy, { recursive: true });
  await writeFile(path.join(legacy, "state.json"), "legacy-v1", "utf8");
  assert.deepEqual(await listEvolutionStatuses(root), []);
  const prepared = await prepareSourceEvolution(prepareInput(root, "lead-navigation"));
  assert.deepEqual(
    (await listEvolutionStatuses(root)).map((entry) => entry.evolutionId),
    [prepared.evolutionId],
  );
  assert.match(prepared.storage.directory, /^\.living\/data\/evolutions-v2\//u);
  await rm(root, { recursive: true, force: true });
});

test("journal recovery completes a dynamic-target apply exactly once", async () => {
  const root = await rootFixture("priority-card");
  const prepared = await prepareSourceEvolution(prepareInput(root, "priority-card"));
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  let thrown = false;
  setSourceEvolutionFaultInjectorForTests((point) => {
    if (point === "after-target" && !thrown) {
      thrown = true;
      throw new Error("simulated crash after dynamic target replacement");
    }
  });
  try {
    await assert.rejects(
      applySourceEvolution({
        root,
        evolutionId: approved.evolutionId,
        expectedRevision: approved.receiptCount,
      }),
      /simulated crash/u,
    );
  } finally {
    setSourceEvolutionFaultInjectorForTests();
  }
  const recovered = await getEvolutionStatus(root, approved.evolutionId);
  assert.equal(recovered.status, "applied");
  assert.equal(recovered.receiptCount, 8);
  assert.equal(
    await readFile(
      path.join(root, ...VARIANTS["priority-card"].targetPath.split("/")),
      "utf8",
    ),
    recovered.source.postimage,
  );
  await assert.rejects(
    readFile(storageFile(root, recovered, "pending-transaction.json"), "utf8"),
    { code: "ENOENT" },
  );
  await rm(root, { recursive: true, force: true });
});

test("journal recovery resumes after the exact preimage was captured", async () => {
  const root = await rootFixture("lead-navigation");
  const prepared = await prepareSourceEvolution(prepareInput(root, "lead-navigation"));
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  let thrown = false;
  setSourceEvolutionFaultInjectorForTests((point) => {
    if (point === "after-target-capture" && !thrown) {
      thrown = true;
      throw new Error("simulated crash after exact preimage capture");
    }
  });
  try {
    await assert.rejects(
      applySourceEvolution({
        root,
        evolutionId: approved.evolutionId,
        expectedRevision: approved.receiptCount,
      }),
      /simulated crash/u,
    );
  } finally {
    setSourceEvolutionFaultInjectorForTests();
  }
  const recovered = await getEvolutionStatus(root, approved.evolutionId);
  assert.equal(recovered.status, "applied");
  assert.equal(
    await readFile(
      path.join(root, ...VARIANTS["lead-navigation"].targetPath.split("/")),
      "utf8",
    ),
    recovered.source.postimage,
  );
  await rm(root, { recursive: true, force: true });
});

test("a concurrent writer is preserved and never overwritten during apply", async () => {
  const root = await rootFixture("priority-card");
  const prepared = await prepareSourceEvolution(prepareInput(root, "priority-card"));
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  const target = path.join(
    root,
    ...VARIANTS["priority-card"].targetPath.split("/"),
  );
  const concurrent = '"use client";\nexport default function ConcurrentEdit() { return <p>human edit</p>; }\n';
  let injected = false;
  setSourceEvolutionFaultInjectorForTests(async (point) => {
    if (point === "after-target-capture" && !injected) {
      injected = true;
      await writeFile(target, concurrent, "utf8");
    }
  });
  try {
    await expectCode(
      applySourceEvolution({
        root,
        evolutionId: approved.evolutionId,
        expectedRevision: approved.receiptCount,
      }),
      "STORAGE_CONFLICT",
    );
  } finally {
    setSourceEvolutionFaultInjectorForTests();
  }
  assert.equal(await readFile(target, "utf8"), concurrent);
  await rm(root, { recursive: true, force: true });
});

test("stale revisions and lifecycle replays are rejected", async () => {
  const root = await rootFixture("lead-navigation");
  const prepared = await prepareSourceEvolution(prepareInput(root, "lead-navigation"));
  await expectCode(
    approveSourceEvolution({
      ...approveInput(root, prepared),
      expectedRevision: prepared.receiptCount + 1,
    }),
    "STALE_REVISION",
  );
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  await expectCode(
    approveSourceEvolution({
      ...approveInput(root, prepared),
      expectedRevision: approved.receiptCount,
    }),
    "EVOLUTION_REPLAY_REJECTED",
  );
  await rm(root, { recursive: true, force: true });
});

test("same-app mutations reject active siblings and release the slot after rollback", async () => {
  const root = await sameAppRootFixture();
  const first = await prepareSourceEvolution(
    prepareInput(root, "lead-navigation"),
  );
  const second = await prepareSourceEvolution(
    prepareInput(root, "priority-card"),
  );
  const approvedFirst = await approveSourceEvolution(approveInput(root, first));

  await expectCode(
    approveSourceEvolution(approveInput(root, second)),
    "INVALID_TRANSITION",
  );
  await expectCode(
    applySourceEvolution({
      root,
      evolutionId: second.evolutionId,
      expectedRevision: second.receiptCount,
    }),
    "INVALID_TRANSITION",
  );

  const appliedFirst = await applySourceEvolution({
    root,
    evolutionId: approvedFirst.evolutionId,
    expectedRevision: approvedFirst.receiptCount,
  });
  await expectCode(
    approveSourceEvolution(approveInput(root, second)),
    "INVALID_TRANSITION",
  );
  const rolledBackFirst = await rollbackSourceEvolution({
    root,
    evolutionId: appliedFirst.evolutionId,
    humanId: "reviewer-1",
    expectedRevision: appliedFirst.receiptCount,
  });
  const approvedSecond = await approveSourceEvolution(approveInput(root, second));

  assert.equal(rolledBackFirst.status, "rolled-back");
  assert.equal(approvedSecond.status, "approved");
  await rm(root, { recursive: true, force: true });
});

test("concurrent direct-engine sibling approvals produce exactly one active evolution", async () => {
  const root = await sameAppRootFixture();
  const first = await prepareSourceEvolution(
    prepareInput(root, "lead-navigation"),
  );
  const second = await prepareSourceEvolution(
    prepareInput(root, "priority-card"),
  );

  const outcomes = await Promise.allSettled([
    approveSourceEvolution(approveInput(root, first)),
    approveSourceEvolution(approveInput(root, second)),
  ]);
  const fulfilled = outcomes.filter(
    (outcome): outcome is PromiseFulfilledResult<SourceEvolutionState> =>
      outcome.status === "fulfilled",
  );
  const rejected = outcomes.filter(
    (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
  );
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0]?.reason instanceof SourceEvolutionError);
  assert.ok(
    rejected[0]?.reason.code === "EVOLUTION_BUSY" ||
      rejected[0]?.reason.code === "INVALID_TRANSITION",
  );

  const states = await Promise.all([
    getEvolutionStatus(root, first.evolutionId),
    getEvolutionStatus(root, second.evolutionId),
  ]);
  assert.deepEqual(
    states.map((state) => state.status).sort(),
    ["approved", "prepared"],
  );
  assert.deepEqual(
    states.map((state) => state.receiptCount).sort((left, right) => left - right),
    [5, 7],
  );
  for (const state of states) {
    await assert.rejects(
      readFile(storageFile(root, state, "pending-transaction.json"), "utf8"),
      { code: "ENOENT" },
    );
  }
  await rm(root, { recursive: true, force: true });
});
