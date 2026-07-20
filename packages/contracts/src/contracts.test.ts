import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  capabilityArtifactSchema,
  capabilityContractSchema,
  collectorEndpointSchema,
  evolutionReceiptSchema,
  gpt56ProofSchema,
  livingConfigSchema,
  metricReportSchema,
  opportunitySchema,
  parseGpt56Proof,
  productManifestSchema,
  studioCommandEnvelopeSchema,
  studioSnapshotSchema,
  validateCapabilityArtifactAgainstContract,
  validateWorkflowEventAgainstConfig,
  workflowEventSchema,
} from "./index.js";

const committedGpt56Proof = JSON.parse(
  await readFile(
    new URL("../../../docs/proof/gpt56-live-codex-cli.json", import.meta.url),
    "utf8",
  ),
) as unknown;
const parsedGpt56Proof = parseGpt56Proof(committedGpt56Proof);

function cloneGpt56Proof() {
  return structuredClone(parsedGpt56Proof);
}

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const HASH_C = `sha256:${"c".repeat(64)}`;
const HASH_D = `sha256:${"d".repeat(64)}`;
const NOW = "2026-07-19T12:00:00.000Z";
const CLOSED_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

const validConfig = {
  schemaVersion: "living.config/v1",
  application: { id: "sample-app", displayName: "Sample App" },
  adapters: [{ id: "adapter-next", version: "1.0.0" }],
  collector: { endpoint: "http://localhost:4111/v1/events" },
  manifest: { root: "." },
  semantics: {
    events: {
      "record.opened": {
        kind: "action",
        subjectType: "record",
        metadataSchema: CLOSED_SCHEMA,
      },
    },
  },
  privacy: {
    metadataPolicy: "deny-by-default",
    identifierMode: "pseudonymous",
    pseudonymSaltEnv: "LIVING_PSEUDONYM_SALT",
    retentionDays: 30,
  },
  broker: {
    descriptorPath: ".well-known/living-host.json",
    invocationPath: "/api/living/invoke",
  },
};

const provenance = {
  origin: "scanned",
  confidence: 1,
  sources: [{ path: "src/app/page.tsx", revision: "abc123", line: 1 }],
};

const validHostInterface = {
  schemaVersion: "living.host-interface/v1",
  appId: "sample-app",
  version: "1.0.0",
  extensionPoints: [
    { id: "extension.primary", surfaceNodeId: "surface.home", presentation: "action" },
  ],
  operations: [
    {
      id: "record.update",
      version: "1.0.0",
      effect: "write",
      inputSchema: CLOSED_SCHEMA,
      outputSchema: CLOSED_SCHEMA,
      idempotency: "required",
      requiresUserConfirmation: false,
    },
  ],
  contentHash: HASH_B,
};

const validManifest = {
  schemaVersion: "living.product-manifest/v1",
  appId: "sample-app",
  release: { revision: "abc123", version: "0.1.0" },
  generatedAt: NOW,
  generators: [{ adapterId: "adapter-next", adapterVersion: "1.0.0" }],
  nodes: [
    {
      id: "surface.home",
      kind: "surface",
      displayName: "Home",
      provenance,
    },
    {
      id: "extension.primary",
      kind: "extension-point",
      displayName: "Primary action",
      provenance,
    },
  ],
  edges: [
    {
      from: "surface.home",
      to: "extension.primary",
      relation: "exposes",
      provenance,
    },
  ],
  hostInterface: validHostInterface,
  contentHash: HASH_A,
};

const validEvent = {
  schemaVersion: "living.workflow-event/v1",
  eventId: "event-1",
  appId: "sample-app",
  environment: "development",
  releaseRevision: "abc123",
  occurredAt: NOW,
  sequence: 0,
  name: "record.opened",
  kind: "action",
  status: "succeeded",
  sessionId: "session-1",
  actor: { pseudonymousId: "actor-1" },
  subject: { type: "record", pseudonymousId: "subject-1" },
  product: { manifestHash: HASH_A, nodeId: "surface.home" },
  metadata: {},
  provenance: { source: "sdk", synthetic: false },
};

