import type {
  EvidenceBatchRecord,
  MetricReport,
  Opportunity,
  Sha256,
  WorkflowEvent,
  WorkflowEventBatch,
  WorkflowEventKind,
} from "@living-software/contracts";
import type { WorkflowCase, WorkflowVariant } from "@living-software/core";

export interface CollectorEventBinding {
  readonly eventName: string;
  readonly kind: WorkflowEventKind;
  readonly nodeId: string;
  readonly surfaceId?: string;
}

export interface CollectorObservationRuntimeMap {
  readonly schemaVersion: "living.observation-runtime/v1";
  readonly application: CollectorDefinition["application"];
  readonly collector: { readonly endpoint: "/api/living/events" };
  readonly targets: readonly {
    readonly events: {
      readonly click?: CollectorEventBinding;
      readonly change?: CollectorEventBinding;
      readonly submit?: CollectorEventBinding;
      readonly deadClick?: CollectorEventBinding;
      readonly rageClick?: CollectorEventBinding;
      readonly correction?: CollectorEventBinding;
    };
  }[];
  readonly routes: readonly {
    readonly start: CollectorEventBinding;
    readonly complete: CollectorEventBinding;
  }[];
  readonly systemEvents: {
    readonly sessionEnd: CollectorEventBinding;
    readonly runtimeError: CollectorEventBinding;
    readonly lcp: CollectorEventBinding;
    readonly inp: CollectorEventBinding;
    readonly cls: CollectorEventBinding;
  };
  readonly limits: {
    readonly maxBatchSize: number;
    readonly maxPayloadBytes: number;
    readonly maxEventsPerMinute: number;
  };
}

export interface CollectorDefinition {
  readonly schemaVersion: "living.collector-definition/v1";
  readonly application: {
    readonly appId: string;
    readonly environment: "development" | "preview" | "production";
    readonly releaseRevision: string;
    readonly manifestHash: Sha256;
    readonly synthetic: boolean;
  };
  readonly eventBindings: readonly CollectorEventBinding[];
  readonly limits?: {
    readonly maxPayloadBytes?: number;
    readonly maxEventsPerBatch?: number;
    readonly maxRequestsPerMinute?: number;
    readonly maxEventsPerMinute?: number;
  };
}

export interface ResolvedCollectorLimits {
  readonly maxPayloadBytes: number;
  readonly maxEventsPerBatch: number;
  readonly maxRequestsPerMinute: number;
  readonly maxEventsPerMinute: number;
}

export interface AppendEvidenceResult {
  readonly accepted: number;
  readonly duplicate: boolean;
  readonly record: EvidenceBatchRecord;
}

export interface EvidenceAnalysis {
  readonly records: readonly EvidenceBatchRecord[];
  readonly events: readonly WorkflowEvent[];
  readonly workflowCases: readonly WorkflowCase[];
  readonly workflowVariants: readonly WorkflowVariant[];
  readonly metricReport: MetricReport;
  readonly opportunity: Opportunity | null;
  readonly chainHead: Sha256;
}

export interface EvidenceStoreOptions {
  readonly rootPath: string;
  readonly definition: CollectorDefinition;
}

export interface CollectorOptions extends EvidenceStoreOptions {
  readonly clock?: () => Date;
}

export interface EvidenceCollector {
  readonly evidencePath: string;
  handle(request: Request): Promise<Response>;
  readVerified(): Promise<readonly EvidenceBatchRecord[]>;
  analyze(): Promise<EvidenceAnalysis>;
}

export interface GeneratedCollectorFile {
  readonly relativePath:
    | "src/app/api/living/events/route.ts"
    | "src/living-collector.generated.ts";
  readonly content: string;
}

export interface GeneratedNextCollectorFiles {
  readonly route: GeneratedCollectorFile;
  readonly serverModule: GeneratedCollectorFile;
}

export interface ValidatedBatchContext {
  readonly batch: WorkflowEventBatch;
  readonly sessionId: string;
}
