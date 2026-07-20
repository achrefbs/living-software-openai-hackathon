import committedProofJson from "../../../../docs/proof/gpt56-live-codex-cli.json";

import type { StudioDataset } from "@/lib/studio-types";

export type RecordedGpt56TokenUsage = Readonly<{
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}>;

export type RecordedGpt56Run = Readonly<{
  recordedAt: string;
  sourceCommit: string;
  request: Readonly<{
    boundaryRequestedModel: "gpt-5.6";
    transportRequestedModel: "gpt-5.6-terra";
    reasoningEffort: "medium";
    boundaryRequestSha256: string;
    outputSchemaSha256: string;
  }>;
  evidence: Readonly<{
    appId: string;
    manifestHash: string;
    opportunityId: string;
    eventSetHash: string;
    eventCount: number;
    sessionCount: number;
    subjectCount: number;
    dataOrigin: "synthetic" | "observed" | "mixed";
  }>;
  localValidation: Readonly<{
    schema: "passed";
    references: "passed";
    governance: "passed";
  }>;
  draft: Readonly<{
    briefId: string;
    title: string;
    interpretation: string;
    proposedChange: Readonly<{
      kind: "workflow-assist" | "information-surface" | "automation-draft";
      summary: string;
      userValue: string;
      affectedProductNodeIds: readonly string[];
      excludedWork: readonly string[];
    }>;
    evidenceCitations: Readonly<{
      eventSetHash: string;
      metrics: readonly Readonly<{ name: string; observed: number }>[];
      sampleEventCount: number;
    }>;
    successCriteria: readonly Readonly<{
      metric: string;
      direction: "increase" | "decrease";
      target: string;
      measurementWindow: string;
    }>[];
    risks: readonly string[];
    openQuestions: readonly string[];
    limitations: readonly string[];
    evidenceScope: Readonly<{
      origin: "synthetic" | "observed" | "mixed";
      claimScope: "synthetic-only" | "mixed-evidence-only" | "observed-window-only";
      productionGeneralizationAllowed: false;
    }>;
    governance: Readonly<{
      status: "draft";
      humanApprovalRequired: true;
      activationAllowed: false;
    }>;
  }>;
  provenance: Readonly<{
    provider: "openai";
    transport: "codex-cli";
    codexThreadId: string;
    tokenUsage: RecordedGpt56TokenUsage;
    actualResponseModel: null;
  }>;
}>;

export type RecordedGpt56RunRelationField =
  | "appId"
  | "manifestHash"
  | "opportunityId"
  | "eventSetHash";

export type RecordedGpt56RunRelation =
  | Readonly<{ kind: "exact"; mismatches: readonly [] }>
  | Readonly<{
      kind: "separate";
      mismatches: readonly RecordedGpt56RunRelationField[];
    }>;