const validOpportunity = {
  schemaVersion: "living.opportunity/v1",
  opportunityId: "opportunity-1",
  appId: "sample-app",
  manifestHash: HASH_A,
  detectedAt: NOW,
  detector: { id: "detector.backtrack", version: "1.0.0", configHash: HASH_B },
  window: { from: "2026-07-18T12:00:00.000Z", to: NOW },
  signal: {
    kind: "backtracking",
    sequence: ["record.opened", "record.opened"],
    metrics: [{ name: "revisit-count", unit: "count", observed: 3 }],
  },
  evidence: {
    bundle: { uri: "evidence/run-1.jsonl", mediaType: "application/jsonl", sha256: HASH_C },
    eventSetHash: HASH_D,
    sampleEventIds: ["event-1"],
    subjectCount: 4,
    sessionCount: 4,
    occurrenceCount: 4,
    dataOrigin: "synthetic",
  },
  confidence: { score: 0.9, reasonCodes: ["threshold-met"] },
};

const validContract = {
  schemaVersion: "living.capability-contract/v1",
  contractId: "contract-1",
  revision: 1,
  appId: "sample-app",
  source: { opportunityId: "opportunity-1", opportunityHash: HASH_C },
  target: {
    manifestHash: HASH_A,
    hostInterfaceHash: HASH_B,
    extensionPointId: "extension.primary",
  },
  display: { name: "Combined action", purpose: "Reduce repeated work." },
  inputSchema: CLOSED_SCHEMA,
  outputSchema: CLOSED_SCHEMA,
  grants: [
    { operationId: "record.update", operationVersion: "1.0.0", maxCalls: 1 },
  ],
  prohibitions: [
    "undeclared-operation",
    "network",
    "filesystem",
    "process",
    "secret-access",
    "dynamic-code",
  ],
  budgets: {
    maxDurationMs: 5_000,
    maxOperationCalls: 1,
    maxOutputBytes: 4_096,
  },
  acceptanceTests: [{ testId: "capability.acceptance" }],
  rollback: { strategy: "deactivate", preserveReceipts: true },
  contentHash: HASH_C,
};

const validArtifact = {
  schemaVersion: "living.capability-artifact/v1",
  artifactId: "artifact-1",
  artifactVersion: "1.0.0",
  appId: "sample-app",
  contract: { id: "contract-1", hash: HASH_C },
  target: {
    manifestHash: HASH_A,
    hostInterfaceHash: HASH_B,
    extensionPointId: "extension.primary",
  },
  format: "broker-workflow/v1",
  presentation: {
    label: "Run combined action",
    description: "Performs the approved workflow.",
  },
  steps: [
    {
      id: "update",
      operationId: "record.update",
      operationVersion: "1.0.0",
      input: { $value: { source: "input", path: [] } },
      onFailure: "stop",
    },
  ],
  output: { $value: { source: "step", stepId: "update", path: [] } },
  contentHash: HASH_D,
};

const validReceipt = {
  schemaVersion: "living.evolution-receipt/v1",
  receiptId: "receipt-1",
  appId: "sample-app",
  evolutionId: "evolution-1",
  sequence: 0,
  previousHash: null,
  recordedAt: NOW,
  kind: "contract.confirmed",
  actor: { type: "human", id: "reviewer-1" },
  refs: { opportunityHash: HASH_C, contractHash: HASH_C },
  payload: {},
  payloadHash: HASH_A,
  receiptHash: HASH_B,
};

const validStudioCommand = {
  schemaVersion: "living.studio-command/v1",
  commandId: "command-1",
  appId: "sample-app",
  expectedRevision: 3,
  command: {
    type: "contract.confirm",
    evolutionId: "evolution-1",
    contract: validContract,
  },
};

const CASE_A = `case:${"1".repeat(64)}`;
const CASE_B = `case:${"2".repeat(64)}`;
const VARIANT_A = `variant:${"3".repeat(64)}`;

