import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  Gpt56EvolutionBrief,
  IntelligenceProvenance,
  EvolutionReceipt,
  Opportunity,
  ProductManifest,
} from "@living-software/contracts";

import {
  SOURCE_EVOLUTION_TARGET_PATH,
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
} from "./index.js";
import {
  setSourceEvolutionFaultInjectorForTests,
  type SourceEvolutionFaultPoint,
} from "./lifecycle.js";


const MANIFEST_HASH = `sha256:${"a".repeat(64)}` as const;
const EVENT_HASH = `sha256:${"b".repeat(64)}` as const;
const CONFIG_HASH = `sha256:${"c".repeat(64)}` as const;
const REVISION = "revision-test-1";
const AT = "2026-07-20T12:00:00.000Z";

const PREIMAGE = `"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCrm } from "@/lib/store-provider";
import { contactFullName } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const leadId = params.id;

  const lead = useCrm((state) => state.leads.find((item) => item.id === leadId));
  const contact = useCrm((state) => state.contacts.find((item) => item.id === lead?.contactId));
  const name = contact ? contactFullName(contact) : "Lead";

  return (
    <div data-testid="page-lead-detail">
      <Link
        href="/leads"
        data-testid="back-to-leads"
      >
        Leads
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <h1>{name}</h1>
      </div>
    </div>
  );
}
`;

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

function provenance(pathName: string) {
  return {
    origin: "scanned" as const,
    confidence: 1,
    sources: [{ path: pathName, revision: REVISION }],
  };
}

function manifest(): ProductManifest {
  return {
    schemaVersion: "living.product-manifest/v1",
    appId: "surus.crm",
    release: { revision: REVISION, version: "0.1.0" },
    generatedAt: AT,
    generators: [{ adapterId: "next-app-router", adapterVersion: "0.1.0" }],
    nodes: [
      {
        id: "route.lead-detail",
        kind: "route",
        displayName: "Lead detail",
        provenance: provenance(SOURCE_EVOLUTION_TARGET_PATH),
      },
      {
        id: "action.context-revisit",
        kind: "action",
        displayName: "Context revisit",
        provenance: provenance("src/app/leads/page.tsx"),
      },
    ],
    edges: [],
    contentHash: MANIFEST_HASH,
  };
}

function opportunity(): Opportunity {
  return {
    schemaVersion: "living.opportunity/v1",
    opportunityId: "opportunity.backtracking.test",
    appId: "surus.crm",
    manifestHash: MANIFEST_HASH,
    detectedAt: AT,
    detector: {
      id: "detector.backtracking",
      version: "1.1.0",
      configHash: CONFIG_HASH,
    },
    window: { from: AT, to: "2026-07-20T12:05:00.000Z" },
    signal: {
      kind: "backtracking",
      metrics: [{ name: "workflow.revisits", unit: "count", observed: 17 }],
    },
    evidence: {
      bundle: {
        uri: "living://evidence/backtracking-test",
        mediaType: "application/json",
        sha256: EVENT_HASH,
      },
      eventSetHash: EVENT_HASH,
      sampleEventIds: ["event-1"],
      subjectCount: 3,
      sessionCount: 3,
      occurrenceCount: 17,
      dataOrigin: "synthetic",
    },
    confidence: { score: 0.74, reasonCodes: ["revisit-threshold"] },
  };
}

