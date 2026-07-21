import type {
  Gpt56EvolutionBrief,
  Opportunity,
  ProductManifest,
  WorkflowEvent,
} from "@living-software/contracts";

export type BoundedProductNode = Readonly<{
  id: string;
  kind: ProductManifest["nodes"][number]["kind"];
  displayName: string;
}>;

export type NormalizedEvidenceEvent = Readonly<{
  ordinal: number;
  citationAlias: string;
  caseAlias: string;
  caseStep: number;
  name: string;
  kind: WorkflowEvent["kind"];
  status: WorkflowEvent["status"];
  environment: WorkflowEvent["environment"];
  sequence: number;
  productNodeId: string | null;
  surfaceId: string | null;
  durationMs: number | null;
  interaction: "click" | "change" | "submit" | null;
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
  /**
   * Evidence-linked product nodes plus their included one-edge manifest
   * neighbors. Model-authored affected node references are restricted to this
   * set; lexically selected fill nodes are context only.
   */
  relevantProductNodeIds: readonly string[];
  sampleEvidenceAliases: readonly string[];
  evidenceScope: Readonly<{
    origin: Opportunity["evidence"]["dataOrigin"];
    claimScope: "synthetic-only" | "mixed-evidence-only" | "observed-window-only";
    productionGeneralizationAllowed: false;
  }>;
}>;

export type EvolutionBrief = Gpt56EvolutionBrief;

export type DraftEvolutionBriefInput = Readonly<{
  opportunity: Opportunity;
  manifest: ProductManifest;
  evidenceEvents: readonly WorkflowEvent[];
}>;

export type SourceCandidate = Readonly<{
  /** Normalized repository-relative path supplied by the local orchestrator. */
  path: string;
  /** SHA-256 of the exact UTF-8 source bytes in `content`. */
  preimageHash: string;
  /** Untrusted, bounded source text. The model receives no filesystem access. */
  content: string;
}>;

export type SourcePatchEdit = Readonly<{
  /** Exact text that must occur once in the selected preimage. */
  anchor: string;
  /** Replacement text. Empty text is an explicit deletion proposal. */
  replacement: string;
}>;

export type SourcePatchProposal = Readonly<{
  schemaVersion: "living.source-patch-proposal/v1";
  proposalId: string;
  appId: string;
  opportunityId: string;
  manifestHash: string;
  briefId: string;
  target: Readonly<{
    path: string;
    preimageHash: string;
  }>;
  summary: string;
  rationale: string;
  edits: readonly SourcePatchEdit[];
  governance: Readonly<{
    status: "draft";
    humanApprovalRequired: true;
    applicationAllowed: false;
  }>;
}>;

export type DraftSourcePatchInput = Readonly<{
  brief: EvolutionBrief;
  candidates: readonly SourceCandidate[];
}>;

export type IntelligenceSchemaName =
  | "living_evolution_brief"
  | "living_source_patch";

/**
 * A closed, content-free projection of an intelligence transport lifecycle.
 * Model prompts, output text, JSONL item content, stderr, and stdout are never
 * valid lifecycle fields.
 */
export type IntelligenceLifecycleEvent =
  | Readonly<{
      type: "request.dispatched";
      schemaName: IntelligenceSchemaName;
      transport: IntelligenceTransportKind;
    }>
  | Readonly<{
      type: "thread.started";
      schemaName: IntelligenceSchemaName;
      transport: "codex-cli";
      threadId: string;
    }>
  | Readonly<{
      type: "turn.started";
      schemaName: IntelligenceSchemaName;
      transport: "codex-cli";
      threadId: string;
    }>
  | Readonly<{
      type: "turn.completed";
      schemaName: IntelligenceSchemaName;
      transport: "codex-cli";
      threadId: string;
      tokenUsage: IntelligenceTokenUsage;
    }>;

/** Reporter failures are deliberately ignored by every transport. */
export type IntelligenceLifecycleReporter = (
  event: IntelligenceLifecycleEvent,
) => void;

export type IntelligenceSendOptions = Readonly<{
  signal?: AbortSignal;
  lifecycleReporter?: IntelligenceLifecycleReporter;
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
      name: IntelligenceSchemaName;
      strict: true;
      schema: Readonly<Record<string, unknown>>;
    }>;
  }>;
}>;

export type TransportResponse = Readonly<{
  status: number;
  body: unknown;
}>;

export type IntelligenceTransportKind = "responses-api" | "codex-cli";
export type Gpt56TransportModel = "gpt-5.6" | "gpt-5.6-terra";

export type IntelligenceTokenUsage = Readonly<{
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}>;

export interface IntelligenceTransport {
  readonly kind?: IntelligenceTransportKind;
  send(
    request: ResponsesRequest,
    options?: IntelligenceSendOptions,
  ): Promise<TransportResponse>;
}

export type IntelligenceProvenance = Readonly<{
  provider: "openai";
  transport: IntelligenceTransportKind;
  boundaryRequestedModel: "gpt-5.6";
  transportRequestedModel: Gpt56TransportModel;
  actualResponseModel: string | null;
  responseId: string | null;
  codexThreadId: string | null;
  responseStoreRequested: false | null;
  localSessionPersisted: false | null;
  tokenUsage: IntelligenceTokenUsage | null;
  evidenceAliases: readonly Readonly<{ alias: string; eventId: string }>[];
}>;

export type DraftEvolutionBriefResult = Readonly<{
  draft: EvolutionBrief;
  provenance: IntelligenceProvenance;
}>;

export type SourcePatchProvenance = Readonly<
  Omit<IntelligenceProvenance, "evidenceAliases"> & {
    sourceCandidates: readonly Readonly<{
      path: string;
      preimageHash: string;
    }>[];
  }
>;

export type DraftSourcePatchResult = Readonly<{
  proposal: SourcePatchProposal;
  provenance: SourcePatchProvenance;
}>;

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "text">>;