const validStudioSnapshot = {
  schemaVersion: "living.studio-snapshot/v1",
  generatedAt: NOW,
  application: {
    appId: "sample-app",
    displayName: "Sample App",
    environment: "development",
    releaseRevision: "abc123",
    manifestHash: HASH_A,
    dataOrigin: "synthetic",
  },
  productManifest: validManifest,
  evidence: {
    path: ".living/data/releases/aaaaaaaa/events.ndjson",
    records: 1,
    events: 3,
    chainHead: HASH_B,
  },
  workflows: {
    cases: [
      {
        caseId: CASE_A,
        durationMs: 100,
        outcome: "succeeded",
        eventCount: 1,
        journeyNodeIds: ["surface.home"],
        sessionCount: 1,
      },
      {
        caseId: CASE_B,
        durationMs: 300,
        outcome: "failed",
        eventCount: 2,
        journeyNodeIds: ["surface.home"],
        sessionCount: 1,
      },
    ],
    variants: [
      {
        variantId: VARIANT_A,
        caseIds: [CASE_A, CASE_B],
        journeyNodeIds: ["surface.home"],
        caseCount: 2,
        averageDurationMs: 200,
        outcomes: { succeeded: 1, failed: 1, abandoned: 0, unknown: 0 },
      },
    ],
  },
  metricReport: {
    schemaVersion: "living.metric-report/v1",
    appId: "sample-app",
    manifestHash: HASH_A,
    generatedAt: NOW,
    window: { from: "2026-07-18T12:00:00.000Z", to: NOW },
    dataOrigin: "synthetic",
    totals: { events: 3, sessions: 2, cases: 2, variants: 1 },
    values: [],
  },
  opportunity: {
    opportunityId: validOpportunity.opportunityId,
    appId: validOpportunity.appId,
    manifestHash: validOpportunity.manifestHash,
    detectedAt: validOpportunity.detectedAt,
    detector: validOpportunity.detector,
    window: validOpportunity.window,
    signal: {
      kind: validOpportunity.signal.kind,
      metrics: validOpportunity.signal.metrics,
    },
    evidence: {
      bundle: { ...validOpportunity.evidence.bundle, sha256: HASH_D },
      eventSetHash: validOpportunity.evidence.eventSetHash,
      subjectCount: 2,
      sessionCount: 2,
      occurrenceCount: 2,
      dataOrigin: validOpportunity.evidence.dataOrigin,
    },
    confidence: validOpportunity.confidence,
  },
};

test("all public schema examples parse", () => {
  assert.doesNotThrow(() => livingConfigSchema.parse(validConfig));
  assert.doesNotThrow(() => productManifestSchema.parse(validManifest));
  assert.doesNotThrow(() => workflowEventSchema.parse(validEvent));
  assert.doesNotThrow(() => opportunitySchema.parse(validOpportunity));
  assert.doesNotThrow(() => capabilityContractSchema.parse(validContract));
  assert.doesNotThrow(() => capabilityArtifactSchema.parse(validArtifact));
  assert.doesNotThrow(() => evolutionReceiptSchema.parse(validReceipt));
  assert.doesNotThrow(() => studioCommandEnvelopeSchema.parse(validStudioCommand));
  assert.doesNotThrow(() => studioSnapshotSchema.parse(validStudioSnapshot));
});

test("all public envelopes reject unknown fields", () => {
  const cases = [
    [livingConfigSchema, validConfig],
    [productManifestSchema, validManifest],
    [workflowEventSchema, validEvent],
    [opportunitySchema, validOpportunity],
    [capabilityContractSchema, validContract],
    [capabilityArtifactSchema, validArtifact],
    [evolutionReceiptSchema, validReceipt],
    [studioCommandEnvelopeSchema, validStudioCommand],
    [studioSnapshotSchema, validStudioSnapshot],
  ] as const;

  for (const [schema, value] of cases) {
    assert.throws(() => schema.parse({ ...value, unexpected: true }));
  }
});

test("the committed GPT-5.6 v2 proof parses through the public contract", () => {
  assert.equal(parsedGpt56Proof.schemaVersion, "living.gpt56-proof/v2");
  assert.equal(parsedGpt56Proof.selectedProvider, "codex");
  assert.equal(
    parsedGpt56Proof.result.provenance.transportRequestedModel,
    "gpt-5.6-terra",
  );
});

test("GPT-5.6 proof envelopes and nested records reject unknown fields", () => {
  assert.throws(() =>
    gpt56ProofSchema.parse({
      ...(committedGpt56Proof as Record<string, unknown>),
      unexpected: true,
    }),
  );

  const nested = cloneGpt56Proof() as typeof parsedGpt56Proof & {
    result: typeof parsedGpt56Proof.result & { unexpected?: boolean };
  };
  nested.result.unexpected = true;
  assert.throws(() => gpt56ProofSchema.parse(nested));
});

