import type { Opportunity, ProductManifest, WorkflowEvent } from "@living-software/contracts";

export type BoundedProductNode = Readonly<{
  id: string;
  kind: ProductManifest["nodes"][number]["kind"];
}>;

export type NormalizedEvidenceEvent = Readonly<{
  ordinal: number;
  citationAlias: string;
  name: string;
  kind: WorkflowEvent["kind"];
  status: WorkflowEvent["status"];
  environment: WorkflowEvent["environment"];
  sequence: number;
  productNodeId: string | null;
  surfaceId: string | null;
  durationMs: number | null;
  source: WorkflowEvent["provenance"]["source"];
  synthetic: boolean;
}>;

export type BoundedProductContext = Readonly<{
  schemaVersion: "living.intelligence-context/v1";
  appId: string;
  manifestHash: string;
  totals: Readonly<{
    nodes: number;
    edges: number;
    operations: number;
    extensionPoints: number;
    evidenceEvents: number;
  }>;
  included: Readonly<{
    nodes: readonly BoundedProductNode[];
    edges: readonly Readonly<{ from: string; to: string; relation: string }>[];
    operations: readonly Readonly<{
      id: string;
      effect: string;
      requiresUserConfirmation: boolean;
    }>[];
    extensionPoints: readonly Readonly<{
      id: string;
      surfaceNodeId: string;
      presentation: string;
    }>[];
    evidenceEvents: readonly NormalizedEvidenceEvent[];
  }>;
  truncated: boolean;
  sampleEvidenceAliases: readonly string[];
  evidenceScope: Readonly<{
    origin: Opportunity["evidence"]["dataOrigin"];
    claimScope: "synthetic-only" | "mixed-evidence-only" | "observed-window-only";
    productionGeneralizationAllowed: false;
  }>;
}>;

export type EvolutionBrief = Readonly<{
  schemaVersion: "living.evolution-brief/v1";
  briefId: string;
  appId: string;
  opportunityId: string;
  manifestHash: string;
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
    sampleEventIds: readonly string[];
    metrics: readonly Readonly<{ name: string; observed: number }>[];
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
    origin: "observed" | "synthetic" | "mixed";
    claimScope: "synthetic-only" | "mixed-evidence-only" | "observed-window-only";
    productionGeneralizationAllowed: false;
  }>;
  governance: Readonly<{
    status: "draft";
    humanApprovalRequired: true;
    activationAllowed: false;
  }>;
}>;

export type DraftEvolutionBriefInput = Readonly<{
  opportunity: Opportunity;
  manifest: ProductManifest;
  evidenceEvents: readonly WorkflowEvent[];
}>;

export type ResponsesRequest = Readonly<{
  model: "gpt-5.6";
  store: false;
  reasoning: Readonly<{ effort: "medium" }>;
  max_output_tokens: number;
  input: readonly Readonly<{
    role: "developer" | "user";
    content: string;
  }>[];
  text: Readonly<{
    format: Readonly<{
      type: "json_schema";
      name: "living_evolution_brief";
      strict: true;
      schema: Readonly<Record<string, unknown>>;
    }>;
  }>;
}>;

export type TransportResponse = Readonly<{
  status: number;
  body: unknown;
}>;

export interface IntelligenceTransport {
  send(request: ResponsesRequest, options?: Readonly<{ signal?: AbortSignal }>): Promise<TransportResponse>;
}

export type IntelligenceProvenance = Readonly<{
  provider: "openai";
  requestedModel: "gpt-5.6";
  actualResponseModel: string | null;
  responseId: string;
  stored: false;
  evidenceAliases: readonly Readonly<{ alias: string; eventId: string }>[];
}>;

export type DraftEvolutionBriefResult = Readonly<{
  draft: EvolutionBrief;
  provenance: IntelligenceProvenance;
}>;

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "text">>;
