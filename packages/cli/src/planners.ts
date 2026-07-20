import {
  hostInterfaceDescriptorSchema,
  parseLivingConfig,
  parseProductManifest,
  type HostInterfaceDescriptor,
  type JsonValue,
  type LivingConfig,
  type ProductManifest,
} from "@living-software/contracts";

import { canonicalJson, sha256 } from "./canonical.js";
import { parseNextJsHostFixture } from "./fixture.js";
import {
  CLI_PLAN_SCHEMA_VERSION,
  type CliPlan,
  type Diagnostic,
  type DoctorInputs,
  type NextJsHostFixture,
  type PlannedChange,
} from "./types.js";

const CONFIG_PATH = ".living/config.json";
const MANIFEST_PATH = ".living/product-manifest.json";
const HOST_INTERFACE_PATH = ".living/host-interface.json";
const SDK_PACKAGE = "@living-software/host-sdk";
const SDK_VERSION = "0.1.0";

function source(
  fixture: NextJsHostFixture,
  input: { sourcePath: string; line?: number; symbol?: string },
): ProductManifest["nodes"][number]["provenance"]["sources"][number] {
  return {
    path: input.sourcePath,
    revision: fixture.release.revision,
    ...(input.line === undefined ? {} : { line: input.line }),
    ...(input.symbol === undefined ? {} : { symbol: input.symbol }),
  };
}