test("GPT-5.6 proof provenance enforces both provider branches", () => {
  const apiProof = cloneGpt56Proof();
  Object.assign(apiProof, { selectedProvider: "api" });
  Object.assign(apiProof.request, {
    transportRequestedModel: "gpt-5.6",
    responseStoreRequested: false,
  });
  Object.assign(apiProof.result.provenance, {
    transport: "responses-api",
    transportRequestedModel: "gpt-5.6",
    actualResponseModel: "gpt-5.6-2026-07-01",
    responseId: "resp-proof-1",
    codexThreadId: null,
    responseStoreRequested: false,
    localSessionPersisted: null,
  });
  assert.doesNotThrow(() => gpt56ProofSchema.parse(apiProof));

  const providerMismatch = cloneGpt56Proof();
  Object.assign(providerMismatch, { selectedProvider: "api" });
  assert.throws(() => gpt56ProofSchema.parse(providerMismatch));

  const transportMismatch = cloneGpt56Proof();
  Object.assign(transportMismatch.request, {
    transportRequestedModel: "gpt-5.6",
  });
  assert.throws(() => gpt56ProofSchema.parse(transportMismatch));

  const fabricatedActualModel = cloneGpt56Proof();
  Object.assign(fabricatedActualModel.result.provenance, {
    actualResponseModel: "gpt-5.6-terra",
  });
  assert.throws(() => gpt56ProofSchema.parse(fabricatedActualModel));

  const persistedCodexSession = cloneGpt56Proof();
  Object.assign(persistedCodexSession.result.provenance, {
    localSessionPersisted: null,
  });
  assert.throws(() => gpt56ProofSchema.parse(persistedCodexSession));
});

test("GPT-5.6 proof identity remains linked across evidence and draft", () => {
  const mutations: Array<(proof: ReturnType<typeof cloneGpt56Proof>) => void> = [
    (proof) => {
      Object.assign(proof.result.draft, { appId: "other-app" });
    },
    (proof) => {
      Object.assign(proof.result.draft, {
        opportunityId: "opportunity.other",
      });
    },
    (proof) => {
      Object.assign(proof.result.draft, { manifestHash: HASH_B });
    },
    (proof) => {
      Object.assign(proof.result.draft.evidenceCitations, {
        eventSetHash: HASH_C,
      });
    },
    (proof) => {
      Object.assign(proof.result.draft.evidenceScope, {
        origin: "observed",
        claimScope: "observed-window-only",
      });
    },
  ];

  for (const mutate of mutations) {
    const candidate = cloneGpt56Proof();
    mutate(candidate);
    assert.throws(() => gpt56ProofSchema.parse(candidate));
  }
});

test("GPT-5.6 proof citations resolve through unique evidence aliases", () => {
  const missingAlias = cloneGpt56Proof();
  missingAlias.result.draft.evidenceCitations.sampleEventIds[0] =
    "event.not-in-provenance";
  assert.throws(() => gpt56ProofSchema.parse(missingAlias));

  const duplicateAlias = cloneGpt56Proof();
  duplicateAlias.result.provenance.evidenceAliases[1] = {
    ...duplicateAlias.result.provenance.evidenceAliases[1]!,
    alias: duplicateAlias.result.provenance.evidenceAliases[0]!.alias,
  };
  assert.throws(() => gpt56ProofSchema.parse(duplicateAlias));

  const duplicateEvent = cloneGpt56Proof();
  duplicateEvent.result.provenance.evidenceAliases[1] = {
    ...duplicateEvent.result.provenance.evidenceAliases[1]!,
    eventId: duplicateEvent.result.provenance.evidenceAliases[0]!.eventId,
  };
  assert.throws(() => gpt56ProofSchema.parse(duplicateEvent));

  const impossibleCount = cloneGpt56Proof();
  Object.assign(impossibleCount.evidence, { eventCount: 1 });
  assert.throws(() => gpt56ProofSchema.parse(impossibleCount));
});

test("GPT-5.6 proof scope, validation, and governance fail closed", () => {
  const wrongScope = cloneGpt56Proof();
  Object.assign(wrongScope.result.draft.evidenceScope, {
    claimScope: "observed-window-only",
  });
  assert.throws(() => gpt56ProofSchema.parse(wrongScope));

  const productionClaim = cloneGpt56Proof();
  Object.assign(productionClaim.result.draft.evidenceScope, {
    productionGeneralizationAllowed: true,
  });
  assert.throws(() => gpt56ProofSchema.parse(productionClaim));

  const activatable = cloneGpt56Proof();
  Object.assign(activatable.result.draft.governance, {
    activationAllowed: true,
  });
  assert.throws(() => gpt56ProofSchema.parse(activatable));

  const noApproval = cloneGpt56Proof();
  Object.assign(noApproval.result.draft.governance, {
    humanApprovalRequired: false,
  });
  assert.throws(() => gpt56ProofSchema.parse(noApproval));

  const unvalidated = cloneGpt56Proof();
  Object.assign(unvalidated.localValidation, { references: "failed" });
  assert.throws(() => gpt56ProofSchema.parse(unvalidated));
});

