import type {
  LivingConfig,
  ProductManifest,
} from "@living-software/contracts";

export interface RuntimeLocator {
  readonly token: string;
  readonly nodeId: string;
  readonly strategy: "data-living-id" | "data-testid" | "route";
  readonly selector: string;
  readonly normalizedValue: string;
  readonly dynamic: boolean;
  readonly match:
    | { readonly kind: "exact"; readonly value: string }
    | { readonly kind: "prefix"; readonly value: string }
    | { readonly kind: "suffix"; readonly value: string }
    | { readonly kind: "route-template"; readonly value: string }
    | {
        readonly kind: "prefix-suffix";
        readonly prefix: string;
        readonly suffix: string;
      }
    | { readonly kind: "presence" };
  readonly eventBindings: readonly string[];
  readonly captures: readonly (
    | "view"
    | "activate"
    | "change"
    | "submit"
    | "geometry"
  )[];
  readonly source: {
    readonly path: string;
    readonly revision: string;
    readonly line?: number | undefined;
    readonly symbol?: string | undefined;
  };
}

export interface MetricDefinition {
  readonly id: string;
  readonly eventName: string;
  readonly kind: "workflow" | "outcome" | "reliability" | "layout";
  readonly targetNodeId: string;
  readonly trigger: string;
  readonly fields: readonly string[];
  readonly provenance: "scanned" | "inferred";
}

export interface DiscoveryDiagnostic {
  readonly severity: "info" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface DiscoveryResult {
  readonly schemaVersion: "living.discovery-result/v1";
  readonly support: {
    readonly framework: "next-app-router";
    readonly detectedVersion: string;
    readonly supportedRange: ">=15.3.0";
  };
  readonly sourceDigest: string;
  readonly manifest: ProductManifest;
  readonly config: LivingConfig;
  readonly runtimeLocatorMap: {
    readonly schemaVersion: "living.runtime-locator-map/v1";
    readonly locators: readonly RuntimeLocator[];
  };
  readonly metricCatalog: {
    readonly schemaVersion: "living.metric-catalog/v1";
    readonly metrics: readonly MetricDefinition[];
  };
  readonly diagnostics: readonly DiscoveryDiagnostic[];
  readonly stats: {
    readonly scannedFiles: number;
    readonly scannedBytes: number;
    readonly skippedFiles: number;
  };
}

export interface DiscoveryLimits {
  readonly maxFiles: number;
  readonly maxTotalBytes: number;
  readonly maxFileBytes: number;
}

export interface DiscoverNextAppOptions {
  readonly repositoryRoot: string;
  readonly appId?: string;
  readonly displayName?: string;
  readonly collectorEndpoint?: string;
  readonly previous?: DiscoveryResult;
  readonly clock?: () => Date;
  readonly limits?: Partial<DiscoveryLimits>;
}

export class DiscoveryError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DiscoveryError";
  }
}