function brief(): Gpt56EvolutionBrief {
  return {
    schemaVersion: "living.evolution-brief/v1",
    briefId: "brief.backtracking.test",
    appId: "surus.crm",
    opportunityId: "opportunity.backtracking.test",
    manifestHash: MANIFEST_HASH,
    title: "Reduce lead-review backtracking",
    interpretation: "Reviewers repeatedly revisit nearby context while reviewing leads.",
    proposedChange: {
      kind: "workflow-assist",
      summary: "Reduce context switching during review.",
      userValue: "Keep review momentum without granting automation authority.",
      affectedProductNodeIds: ["action.context-revisit"],
      excludedWork: ["No message sending", "No external access"],
    },
    evidenceCitations: {
      eventSetHash: EVENT_HASH,
      sampleEventIds: ["event-1"],
      metrics: [{ name: "workflow.revisits", observed: 17 }],
    },
    successCriteria: [
      {
        metric: "workflow.revisits",
        direction: "decrease",
        target: "Fewer revisits in the synthetic replay",
        measurementWindow: "Next five synthetic sessions",
      },
    ],
    risks: ["Navigation order may not match reviewer expectation"],
    openQuestions: ["Should ordering follow current list filters?"],
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

function modelProvenance(): IntelligenceProvenance {
  return {
    provider: "openai",
    transport: "codex-cli",
    boundaryRequestedModel: "gpt-5.6",
    transportRequestedModel: "gpt-5.6-terra",
    actualResponseModel: null,
    responseId: null,
    codexThreadId: "thread-evolution-test",
    responseStoreRequested: null,
    localSessionPersisted: false,
    tokenUsage: {
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 50,
      reasoningOutputTokens: 20,
    },
    evidenceAliases: [{ alias: "evidence-001", eventId: "event-1" }],
  };
}

async function rootFixture(options?: {
  install?: "valid" | "missing" | "mismatch";
}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "living-evolution-"));
  const target = path.join(root, ...SOURCE_EVOLUTION_TARGET_PATH.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, PREIMAGE, "utf8");
  if (options?.install !== "missing") {
    await mkdir(path.join(root, ".living"), { recursive: true });
    await writeFile(
      path.join(root, ".living", "install-record.json"),
      JSON.stringify({
        schemaVersion: "living.install-record/v1",
        installId: "install-test",
        installedAt: AT,
        appId: "surus.crm",
        adapter: { id: "next-app-router", version: "0.1.0" },
        manifestHash:
          options?.install === "mismatch"
            ? `sha256:${"d".repeat(64)}`
            : MANIFEST_HASH,
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
  }
  return root;
}

function prepareInput(root: string): PrepareSourceEvolutionInput {
  return {
    root,
    app: app(),
    manifest: manifest(),
    opportunity: opportunity(),
    brief: brief(),
    modelProvenance: modelProvenance(),
    target: { path: SOURCE_EVOLUTION_TARGET_PATH, preimage: PREIMAGE },
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

function evolutionStorageFile(
  root: string,
  state: SourceEvolutionState,
  fileName: "state.json" | "receipts.ndjson" | "mutation.lock",
): string {
  return path.join(root, ...state.storage.directory.split("/"), fileName);
}

async function storedReceipts(
  root: string,
  state: SourceEvolutionState,
): Promise<readonly EvolutionReceipt[]> {
  return (await readFile(evolutionStorageFile(root, state, "receipts.ndjson"), "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as EvolutionReceipt);
}

async function overwriteStoredState(
  root: string,
  state: SourceEvolutionState,
  replacement: unknown,
): Promise<void> {
  await writeFile(
    evolutionStorageFile(root, state, "state.json"),
    `${JSON.stringify(replacement)}\n`,
    "utf8",
  );
}

test("prepares an exact deterministic source artifact and proof without editing the host", async () => {
  const root = await rootFixture();
  const state = await prepareSourceEvolution(prepareInput(root));
  assert.equal(state.status, "prepared");
  assert.equal(state.receiptCount, 4);
  assert.equal(state.inputs.brief.title, "Reduce lead-review backtracking");
  assert.equal(state.modelProvenance.transport, "codex-cli");
  assert.equal(state.artifact.interpretation.implementsBrief, false);
  assert.equal(await readFile(path.join(root, ...SOURCE_EVOLUTION_TARGET_PATH.split("/")), "utf8"), PREIMAGE);
  for (const hook of [
    "lead-review-navigation",
    "previous-lead-button",
    "lead-review-position",
    "next-lead-button",
  ]) {
    assert.equal(state.source.postimage.split(`data-testid="${hook}"`).length - 1, 1);
  }
  assert.equal((await getEvolutionStatus(root, state.evolutionId)).chainHead, state.chainHead);
  assert.equal((await listEvolutionStatuses(root)).length, 1);
});

test("requires explicit human approval before application", async () => {
  const root = await rootFixture();
  const prepared = await prepareSourceEvolution(prepareInput(root));
  await expectCode(
    applySourceEvolution({
      root,
      evolutionId: prepared.evolutionId,
      expectedRevision: prepared.receiptCount,
    }),
    "APPROVAL_REQUIRED",
  );
});

test("rejects a forged prepared-to-approved pointer before source mutation", async () => {
  const root = await rootFixture();
  const prepared = await prepareSourceEvolution(prepareInput(root));
  const receipts = await storedReceipts(root, prepared);
  const proofReceipt = receipts.find(
    (receipt) => receipt.kind === "proof.completed",
  );
  assert.ok(proofReceipt);
  await overwriteStoredState(root, prepared, {
    ...prepared,
    status: "approved",
    approval: {
      humanId: "reviewer-1",
      approvedAt: proofReceipt.recordedAt,
      contractHash: prepared.contract.contentHash,
      artifactHash: prepared.artifact.contentHash,
      proofHash: prepared.proof.proofHash,
      receiptHash: proofReceipt.receiptHash,
    },
  });

  await expectCode(
    applySourceEvolution({
      root,
      evolutionId: prepared.evolutionId,
      expectedRevision: prepared.receiptCount,
    }),
    "RECEIPT_CHAIN_INVALID",
  );
  assert.equal(
    await readFile(
      path.join(root, ...SOURCE_EVOLUTION_TARGET_PATH.split("/")),
      "utf8",
    ),
    PREIMAGE,
  );
});

test("rejects approval and application pointer substitution before mutation", async () => {
  const approvalRoot = await rootFixture();
  const approvalPrepared = await prepareSourceEvolution(
    prepareInput(approvalRoot),
  );
  const approved = await approveSourceEvolution(
    approveInput(approvalRoot, approvalPrepared),
  );
  const approvalReceipts = await storedReceipts(approvalRoot, approved);
  const contractReceipt = approvalReceipts.find(
    (receipt) => receipt.kind === "contract.confirmed",
  );
  assert.ok(contractReceipt);
  await overwriteStoredState(approvalRoot, approved, {
    ...approved,
    approval: {
      ...approved.approval,
      receiptHash: contractReceipt.receiptHash,
    },
  });
  await expectCode(
    applySourceEvolution({
      root: approvalRoot,
      evolutionId: approved.evolutionId,
      expectedRevision: approved.receiptCount,
    }),
    "RECEIPT_CHAIN_INVALID",
  );
  assert.equal(
    await readFile(
      path.join(approvalRoot, ...SOURCE_EVOLUTION_TARGET_PATH.split("/")),
      "utf8",
    ),
    PREIMAGE,
  );

  const applicationRoot = await rootFixture();
  const applicationPrepared = await prepareSourceEvolution(
    prepareInput(applicationRoot),
  );
  const applicationApproved = await approveSourceEvolution(
    approveInput(applicationRoot, applicationPrepared),
  );
  const applied = await applySourceEvolution({
    root: applicationRoot,
    evolutionId: applicationApproved.evolutionId,
    expectedRevision: applicationApproved.receiptCount,
  });
  const applicationReceipts = await storedReceipts(applicationRoot, applied);
  const approvalReceipt = applicationReceipts.find(
    (receipt) => receipt.kind === "activation.approved",
  );
  assert.ok(approvalReceipt);
  await overwriteStoredState(applicationRoot, applied, {
    ...applied,
    application: {
      ...applied.application,
      receiptHash: approvalReceipt.receiptHash,
    },
  });
  await expectCode(
    rollbackSourceEvolution({
      root: applicationRoot,
      evolutionId: applied.evolutionId,
      humanId: "reviewer-1",
      expectedRevision: applied.receiptCount,
    }),
    "RECEIPT_CHAIN_INVALID",
  );
  assert.equal(
    await readFile(
      path.join(applicationRoot, ...SOURCE_EVOLUTION_TARGET_PATH.split("/")),
      "utf8",
    ),
    applied.source.postimage,
  );
});

test("rejects rollback pointer substitution in terminal state", async () => {
  const root = await rootFixture();
  const prepared = await prepareSourceEvolution(prepareInput(root));
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  const applied = await applySourceEvolution({
    root,
    evolutionId: approved.evolutionId,
    expectedRevision: approved.receiptCount,
  });
  const rolledBack = await rollbackSourceEvolution({
    root,
    evolutionId: applied.evolutionId,
    humanId: "reviewer-1",
    expectedRevision: applied.receiptCount,
  });
  const receipts = await storedReceipts(root, rolledBack);
  const applicationReceipt = receipts.find(
    (receipt) => receipt.kind === "installation.activated",
  );
  assert.ok(applicationReceipt);
  await overwriteStoredState(root, rolledBack, {
    ...rolledBack,
    rollback: {
      ...rolledBack.rollback,
      receiptHash: applicationReceipt.receiptHash,
    },
  });
  await expectCode(
    getEvolutionStatus(root, rolledBack.evolutionId),
    "RECEIPT_CHAIN_INVALID",
  );
  assert.equal(
    await readFile(
      path.join(root, ...SOURCE_EVOLUTION_TARGET_PATH.split("/")),
      "utf8",
    ),
    PREIMAGE,
  );
});

test("quarantines expired locks without trusting repository owner tokens as paths", async () => {
  const root = await rootFixture();
  const prepared = await prepareSourceEvolution(prepareInput(root));
  await writeFile(
    evolutionStorageFile(root, prepared, "mutation.lock"),
    JSON.stringify({
      schemaVersion: "living.source-evolution-lock/v1",
      ownerToken: "../../../../../../escaped",
      acquiredAt: "2026-07-20T10:00:00.000Z",
      expiresAt: "2026-07-20T10:01:00.000Z",
    }),
    "utf8",
  );

  assert.equal(
    (await getEvolutionStatus(root, prepared.evolutionId)).status,
    "prepared",
  );
  await assert.rejects(readFile(path.join(root, "escaped.json"), "utf8"), {
    code: "ENOENT",
  });
  const entries = await readdir(
    path.join(root, ...prepared.storage.directory.split("/")),
  );
  assert.equal(entries.includes("mutation.lock"), false);
  assert.equal(
    entries.filter((entry) =>
      /^mutation\.lock\.stale\.[0-9a-f-]{36}\.json$/u.test(entry),
    ).length,
    1,
  );
});

test("rejects target tampering after approval", async () => {
  const root = await rootFixture();
  const prepared = await prepareSourceEvolution(prepareInput(root));
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  const target = path.join(root, ...SOURCE_EVOLUTION_TARGET_PATH.split("/"));
  await writeFile(target, `${PREIMAGE}\n// developer edit\n`, "utf8");
  await expectCode(
    applySourceEvolution({
      root,
      evolutionId: approved.evolutionId,
      expectedRevision: approved.receiptCount,
    }),
    "TARGET_PREIMAGE_MISMATCH",
  );
  assert.equal((await getEvolutionStatus(root, approved.evolutionId)).status, "approved");
});

test("applies only the exact approved postimage", async () => {
  const root = await rootFixture();
  const prepared = await prepareSourceEvolution(prepareInput(root));
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  const applied = await applySourceEvolution({
    root,
    evolutionId: approved.evolutionId,
    expectedRevision: approved.receiptCount,
  });
  assert.equal(applied.status, "applied");
  assert.equal(applied.receiptCount, 7);
  assert.equal(
    await readFile(path.join(root, ...SOURCE_EVOLUTION_TARGET_PATH.split("/")), "utf8"),
    applied.source.postimage,
  );
});

test("revalidates the installed host identity immediately before application", async () => {
  for (const mode of ["missing", "mismatch"] as const) {
    const root = await rootFixture();
    const prepared = await prepareSourceEvolution(prepareInput(root));
    const approved = await approveSourceEvolution(approveInput(root, prepared));
    const installPath = path.join(root, ".living", "install-record.json");
    if (mode === "missing") {
      await rm(installPath);
    } else {
      const install = JSON.parse(await readFile(installPath, "utf8")) as {
        manifestHash: string;
      } & Record<string, unknown>;
      await writeFile(
        installPath,
        JSON.stringify({
          ...install,
          manifestHash: `sha256:${"d".repeat(64)}`,
        }),
        "utf8",
      );
    }
    await expectCode(
      applySourceEvolution({
        root,
        evolutionId: approved.evolutionId,
        expectedRevision: approved.receiptCount,
      }),
      mode === "missing" ? "HOST_NOT_INSTALLED" : "HOST_INSTALL_MISMATCH",
    );
    assert.equal(
      await readFile(
        path.join(root, ...SOURCE_EVOLUTION_TARGET_PATH.split("/")),
        "utf8",
      ),
      PREIMAGE,
    );
    assert.equal(
      (await getEvolutionStatus(root, approved.evolutionId)).status,
      "approved",
    );
  }
});

test("rolls back only the exact installed postimage", async () => {
  const root = await rootFixture();
  const prepared = await prepareSourceEvolution(prepareInput(root));
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  const applied = await applySourceEvolution({
    root,
    evolutionId: approved.evolutionId,
    expectedRevision: approved.receiptCount,
  });
  const rolledBack = await rollbackSourceEvolution({
    root,
    evolutionId: applied.evolutionId,
    humanId: "reviewer-1",
    expectedRevision: applied.receiptCount,
  });
  assert.equal(rolledBack.status, "rolled-back");
  assert.equal(rolledBack.receiptCount, 8);
  assert.equal(
    await readFile(path.join(root, ...SOURCE_EVOLUTION_TARGET_PATH.split("/")), "utf8"),
    PREIMAGE,
  );
});

test("rejects lifecycle replay and stale revisions", async () => {
  const root = await rootFixture();
  const prepared = await prepareSourceEvolution(prepareInput(root));
  await expectCode(
    approveSourceEvolution({
      ...approveInput(root, prepared),
      expectedRevision: prepared.receiptCount - 1,
    }),
    "STALE_REVISION",
  );
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  const applied = await applySourceEvolution({
    root,
    evolutionId: approved.evolutionId,
    expectedRevision: approved.receiptCount,
  });
  await expectCode(
    applySourceEvolution({
      root,
      evolutionId: applied.evolutionId,
      expectedRevision: applied.receiptCount,
    }),
    "EVOLUTION_REPLAY_REJECTED",
  );
  await expectCode(
    prepareSourceEvolution(prepareInput(root)),
    "TARGET_PREIMAGE_MISMATCH",
  );
});

test("requires an exact Living install record", async () => {
  const missing = await rootFixture({ install: "missing" });
  await expectCode(
    prepareSourceEvolution(prepareInput(missing)),
    "HOST_NOT_INSTALLED",
  );
  const mismatch = await rootFixture({ install: "mismatch" });
  await expectCode(
    prepareSourceEvolution(prepareInput(mismatch)),
    "HOST_INSTALL_MISMATCH",
  );
});

test("serializes concurrent approvals with a filesystem CAS lock", async () => {
  const root = await rootFixture();
  const prepared = await prepareSourceEvolution(prepareInput(root));
  const input = approveInput(root, prepared);
  const results = await Promise.allSettled([
    approveSourceEvolution(input),
    approveSourceEvolution(input),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected !== undefined && rejected.status === "rejected");
  assert.ok(
    rejected.reason instanceof SourceEvolutionError &&
      ["EVOLUTION_BUSY", "STALE_REVISION"].includes(rejected.reason.code),
  );
  const state = await getEvolutionStatus(root, prepared.evolutionId);
  assert.equal(state.status, "approved");
  assert.equal(state.receiptCount, 6);
  const receiptLines = (
    await readFile(
      path.join(
        root,
        ".living",
        "data",
        "evolutions",
        prepared.evolutionId,
        "receipts.ndjson",
      ),
      "utf8",
    )
  ).trim().split("\n");
  assert.equal(receiptLines.length, 6);
  assert.deepEqual(
    receiptLines.map((line) => JSON.parse(line).sequence),
    [0, 1, 2, 3, 4, 5],
  );
});

test("reclaims an expired owner-token lock without relying on a reusable pid", async () => {
  const root = await rootFixture();
  const prepared = await prepareSourceEvolution(prepareInput(root));
  const directory = path.join(
    root,
    ".living",
    "data",
    "evolutions",
    prepared.evolutionId,
  );
  await writeFile(
    path.join(directory, "mutation.lock"),
    JSON.stringify({
      schemaVersion: "living.source-evolution-lock/v1",
      ownerToken: "stale-owner",
      acquiredAt: "2026-07-20T10:00:00.000Z",
      expiresAt: "2026-07-20T10:01:00.000Z",
    }),
    "utf8",
  );
  assert.equal(
    (await getEvolutionStatus(root, prepared.evolutionId)).status,
    "prepared",
  );
  assert.equal(
    (await readdir(directory)).filter((entry) =>
      /^mutation\.lock\.stale\.[0-9a-f-]{36}\.json$/u.test(entry),
    ).length,
    1,
  );
});

test("rolled back is terminal for the same evidence identity", async () => {
  const root = await rootFixture();
  const prepared = await prepareSourceEvolution(prepareInput(root));
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  const applied = await applySourceEvolution({
    root,
    evolutionId: approved.evolutionId,
    expectedRevision: approved.receiptCount,
  });
  const rolledBack = await rollbackSourceEvolution({
    root,
    evolutionId: applied.evolutionId,
    humanId: "reviewer-1",
    expectedRevision: applied.receiptCount,
  });
  assert.equal(rolledBack.status, "rolled-back");
  await expectCode(
    prepareSourceEvolution(prepareInput(root)),
    "EVOLUTION_ALREADY_EXISTS",
  );
});

test("recovers every write-ahead crash point without duplicate effects", async () => {
  const crashPoints = [
    "after-journal",
    "after-target",
    "after-receipts",
    "after-state",
  ] satisfies readonly SourceEvolutionFaultPoint[];

  for (const crashPoint of crashPoints) {
    const root = await rootFixture();
    const prepared = await prepareSourceEvolution(prepareInput(root));
    const approved = await approveSourceEvolution(approveInput(root, prepared));
    let injected = false;
    setSourceEvolutionFaultInjectorForTests((point) => {
      if (!injected && point === crashPoint) {
        injected = true;
        throw new Error(`simulated crash at ${point}`);
      }
    });
    try {
      await assert.rejects(
        applySourceEvolution({
          root,
          evolutionId: approved.evolutionId,
          expectedRevision: approved.receiptCount,
        }),
        /simulated crash/,
      );
    } finally {
      setSourceEvolutionFaultInjectorForTests(undefined);
    }
    assert.equal(injected, true, `fault was injected at ${crashPoint}`);

    const directory = path.join(
      root,
      ".living",
      "data",
      "evolutions",
      approved.evolutionId,
    );
    const journal = path.join(directory, "pending-transaction.json");
    await assert.doesNotReject(readFile(journal, "utf8"));

    const recovered = await getEvolutionStatus(root, approved.evolutionId);
    assert.equal(recovered.status, "applied");
    assert.equal(recovered.receiptCount, 7);
    assert.equal(
      await readFile(
        path.join(root, ...SOURCE_EVOLUTION_TARGET_PATH.split("/")),
        "utf8",
      ),
      recovered.source.postimage,
    );
    await assert.rejects(
      readFile(journal, "utf8"),
      (error: unknown) =>
        (error as NodeJS.ErrnoException).code === "ENOENT",
    );
    const receiptLines = (await readFile(path.join(directory, "receipts.ndjson"), "utf8"))
      .trim()
      .split("\n");
    assert.equal(receiptLines.length, 7);
    assert.deepEqual(
      receiptLines.map((line) => JSON.parse(line).sequence),
      [0, 1, 2, 3, 4, 5, 6],
    );
  }
});

test("recovers an interrupted reverse source transition during rollback", async () => {
  const root = await rootFixture();
  const prepared = await prepareSourceEvolution(prepareInput(root));
  const approved = await approveSourceEvolution(approveInput(root, prepared));
  const applied = await applySourceEvolution({
    root,
    evolutionId: approved.evolutionId,
    expectedRevision: approved.receiptCount,
  });
  let injected = false;
  setSourceEvolutionFaultInjectorForTests((point) => {
    if (!injected && point === "after-target") {
      injected = true;
      throw new Error("simulated rollback crash after target");
    }
  });
  try {
    await assert.rejects(
      rollbackSourceEvolution({
        root,
        evolutionId: applied.evolutionId,
        humanId: "reviewer-1",
        expectedRevision: applied.receiptCount,
      }),
      /simulated rollback crash/,
    );
  } finally {
    setSourceEvolutionFaultInjectorForTests(undefined);
  }
  assert.equal(injected, true);

  const directory = path.join(
    root,
    ".living",
    "data",
    "evolutions",
    applied.evolutionId,
  );
  const journal = path.join(directory, "pending-transaction.json");
  await assert.doesNotReject(readFile(journal, "utf8"));

  const recovered = await getEvolutionStatus(root, applied.evolutionId);
  assert.equal(recovered.status, "rolled-back");
  assert.equal(recovered.receiptCount, 8);
  assert.equal(
    await readFile(
      path.join(root, ...SOURCE_EVOLUTION_TARGET_PATH.split("/")),
      "utf8",
    ),
    PREIMAGE,
  );
  await assert.rejects(
    readFile(journal, "utf8"),
    (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
  );
  const receiptLines = (await readFile(path.join(directory, "receipts.ndjson"), "utf8"))
    .trim()
    .split("\n");
  assert.equal(receiptLines.length, 8);
  assert.deepEqual(
    receiptLines.map((line) => JSON.parse(line).sequence),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
});