test("LivingConfig enforces pseudonymization and closed metadata", () => {
  const missingSalt = structuredClone(validConfig);
  delete (missingSalt.privacy as Partial<typeof missingSalt.privacy>).pseudonymSaltEnv;
  assert.throws(() => livingConfigSchema.parse(missingSalt));

  const openMetadata = structuredClone(validConfig);
  openMetadata.semantics.events["record.opened"].metadataSchema.additionalProperties = true;
  assert.throws(() => livingConfigSchema.parse(openMetadata));
});

test("collector endpoints allow same-origin paths and strict HTTP(S) URLs", () => {
  assert.doesNotThrow(() => collectorEndpointSchema.parse("/api/living/events"));
  assert.doesNotThrow(() =>
    collectorEndpointSchema.parse("https://collector.example.com/v1/events"),
  );

  const relativeConfig = structuredClone(validConfig);
  relativeConfig.collector.endpoint = "/api/living/events";
  assert.doesNotThrow(() => livingConfigSchema.parse(relativeConfig));
});

test("collector endpoints reject ambiguous schemes and traversal", () => {
  const rejected = [
    "javascript:alert(1)",
    "//collector.example.com/api/living/events",
    "/api/living/events?token=value",
    "/api/living/events#fragment",
    "/api\\living\\events",
    "/api//living/events",
    "/api/../living/events",
    "/api/./living/events",
    "/api/%2e%2e/living/events",
    "/api/%2E./living/events",
    "/api/.%2e/living/events",
    "/api/%252e%252e/living/events",
    "/api/%2f..%2fliving/events",
    "https://collector.example.com/v1/events?token=value",
    "https://collector.example.com/v1/events#fragment",
    "https://collector.example.com/api/%2e%2e/events",
  ];

  for (const endpoint of rejected) {
    assert.throws(
      () => collectorEndpointSchema.parse(endpoint),
      undefined,
      `Expected '${endpoint}' to be rejected`,
    );
  }
});

test("MetricReport supports pixel values and product-scoped uniqueness", () => {
  const base = {
    schemaVersion: "living.metric-report/v1",
    appId: "sample-app",
    manifestHash: HASH_A,
    generatedAt: NOW,
    window: { from: NOW, to: NOW },
    dataOrigin: "synthetic",
    totals: { events: 2, sessions: 1, cases: 1, variants: 1 },
    values: [
      {
        id: "layout.target-distance-average",
        unit: "pixels",
        value: 120,
        samples: 1,
        productNodeId: "action.save",
        routeNodeId: "route.home",
        viewportClass: "large",
      },
    ],
  };
  assert.doesNotThrow(() => metricReportSchema.parse(base));
  assert.doesNotThrow(() =>
    metricReportSchema.parse({
      ...base,
      values: [
        ...base.values,
        { ...base.values[0], productNodeId: "action.cancel" },
        { ...base.values[0], routeNodeId: "route.settings" },
        { ...base.values[0], viewportClass: "small" },
      ],
    }),
  );
  assert.throws(() =>
    metricReportSchema.parse({
      ...base,
      values: [...base.values, { ...base.values[0] }],
    }),
  );
});

test("ProductManifest rejects dangling edges and mismatched host applications", () => {
  const dangling = structuredClone(validManifest);
  dangling.edges[0]!.to = "missing.node";
  assert.throws(() => productManifestSchema.parse(dangling));

  const mismatch = structuredClone(validManifest);
  mismatch.hostInterface.appId = "other-app";
  assert.throws(() => productManifestSchema.parse(mismatch));
});

test("WorkflowEvent preserves synthetic provenance and matches configuration", () => {
  const imported = { ...validEvent, provenance: { source: "import", synthetic: false } };
  assert.throws(() => workflowEventSchema.parse(imported));

  const event = workflowEventSchema.parse(validEvent);
  const config = livingConfigSchema.parse(validConfig);
  assert.deepEqual(validateWorkflowEventAgainstConfig(event, config), { ok: true });

  const undeclared = workflowEventSchema.parse({ ...validEvent, name: "record.deleted" });
  assert.equal(validateWorkflowEventAgainstConfig(undeclared, config).ok, false);
});