function buildHostInterface(fixture: NextJsHostFixture): HostInterfaceDescriptor | undefined {
  const extensionPoints = [...(fixture.extensionPoints ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const operations = [...(fixture.operations ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  if (extensionPoints.length === 0 && operations.length === 0) return undefined;

  const content = {
    schemaVersion: "living.host-interface/v1" as const,
    appId: fixture.application.id,
    version: fixture.release.version ?? fixture.release.revision,
    extensionPoints,
    operations,
  };
  return hostInterfaceDescriptorSchema.parse({
    ...content,
    contentHash: sha256(content),
  });
}

export function buildLivingConfig(fixtureCandidate: unknown): LivingConfig {
  const fixture = parseNextJsHostFixture(fixtureCandidate);
  const sortedEvents = [...fixture.events].sort((a, b) => a.name.localeCompare(b.name));
  const eventEntries = sortedEvents.map((event) => [
    event.name,
    {
      kind: event.kind,
      ...(event.subjectType === undefined ? {} : { subjectType: event.subjectType }),
      metadataSchema: event.metadataSchema ?? { type: "object", additionalProperties: false },
    },
  ] as const);

  return parseLivingConfig({
    schemaVersion: "living.config/v1",
    application: fixture.application,
    adapters: [
      {
        id: "nextjs",
        version: fixture.framework.adapterVersion,
        options: { frameworkVersion: fixture.framework.version },
      },
    ],
    collector: {
      endpoint: fixture.collectorEndpoint ?? "http://127.0.0.1:4318/v1/events",
    },
    manifest: {
      root: ".",
      include: ["app/**/*", "src/app/**/*"],
      exclude: [".next/**/*", "node_modules/**/*"],
    },
    semantics: {
      events: Object.fromEntries(eventEntries),
    },
    privacy: {
      metadataPolicy: "deny-by-default",
      identifierMode: fixture.identifierMode ?? "anonymous",
      ...(fixture.pseudonymSaltEnv === undefined
        ? {}
        : { pseudonymSaltEnv: fixture.pseudonymSaltEnv }),
      retentionDays: fixture.retentionDays ?? 14,
    },
    ...((fixture.extensionPoints?.length ?? 0) > 0 || (fixture.operations?.length ?? 0) > 0
      ? {
          broker: {
            descriptorPath: HOST_INTERFACE_PATH,
            invocationPath: "/api/living/broker",
          },
        }
      : {}),
  });
}

export function buildProductManifest(fixtureCandidate: unknown): ProductManifest {
  const fixture = parseNextJsHostFixture(fixtureCandidate);
  const nodes = [...fixture.nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => ({
      id: node.id,
      kind: node.kind,
      displayName: node.displayName,
      provenance: {
        origin: "declared" as const,
        confidence: 1,
        sources: [source(fixture, node)],
      },
      ...(node.attributes === undefined ? {} : { attributes: node.attributes }),
    }));
  const edges = [...fixture.edges]
    .sort((a, b) =>
      `${a.from}\u0000${a.relation}\u0000${a.to}`.localeCompare(
        `${b.from}\u0000${b.relation}\u0000${b.to}`,
      ),
    )
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      relation: edge.relation,
      provenance: {
        origin: "declared" as const,
        confidence: 1,
        sources: [source(fixture, edge)],
      },
    }));
  const hostInterface = buildHostInterface(fixture);
  const content = {
    schemaVersion: "living.product-manifest/v1" as const,
    appId: fixture.application.id,
    release: fixture.release,
    generatedAt: fixture.generatedAt,
    generators: [
      {
        adapterId: "nextjs",
        adapterVersion: fixture.framework.adapterVersion,
      },
    ],
    nodes,
    edges,
    ...(hostInterface === undefined ? {} : { hostInterface }),
  };

  return parseProductManifest({
    ...content,
    contentHash: sha256(content),
  });
}

function target(fixture: NextJsHostFixture): CliPlan["target"] {
  return {
    appId: fixture.application.id,
    framework: "nextjs",
    releaseRevision: fixture.release.revision,
  };
}

function fileChange(
  action: "create" | "replace",
  path: string,
  value: unknown,
  reason: string,
): PlannedChange {
  const content = canonicalJson(value, true);
  return {
    action,
    path,
    reason,
    content,
    contentHash: sha256(content),
  };
}

function diagnosticsFor(fixture: NextJsHostFixture): Diagnostic[] {
  const diagnostics: Diagnostic[] = [
    {
      code: "SUPPORTED_FRAMEWORK",
      severity: "info",
      message: `Next.js ${fixture.framework.version} is represented by adapter ${fixture.framework.adapterVersion}.`,
    },
    {
      code: "PLAN_ONLY",
      severity: "info",
      message: "This CLI slice produces deterministic plans and does not write to the host repository.",
    },
  ];

  if (fixture.nodes.length === 0) {
    diagnostics.push({
      code: "EMPTY_PRODUCT_MAP",
      severity: "warning",
      message: "The fixture declares no product nodes.",
    });
  }
  if (fixture.events.length === 0) {
    diagnostics.push({
      code: "NO_SEMANTIC_EVENTS",
      severity: "warning",
      message: "The fixture declares no semantic events; workflow understanding will be limited.",
    });
  }
  if ((fixture.operations ?? []).some((operation) => operation.effect === "irreversible")) {
    diagnostics.push({
      code: "IRREVERSIBLE_OPERATION_DECLARED",
      severity: "warning",
      message: "The host declares an irreversible operation; later policy review must default-deny it.",
    });
  }

  return diagnostics.sort((a, b) => a.code.localeCompare(b.code));
}

export function planInit(fixtureCandidate: unknown): CliPlan {
  const fixture = parseNextJsHostFixture(fixtureCandidate);
  const config = buildLivingConfig(fixture);
  const manifest = buildProductManifest(fixture);
  const hostInterface = manifest.hostInterface;
  const changes: PlannedChange[] = [
    {
      action: "set-package-dependency",
      path: "package.json",
      packageName: SDK_PACKAGE,
      packageVersion: SDK_VERSION,
      reason: "Install the public host event SDK.",
    },
    fileChange("create", CONFIG_PATH, config, "Create explicit host integration configuration."),
    fileChange("create", MANIFEST_PATH, manifest, "Create the initial declared product map."),
  ];
  if (hostInterface !== undefined) {
    changes.push(
      fileChange("create", HOST_INTERFACE_PATH, hostInterface, "Declare bounded host operations and extension points."),
    );
  }

  return {
    schemaVersion: CLI_PLAN_SCHEMA_VERSION,
    command: "init",
    mode: "dry-run",
    target: target(fixture),
    changes,
    diagnostics: diagnosticsFor(fixture),
    config,
    manifest,
    ...(hostInterface === undefined ? {} : { hostInterface }),
  };
}

export function planMap(fixtureCandidate: unknown): CliPlan {
  const fixture = parseNextJsHostFixture(fixtureCandidate);
  const manifest = buildProductManifest(fixture);
  return {
    schemaVersion: CLI_PLAN_SCHEMA_VERSION,
    command: "map",
    mode: "dry-run",
    target: target(fixture),
    changes: [fileChange("replace", MANIFEST_PATH, manifest, "Refresh the declared product map.")],
    diagnostics: diagnosticsFor(fixture),
    manifest,
    ...(manifest.hostInterface === undefined ? {} : { hostInterface: manifest.hostInterface }),
  };
}

export function planDoctor(fixtureCandidate: unknown, inputs: DoctorInputs = {}): CliPlan {
  const fixture = parseNextJsHostFixture(fixtureCandidate);
  const diagnostics = diagnosticsFor(fixture);
  let config: LivingConfig | undefined;
  let manifest: ProductManifest | undefined;

  try {
    config = inputs.config === undefined ? buildLivingConfig(fixture) : parseLivingConfig(inputs.config);
    diagnostics.push({
      code: "CONFIG_VALID",
      severity: "info",
      message: "The Living configuration satisfies the public v1 contract.",
    });
  } catch (error) {
    diagnostics.push({
      code: "CONFIG_INVALID",
      severity: "error",
      message: error instanceof Error ? error.message : "Configuration validation failed.",
    });
  }

  try {
    manifest = inputs.manifest === undefined
      ? buildProductManifest(fixture)
      : parseProductManifest(inputs.manifest);
    diagnostics.push({
      code: "MANIFEST_VALID",
      severity: "info",
      message: "The product manifest satisfies the public v1 contract.",
    });
  } catch (error) {
    diagnostics.push({
      code: "MANIFEST_INVALID",
      severity: "error",
      message: error instanceof Error ? error.message : "Manifest validation failed.",
    });
  }

  return {
    schemaVersion: CLI_PLAN_SCHEMA_VERSION,
    command: "doctor",
    mode: "dry-run",
    target: target(fixture),
    changes: [],
    diagnostics: diagnostics.sort((a, b) => a.code.localeCompare(b.code)),
    ...(config === undefined ? {} : { config }),
    ...(manifest === undefined ? {} : { manifest }),
    ...(manifest?.hostInterface === undefined ? {} : { hostInterface: manifest.hostInterface }),
  };
}

export function planUninstall(fixtureCandidate: unknown): CliPlan {
  const fixture = parseNextJsHostFixture(fixtureCandidate);
  const paths = [CONFIG_PATH, HOST_INTERFACE_PATH, MANIFEST_PATH].sort();
  return {
    schemaVersion: CLI_PLAN_SCHEMA_VERSION,
    command: "uninstall",
    mode: "dry-run",
    target: target(fixture),
    changes: [
      ...paths.map((path): PlannedChange => ({
        action: "remove",
        path,
        reason: "Remove a generated Living integration artifact if present.",
      })),
      {
        action: "remove-package-dependency",
        path: "package.json",
        packageName: SDK_PACKAGE,
        reason: "Remove the public host event SDK dependency if present.",
      },
    ],
    diagnostics: diagnosticsFor(fixture),
  };
}

export function planCommand(
  command: CliPlan["command"],
  fixture: unknown,
  doctorInputs: DoctorInputs = {},
): CliPlan {
  switch (command) {
    case "init":
      return planInit(fixture);
    case "map":
      return planMap(fixture);
    case "doctor":
      return planDoctor(fixture, doctorInputs);
    case "uninstall":
      return planUninstall(fixture);
  }
}

export function summarizePlan(plan: CliPlan): Record<string, JsonValue> {
  return {
    command: plan.command,
    mode: plan.mode,
    appId: plan.target.appId,
    changeCount: plan.changes.length,
    diagnostics: plan.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
    })),
  };
}