async function projectCommittedProof(): Promise<RecordedGpt56Run> {
  // Studio's test runner executes application sources through CommonJS while
  // the contracts package intentionally exposes ESM. Keep the schema boundary
  // as an actual package import without weakening either package's module mode.
  const { parseGpt56Proof } = await import("@living-software/contracts");
  const proof = parseGpt56Proof(committedProofJson);
  const { draft, provenance } = proof.result;

  if (
    proof.selectedProvider !== "codex" ||
    proof.request.boundaryRequestedModel !== "gpt-5.6" ||
    proof.request.transportRequestedModel !== "gpt-5.6-terra" ||
    proof.request.reasoningEffort !== "medium" ||
    provenance.provider !== "openai" ||
    provenance.transport !== "codex-cli" ||
    provenance.codexThreadId === null ||
    provenance.tokenUsage === null ||
    provenance.actualResponseModel !== null
  ) {
    throw new TypeError("Committed GPT-5.6 proof does not match its Codex CLI provenance");
  }

  return {
    recordedAt: proof.recordedAt,
    sourceCommit: proof.source.commit,
    request: {
      boundaryRequestedModel: proof.request.boundaryRequestedModel,
      transportRequestedModel: proof.request.transportRequestedModel,
      reasoningEffort: proof.request.reasoningEffort,
      boundaryRequestSha256: proof.request.boundaryRequestSha256,
      outputSchemaSha256: proof.request.outputSchemaSha256,
    },
    evidence: {
      appId: proof.evidence.appId,
      manifestHash: proof.evidence.manifestHash,
      opportunityId: proof.evidence.opportunityId,
      eventSetHash: proof.evidence.eventSetHash,
      eventCount: proof.evidence.eventCount,
      sessionCount: proof.evidence.sessionCount,
      subjectCount: proof.evidence.subjectCount,
      dataOrigin: proof.evidence.dataOrigin,
    },
    localValidation: { ...proof.localValidation },
    draft: {
      briefId: draft.briefId,
      title: draft.title,
      interpretation: draft.interpretation,
      proposedChange: {
        kind: draft.proposedChange.kind,
        summary: draft.proposedChange.summary,
        userValue: draft.proposedChange.userValue,
        affectedProductNodeIds: [...draft.proposedChange.affectedProductNodeIds],
        excludedWork: [...draft.proposedChange.excludedWork],
      },
      evidenceCitations: {
        eventSetHash: draft.evidenceCitations.eventSetHash,
        metrics: draft.evidenceCitations.metrics.map((metric) => ({ ...metric })),
        sampleEventCount: draft.evidenceCitations.sampleEventIds.length,
      },
      successCriteria: draft.successCriteria.map((criterion) => ({ ...criterion })),
      risks: [...draft.risks],
      openQuestions: [...draft.openQuestions],
      limitations: [...draft.limitations],
      evidenceScope: { ...draft.evidenceScope },
      governance: { ...draft.governance },
    },
    provenance: {
      provider: provenance.provider,
      transport: provenance.transport,
      codexThreadId: provenance.codexThreadId,
      tokenUsage: { ...provenance.tokenUsage },
      actualResponseModel: provenance.actualResponseModel,
    },
  };
}

/**
 * Returns a safe display projection of the committed proof. Every call creates
 * fresh arrays and objects so consumers cannot mutate the imported artifact.
 * Raw event IDs and evidence-alias mappings intentionally stay outside Studio.
 */
export function getCommittedGpt56Run(): Promise<RecordedGpt56Run> {
  return projectCommittedProof();
}

/**
 * A model run can be labeled related only when all four evidence identities
 * match. Missing identity is a separation boundary, not a wildcard. Relation
 * itself grants no lifecycle authority.
 */
export function relateGpt56RunToDataset(
  run: RecordedGpt56Run,
  dataset: StudioDataset,
): RecordedGpt56RunRelation {
  const mismatches: RecordedGpt56RunRelationField[] = [];
  const identity = dataset.evidenceIdentity;

  if (
    run.evidence.appId !== dataset.app.id ||
    run.evidence.appId !== identity.appId
  ) {
    mismatches.push("appId");
  }
  if (
    identity.manifestHash === null ||
    run.evidence.manifestHash !== identity.manifestHash
  ) {
    mismatches.push("manifestHash");
  }
  if (
    identity.opportunityId === null ||
    run.evidence.opportunityId !== identity.opportunityId
  ) {
    mismatches.push("opportunityId");
  }
  if (
    identity.eventSetHash === null ||
    run.evidence.eventSetHash !== identity.eventSetHash
  ) {
    mismatches.push("eventSetHash");
  }

  return mismatches.length === 0
    ? { kind: "exact", mismatches: [] }
    : { kind: "separate", mismatches };
}

export function recordedRunLinkageNote(
  relation: RecordedGpt56RunRelation,
): string {
  if (relation.kind === "exact") {
    return "The recorded neutral model draft matches this snapshot's evidence identity. Relation is display-only: it does not populate lifecycle state, create receipts, or unlock controls.";
  }
  return "The recorded neutral model run is independent from this snapshot because at least one evidence identity differs. It does not populate lifecycle state, create receipts, or unlock controls.";
}