test("Opportunity windows and evidence identifiers are falsifiable", () => {
  const reversed = structuredClone(validOpportunity);
  reversed.window = { from: NOW, to: "2026-07-18T12:00:00.000Z" };
  assert.throws(() => opportunitySchema.parse(reversed));

  const duplicateEvidence = structuredClone(validOpportunity);
  duplicateEvidence.evidence.sampleEventIds = ["event-1", "event-1"];
  assert.throws(() => opportunitySchema.parse(duplicateEvidence));
});

test("Capability artifacts are declarative and remain inside exact grants", () => {
  const artifact = capabilityArtifactSchema.parse(validArtifact);
  const contract = capabilityContractSchema.parse(validContract);
  const host = productManifestSchema.parse(validManifest).hostInterface!;
  assert.deepEqual(
    validateCapabilityArtifactAgainstContract(artifact, contract, host),
    { ok: true },
  );

  const undeclared = capabilityArtifactSchema.parse({
    ...validArtifact,
    steps: [
      {
        ...validArtifact.steps[0],
        operationId: "external.send",
      },
    ],
  });
  const result = validateCapabilityArtifactAgainstContract(
    undeclared,
    contract,
    host,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.issues.join("\n"), /undeclared operation/);
  }
});

test("Capability artifacts reject forward step references", () => {
  const forwardReference = structuredClone(validArtifact);
  forwardReference.steps[0]!.input = {
    $value: { source: "step", stepId: "future", path: [] },
  };
  assert.throws(() => capabilityArtifactSchema.parse(forwardReference));
});

test("Evolution receipts preserve human authority and hash-chain shape", () => {
  assert.throws(() =>
    evolutionReceiptSchema.parse({
      ...validReceipt,
      actor: {
        type: "model",
        provider: "openai",
        model: "gpt-5.6",
        runId: "run-1",
      },
    }),
  );

  assert.throws(() =>
    evolutionReceiptSchema.parse({
      ...validReceipt,
      sequence: 1,
      previousHash: null,
    }),
  );
});

test("Studio commands reject cross-application confirmation", () => {
  const mismatch = structuredClone(validStudioCommand);
  mismatch.command.contract.appId = "other-app";
  assert.throws(() => studioCommandEnvelopeSchema.parse(mismatch));
});

test("Studio snapshots enforce identity, counts, and journey references", () => {
  const wrongApplication = structuredClone(validStudioSnapshot);
  wrongApplication.application.manifestHash = HASH_B;
  assert.throws(() => studioSnapshotSchema.parse(wrongApplication));

  const wrongEventCount = structuredClone(validStudioSnapshot);
  wrongEventCount.evidence.events = 4;
  assert.throws(() => studioSnapshotSchema.parse(wrongEventCount));

  const missingCase = structuredClone(validStudioSnapshot);
  missingCase.workflows.variants[0]!.caseIds[1] = `case:${"4".repeat(64)}`;
  assert.throws(() => studioSnapshotSchema.parse(missingCase));

  const unknownJourneyNode = structuredClone(validStudioSnapshot);
  unknownJourneyNode.workflows.cases[0]!.journeyNodeIds[0] = "surface.missing";
  assert.throws(() => studioSnapshotSchema.parse(unknownJourneyNode));

  const wrongOpportunity = structuredClone(validStudioSnapshot);
  wrongOpportunity.opportunity.manifestHash = HASH_B;
  assert.throws(() => studioSnapshotSchema.parse(wrongOpportunity));

  const wrongEvidenceHash = structuredClone(validStudioSnapshot);
  wrongEvidenceHash.opportunity.evidence.bundle.sha256 = HASH_C;
  assert.throws(() => studioSnapshotSchema.parse(wrongEvidenceHash));
});

test("Studio snapshot Opportunity excludes raw event references and names", () => {
  const rawEventReference = structuredClone(validStudioSnapshot) as unknown as {
    opportunity: { evidence: Record<string, unknown> };
  };
  rawEventReference.opportunity.evidence.sampleEventIds = ["event-1"];
  assert.throws(() => studioSnapshotSchema.parse(rawEventReference));

  const rawEventSequence = structuredClone(validStudioSnapshot) as unknown as {
    opportunity: { signal: Record<string, unknown> };
  };
  rawEventSequence.opportunity.signal.sequence = ["record.opened", "record.opened"];
  assert.throws(() => studioSnapshotSchema.parse(rawEventSequence));
});
