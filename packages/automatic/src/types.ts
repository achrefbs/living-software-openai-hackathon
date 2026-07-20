import type {
  DiscoveryResult,
  LivingConfig,
  MetricCatalog,
  ObservationRuntimeMap,
  ProductManifest,
} from "@living-software/contracts";

export interface AutomaticRuntimeLimits {
  readonly maxBatchSize: number;
  readonly maxQueueSize: number;
  readonly maxEventBytes: number;
  readonly maxPayloadBytes: number;
  readonly maxEventsPerMinute: number;
  readonly flushIntervalMs: number;
  readonly requestTimeoutMs: number;
}

export interface AutomaticSignalOptions {
  readonly deadClickDelayMs: number;
  readonly rageClickWindowMs: number;
  readonly rageClickCount: number;
  readonly correctionWindowMs: number;
}

export interface AutomaticInstallOptions {
  /** Required so observed and simulator-generated sessions cannot be confused. */
  readonly synthetic: boolean;
  readonly environment?: "development" | "preview" | "production";
  readonly limits?: Partial<AutomaticRuntimeLimits>;
  readonly signals?: Partial<AutomaticSignalOptions>;
}

export interface AutomaticInstallArtifact {
  readonly path: string;
  readonly content: string;
}

export interface AutomaticDiagnostic {
  readonly severity: "info" | "warning";
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
  readonly token?: string;
}

export interface AutomaticInstallBundle {
  readonly schemaVersion: "living.automatic-install-bundle/v1";
  readonly config: LivingConfig;
  readonly manifest: ProductManifest;
  readonly observationRuntimeMap: ObservationRuntimeMap;
  readonly metricCatalog: MetricCatalog;
  readonly artifacts: readonly AutomaticInstallArtifact[];
  readonly diagnostics: readonly AutomaticDiagnostic[];
}

export type AutomaticDiscoveryInput = DiscoveryResult;

export class AutomaticBundleError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AutomaticBundleError";
  }
}
