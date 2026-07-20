import type {
  HostInterfaceDescriptor,
  JsonValue,
  LivingConfig,
  ProductManifest,
} from "@living-software/contracts";

export const NEXT_HOST_FIXTURE_SCHEMA_VERSION = "living.next-host-fixture/v1" as const;
export const CLI_PLAN_SCHEMA_VERSION = "living.cli-plan/v1" as const;

export type ProductNodeKind = ProductManifest["nodes"][number]["kind"];
export type ProductEdgeRelation = ProductManifest["edges"][number]["relation"];
export type EventKind = LivingConfig["semantics"]["events"][string]["kind"];
export type HostOperation = HostInterfaceDescriptor["operations"][number];
export type HostExtensionPoint = HostInterfaceDescriptor["extensionPoints"][number];

export interface FixtureNode {
  readonly id: string;
  readonly kind: ProductNodeKind;
  readonly displayName: string;
  readonly sourcePath: string;
  readonly line?: number;
  readonly symbol?: string;
  readonly attributes?: Record<string, JsonValue>;
}

export interface FixtureEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: ProductEdgeRelation;
  readonly sourcePath: string;
  readonly line?: number;
  readonly symbol?: string;
}

export interface FixtureEventDeclaration {
  readonly name: string;
  readonly kind: EventKind;
  readonly subjectType?: string;
  readonly metadataSchema?: Record<string, JsonValue>;
}

/**
 * A neutral, explicit input contract for this first slice. The CLI does not
 * inspect or mutate a repository; later framework adapters may create it.
 */
export interface NextJsHostFixture {
  readonly schemaVersion: typeof NEXT_HOST_FIXTURE_SCHEMA_VERSION;
  readonly application: {
    readonly id: string;
    readonly displayName: string;
  };
  readonly framework: {
    readonly name: "nextjs";
    readonly version: string;
    readonly adapterVersion: string;
  };
  readonly release: {
    readonly revision: string;
    readonly version?: string;
  };
  readonly generatedAt: string;
  readonly collectorEndpoint?: string;
  readonly identifierMode?: "anonymous" | "pseudonymous";
  readonly pseudonymSaltEnv?: string;
  readonly retentionDays?: number;
  readonly nodes: readonly FixtureNode[];
  readonly edges: readonly FixtureEdge[];
  readonly events: readonly FixtureEventDeclaration[];
  readonly extensionPoints?: readonly HostExtensionPoint[];
  readonly operations?: readonly HostOperation[];
}

export type CliCommand = "init" | "map" | "doctor" | "uninstall";
export type AutomaticCliCommand = CliCommand | "analyze" | "snapshot";

export interface PlannedChange {
  readonly action: "create" | "replace" | "remove" | "set-package-dependency" | "remove-package-dependency";
  readonly path: string;
  readonly reason: string;
  readonly content?: string;
  readonly contentHash?: string;
  readonly packageName?: string;
  readonly packageVersion?: string;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
}

export interface CliPlan {
  readonly schemaVersion: typeof CLI_PLAN_SCHEMA_VERSION;
  readonly command: CliCommand;
  readonly mode: "dry-run";
  readonly target: {
    readonly appId: string;
    readonly framework: "nextjs";
    readonly releaseRevision: string;
  };
  readonly changes: readonly PlannedChange[];
  readonly diagnostics: readonly Diagnostic[];
  readonly config?: LivingConfig;
  readonly manifest?: ProductManifest;
  readonly hostInterface?: HostInterfaceDescriptor;
}

export interface DoctorInputs {
  readonly config?: unknown;
  readonly manifest?: unknown;
}
