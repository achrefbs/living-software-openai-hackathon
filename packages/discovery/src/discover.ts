import { createHash } from "node:crypto";
import path from "node:path";

import {
  parseLivingConfig,
  parseProductManifest,
  type LivingConfig,
  type ProductManifest,
} from "@living-software/contracts";

import {
  analyzeSource,
  type LocatorElement,
  type SourceAnalysis,
} from "./ast.js";
import {
  DEFAULT_LIMITS,
  securelyReadSourceTree,
  type ScannedFile,
} from "./security.js";
import {
  DiscoveryError,
  type DiscoverNextAppOptions,
  type DiscoveryDiagnostic,
  type DiscoveryLimits,
  type DiscoveryResult,
  type MetricDefinition,
  type RuntimeLocator,
} from "./types.js";

const ADAPTER_ID = "next-app-router-discovery";
const ADAPTER_VERSION = "0.1.0";
const CODE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"];

type ProductNode = ProductManifest["nodes"][number];
type ProductEdge = ProductManifest["edges"][number];
type SourceReference = ProductNode["provenance"]["sources"][number];

interface RouteFile {
  readonly analysis: SourceAnalysis;
  readonly file: ScannedFile;
  readonly route: string;
  readonly kind: "page" | "layout" | "endpoint";
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function stableNodeId(kind: ProductNode["kind"], semanticKey: string): string {
  const readable = semanticKey
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 120 - kind.length);
  return `${kind}:${readable || "node"}:${shortHash(semanticKey)}`;
}

function metricId(target: string, eventName: string): string {
  return `metric:${shortHash(`${target}\0${eventName}`)}`;
}

function normalizeAppId(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/^@/u, "")
    .replace(/[^a-z0-9._:/-]+/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^[-./:]|[-./:]$/gu, "")
    .slice(0, 160);
  return normalized || "discovered-next-app";
}

function parseNextVersion(range: string): string {
  const match = range.match(/(?:^|[^0-9])(\d+)\.(\d+)(?:\.(\d+))?/u);
  if (match === null) {
    throw new DiscoveryError(
      "next-version-unreadable",
      `Could not determine a concrete Next.js version from ${JSON.stringify(range)}`,
    );
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3] ?? "0");
  if (major < 15 || (major === 15 && minor < 3)) {
    throw new DiscoveryError(
      "unsupported-next-version",
      `Next.js ${major}.${minor}.${patch} is unsupported; discovery requires 15.3.0 or newer`,
    );
  }
  return `${major}.${minor}.${patch}`;
}

function parsePackage(file: ScannedFile): {
  name: string;
  version?: string;
  nextVersion: string;
} {
  let input: unknown;
  try {
    input = JSON.parse(file.text) as unknown;
  } catch {
    throw new DiscoveryError("invalid-package-json", "package.json is not valid JSON");
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new DiscoveryError("invalid-package-json", "package.json must be an object");
  }
  const record = input as Record<string, unknown>;
  const dependencies = ["dependencies", "devDependencies", "peerDependencies"]
    .map((key) => record[key])
    .filter(
      (entry): entry is Record<string, unknown> =>
        entry !== null && typeof entry === "object" && !Array.isArray(entry),
    );
  const nextRange = dependencies
    .map((entry) => entry.next)
    .find((entry): entry is string => typeof entry === "string");
  if (nextRange === undefined) {
    throw new DiscoveryError(
      "next-dependency-missing",
      "package.json does not declare Next.js",
    );
  }
  const version = typeof record.version === "string" ? record.version : undefined;
  return {
    name: typeof record.name === "string" ? record.name : "Discovered Next App",
    ...(version === undefined ? {} : { version: version.slice(0, 64) }),
    nextVersion: parseNextVersion(nextRange),
  };
}

function routeParts(relativePath: string): {
  kind: RouteFile["kind"];
  route: string;
} | undefined {
  const match = relativePath.match(
    /^(?:src\/)?app\/(.*\/)?(page|layout|route)\.(?:[cm]?js|jsx|ts|tsx)$/iu,
  );
  if (match === null) return undefined;
  const rawDirectory = (match[1] ?? "").replace(/\/$/u, "");
  const segments = rawDirectory
    .split("/")
    .filter(Boolean)
    .filter((segment) => !/^\(.*\)$/u.test(segment) && !segment.startsWith("@"))
    .map((segment) => {
      const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/u);
      if (optionalCatchAll !== null) return `*${optionalCatchAll[1]}?`;
      const catchAll = segment.match(/^\[\.\.\.(.+)\]$/u);
      if (catchAll !== null) return `*${catchAll[1]}`;
      const dynamic = segment.match(/^\[(.+)\]$/u);
      if (dynamic !== null) return `:${dynamic[1]}`;
      return segment.replace(/^\(\.\.\.\)|^\(\.\.\)|^\(\.\)/u, "");
    })
    .filter(Boolean);
  const route = `/${segments.join("/")}`.replace(/\/{2,}/gu, "/");
  return {
    kind:
      match[2] === "page"
        ? "page"
        : match[2] === "layout"
          ? "layout"
          : "endpoint",
    route,
  };
}

function sourceReference(
  relativePath: string,
  revision: string,
  line?: number,
  symbol?: string,
): SourceReference {
  return {
    path: relativePath,
    revision,
    ...(line === undefined ? {} : { line }),
    ...(symbol === undefined ? {} : { symbol }),
  };
}

function normalizedPath(input: string): string {
  const clean = input.split("?")[0]?.split("#")[0] ?? input;
  return clean === "" ? "/" : clean.replace(/\/{2,}/gu, "/");
}

function routeMatches(candidate: string, declared: string): boolean {
  const candidateParts = normalizedPath(candidate).split("/");
  const declaredParts = normalizedPath(declared).split("/");
  if (candidateParts.length !== declaredParts.length) return false;
  return declaredParts.every(
    (part, index) =>
      part.startsWith(":") ||
      part.startsWith("*") ||
      part === candidateParts[index],
  );
}

function resolveImport(
  currentPath: string,
  specifier: string,
  knownPaths: ReadonlySet<string>,
): string | undefined {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = path.posix.normalize(path.posix.join(path.posix.dirname(currentPath), specifier));
    if (base === ".." || base.startsWith("../") || base.startsWith("/")) return undefined;
  } else {
    return undefined;
  }
  const extension = path.posix.extname(base);
  const candidates = extension
    ? [base]
    : [
        ...CODE_EXTENSIONS.map((suffix) => `${base}${suffix}`),
        ...CODE_EXTENSIONS.map((suffix) => `${base}/index${suffix}`),
      ];
  return candidates.find((candidate) => knownPaths.has(candidate));
}

function cssSelector(locator: LocatorElement): string {
  const escaped = locator.normalizedValue
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"');
  if (!locator.dynamic) return `[${locator.attribute}="${escaped}"]`;
  const [prefix = "", suffix = ""] = escaped.split("{*}", 2);
  if (prefix !== "" && suffix !== "") {
    return `[${locator.attribute}^="${prefix}"][${locator.attribute}$="${suffix}"]`;
  }
  if (prefix !== "") return `[${locator.attribute}^="${prefix}"]`;
  if (suffix !== "") return `[${locator.attribute}$="${suffix}"]`;
  return `[${locator.attribute}]`;
}

function locatorMatch(locator: LocatorElement): RuntimeLocator["match"] {
  if (!locator.dynamic) return { kind: "exact", value: locator.normalizedValue };
  const [prefix = "", suffix = ""] = locator.normalizedValue.split("{*}", 2);
  if (prefix !== "" && suffix !== "") {
    return { kind: "prefix-suffix", prefix, suffix };
  }
  if (prefix !== "") return { kind: "prefix", value: prefix };
  if (suffix !== "") return { kind: "suffix", value: suffix };
  return { kind: "presence" };
}

function isGenericCatchAllLocator(locator: LocatorElement): boolean {
  return (
    locator.dynamic &&
    locator.normalizedValue.trim().replaceAll("{*}", "*") === "*"
  );
}

function boundEvents(captures: RuntimeLocator["captures"]): string[] {
  return captures.map((capture) =>
    capture === "geometry"
      ? "layout.geometry"
      : capture === "view"
        ? "navigation.view"
        : `action.${capture}`,
  );
}

function isStrongEntity(
  entity: SourceAnalysis["entities"][number],
  relativePath: string,
): boolean {
  if (/(?:Props|Options|Config|Result|Response|Parameters)$/u.test(entity.name)) {
    return false;
  }
  const domainPath = /(?:^|\/)(?:domain|entities|models|types)(?:\/|\.)/iu.test(
    relativePath,
  );
  return (
    entity.fields.length >= (domainPath ? 2 : 4) ||
    entity.values.length >= 2 ||
    entity.declarationKind === "enum"
  );
}

function metadataSchema(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties,
  };
}

function buildConfig(
  appId: string,
  displayName: string,
  collectorEndpoint: string,
): LivingConfig {
  return parseLivingConfig({
    schemaVersion: "living.config/v1",
    application: { id: appId, displayName },
    adapters: [
      {
        id: ADAPTER_ID,
        version: ADAPTER_VERSION,
        options: { mode: "non-executing-static-discovery" },
      },
    ],
    collector: { endpoint: collectorEndpoint },
    manifest: {
      root: ".",
      include: ["app/**/*", "src/app/**/*", "src/components/**/*", "src/lib/**/*"],
      exclude: [
        "**/node_modules/**",
        "**/.git/**",
        "**/.next/**",
        "**/.env*",
        "**/*secret*",
        "**/*credential*",
      ],
    },
    semantics: {
      events: {
        "navigation.view": {
          kind: "navigation",
          subjectType: "route",
          metadataSchema: metadataSchema({
            route: { type: "string" },
          }),
        },
        "action.activate": {
          kind: "action",
          subjectType: "control",
          metadataSchema: metadataSchema({
            locatorId: { type: "string" },
          }),
        },
        "action.change": {
          kind: "action",
          subjectType: "control",
          metadataSchema: metadataSchema({
            locatorId: { type: "string" },
          }),
        },
        "action.submit": {
          kind: "action",
          subjectType: "control",
          metadataSchema: metadataSchema({
            locatorId: { type: "string" },
          }),
        },
        "layout.geometry": {
          kind: "system",
          subjectType: "control",
          metadataSchema: metadataSchema({
            x: { type: "number" },
            y: { type: "number" },
            width: { type: "number" },
            height: { type: "number" },
            viewportWidth: { type: "number" },
            viewportHeight: { type: "number" },
          }),
        },
        "endpoint.request": {
          kind: "outcome",
          subjectType: "endpoint",
          metadataSchema: metadataSchema({
            method: { type: "string" },
            status: { type: "integer" },
            durationMs: { type: "number" },
          }),
        },
        "state.storage-access": {
          kind: "system",
          subjectType: "integration",
          metadataSchema: metadataSchema({
            access: { type: "string" },
          }),
        },
      },
    },
    privacy: {
      metadataPolicy: "deny-by-default",
      identifierMode: "anonymous",
      retentionDays: 30,
    },
  });
}

export async function discoverNextApp(
  options: DiscoverNextAppOptions,
): Promise<DiscoveryResult> {
  const limits: DiscoveryLimits = {
    ...DEFAULT_LIMITS,
    ...options.limits,
  };
  if (
    !Number.isSafeInteger(limits.maxFiles) ||
    !Number.isSafeInteger(limits.maxTotalBytes) ||
    !Number.isSafeInteger(limits.maxFileBytes) ||
    limits.maxFiles <= 0 ||
    limits.maxTotalBytes <= 0 ||
    limits.maxFileBytes <= 0
  ) {
    throw new DiscoveryError("invalid-limits", "Discovery limits must be positive integers");
  }

  const scan = await securelyReadSourceTree(options.repositoryRoot, limits);
  const packageFile = scan.files.find((file) => file.relativePath === "package.json");
  if (packageFile === undefined) {
    throw new DiscoveryError("package-json-missing", "Discovery requires a root package.json");
  }
  const packageInfo = parsePackage(packageFile);
  const appId = normalizeAppId(options.appId ?? packageInfo.name);
  const displayName = (options.displayName ?? packageInfo.name).slice(0, 120);
  const revision = scan.sourceDigest;
  const analyses = scan.files
    .map((file) => ({ file, analysis: analyzeSource(file.relativePath, file.text) }))
    .filter(
      (entry): entry is { file: ScannedFile; analysis: SourceAnalysis } =>
        entry.analysis !== undefined,
    );
  const analysesByPath = new Map(
    analyses.map((entry) => [entry.analysis.path, entry.analysis]),
  );
  const knownPaths = new Set(analysesByPath.keys());

  const routeFiles: RouteFile[] = [];
  for (const entry of analyses) {
    const route = routeParts(entry.file.relativePath);
    if (route !== undefined) routeFiles.push({ ...entry, ...route });
  }
  const pages = routeFiles.filter((route) => route.kind === "page");
  if (pages.length === 0) {
    throw new DiscoveryError(
      "app-router-pages-missing",
      "No Next.js App Router page files were discovered under app/ or src/app/",
    );
  }

  const nodes = new Map<string, ProductNode>();
  const edges = new Map<string, ProductEdge>();
  const runtimeLocators: RuntimeLocator[] = [];
  const metrics: MetricDefinition[] = [];
  const diagnostics: DiscoveryDiagnostic[] = [];
  const fileSurfaces = new Map<string, string[]>();
  const componentIds = new Map<string, string>();
  const entityIds = new Map<string, string>();
  const routeIds = new Map<string, string>();
  const endpointIds = new Map<string, string>();

  function addNode(node: ProductNode): void {
    const current = nodes.get(node.id);
    if (current === undefined) {
      nodes.set(node.id, node);
      return;
    }
    const sources = [...current.provenance.sources, ...node.provenance.sources]
      .filter(
        (source, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.path === source.path &&
              candidate.line === source.line &&
              candidate.symbol === source.symbol,
          ) === index,
      )
      .sort((left, right) =>
        `${left.path}:${left.line ?? 0}:${left.symbol ?? ""}`.localeCompare(
          `${right.path}:${right.line ?? 0}:${right.symbol ?? ""}`,
        ),
      );
    nodes.set(node.id, {
      ...current,
      provenance: { ...current.provenance, sources },
    });
  }

  function addEdge(edge: ProductEdge): void {
    const key = `${edge.from}\0${edge.to}\0${edge.relation}`;
    const current = edges.get(key);
    if (current === undefined) {
      edges.set(key, edge);
      return;
    }
    const sources = [...current.provenance.sources, ...edge.provenance.sources]
      .filter(
        (source, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.path === source.path && candidate.line === source.line,
          ) === index,
      )
      .sort((left, right) =>
        `${left.path}:${left.line ?? 0}`.localeCompare(`${right.path}:${right.line ?? 0}`),
      );
    edges.set(key, {
      ...current,
      provenance: { ...current.provenance, sources },
    });
  }

  function provenance(
    origin: "scanned" | "inferred",
    confidence: number,
    source: SourceReference,
  ): ProductNode["provenance"] {
    return { origin, confidence, sources: [source] };
  }

  for (const page of pages) {
    const routeId = stableNodeId("route", page.route);
    const pageSurfaceId = stableNodeId("surface", `page:${page.route}`);
    const source = sourceReference(page.file.relativePath, revision, 1, "default");
    routeIds.set(page.route, routeId);
    addNode({
      id: routeId,
      kind: "route",
      displayName: page.route,
      provenance: provenance("scanned", 1, source),
      attributes: { path: page.route, router: "app" },
    });
    addNode({
      id: pageSurfaceId,
      kind: "surface",
      displayName: `${page.route} page`,
      provenance: provenance("scanned", 1, source),
      attributes: { surfaceType: "page", route: page.route },
    });
    fileSurfaces.set(page.file.relativePath, [pageSurfaceId]);
    addEdge({
      from: routeId,
      to: pageSurfaceId,
      relation: "renders",
      provenance: provenance("scanned", 1, source),
    });
    runtimeLocators.push({
      token: `locator:${shortHash(`route:${page.route}`)}`,
      nodeId: routeId,
      strategy: "route",
      selector: page.route,
      normalizedValue: page.route,
      dynamic: page.route.includes(":") || page.route.includes("*"),
      match:
        page.route.includes(":") || page.route.includes("*")
          ? { kind: "route-template", value: page.route }
          : { kind: "exact", value: page.route },
      eventBindings: ["navigation.view"],
      captures: ["view"],
      source,
    });
    metrics.push({
      id: metricId(routeId, "navigation.view"),
      eventName: "navigation.view",
      kind: "workflow",
      targetNodeId: routeId,
      trigger: "Next App Router navigation completed",
      fields: ["route"],
      provenance: "scanned",
    });
  }

  for (const layout of routeFiles.filter((entry) => entry.kind === "layout")) {
    const layoutId = stableNodeId("surface", `layout:${layout.route}`);
    const source = sourceReference(layout.file.relativePath, revision, 1, "default");
    addNode({
      id: layoutId,
      kind: "surface",
      displayName: `${layout.route} layout`,
      provenance: provenance("scanned", 1, source),
      attributes: { surfaceType: "layout", routePrefix: layout.route },
    });
    fileSurfaces.set(layout.file.relativePath, [layoutId]);
    for (const [route, routeId] of routeIds) {
      if (
        layout.route === "/" ||
        route === layout.route ||
        route.startsWith(`${layout.route}/`)
      ) {
        addEdge({
          from: routeId,
          to: layoutId,
          relation: "renders",
          provenance: provenance("inferred", 0.98, source),
        });
      }
    }
  }

  for (const endpoint of routeFiles.filter((entry) => entry.kind === "endpoint")) {
    const endpointId = stableNodeId("endpoint", endpoint.route);
    const source = sourceReference(endpoint.file.relativePath, revision, 1);
    endpointIds.set(endpoint.route, endpointId);
    addNode({
      id: endpointId,
      kind: "endpoint",
      displayName: endpoint.route,
      provenance: provenance("scanned", 1, source),
      attributes: {
        path: endpoint.route,
        methods: [...endpoint.analysis.endpointMethods],
      },
    });
    metrics.push({
      id: metricId(endpointId, "endpoint.request"),
      eventName: "endpoint.request",
      kind: "reliability",
      targetNodeId: endpointId,
      trigger: "Route handler response completed",
      fields: ["method", "status", "durationMs"],
      provenance: "scanned",
    });
  }

  for (const { analysis } of analyses) {
    const surfaces = [...(fileSurfaces.get(analysis.path) ?? [])];
    const declaredComponents =
      routeParts(analysis.path) === undefined ? analysis.components : [];
    for (const component of declaredComponents) {
      const key = `${analysis.path}#${component.name}`;
      const componentId = stableNodeId("surface", `component:${key}`);
      componentIds.set(key, componentId);
      addNode({
        id: componentId,
        kind: "surface",
        displayName: component.name,
        provenance: provenance(
          "scanned",
          1,
          sourceReference(analysis.path, revision, component.line, component.name),
        ),
        attributes: { surfaceType: "component", export: component.name },
      });
      surfaces.push(componentId);
    }
    if (surfaces.length > 0) fileSurfaces.set(analysis.path, [...new Set(surfaces)]);

    for (const entity of analysis.entities.filter((candidate) =>
      isStrongEntity(candidate, analysis.path),
    )) {
      const key = `${analysis.path}#${entity.name}`;
      const entityId = stableNodeId("entity", key);
      entityIds.set(key, entityId);
      addNode({
        id: entityId,
        kind: "entity",
        displayName: entity.name,
        provenance: provenance(
          "scanned",
          0.96,
          sourceReference(analysis.path, revision, entity.line, entity.name),
        ),
        attributes: {
          declarationKind: entity.declarationKind,
          fields: [...entity.fields],
          values: [...entity.values],
        },
      });
    }
  }

  for (const { analysis } of analyses) {
    const currentSurfaces = fileSurfaces.get(analysis.path) ?? [];
    for (const imported of analysis.imports) {
      const targetPath = resolveImport(analysis.path, imported.specifier, knownPaths);
      if (targetPath === undefined) continue;
      if (analysis.usedJsxNames.has(imported.localName)) {
        const targetId =
          imported.importedName === "default"
            ? (fileSurfaces.get(targetPath)?.[0] ?? undefined)
            : componentIds.get(`${targetPath}#${imported.importedName}`);
        if (targetId !== undefined) {
          for (const surfaceId of currentSurfaces) {
            if (surfaceId === targetId) continue;
            addEdge({
              from: surfaceId,
              to: targetId,
              relation: "renders",
              provenance: provenance(
                "inferred",
                0.94,
                sourceReference(analysis.path, revision, imported.line, imported.localName),
              ),
            });
          }
        }
      }
      const entityId = entityIds.get(`${targetPath}#${imported.importedName}`);
      if (entityId !== undefined) {
        for (const surfaceId of currentSurfaces) {
          addEdge({
            from: surfaceId,
            to: entityId,
            relation: "reads",
            provenance: provenance(
              "inferred",
              imported.typeOnly ? 0.9 : 0.72,
              sourceReference(analysis.path, revision, imported.line, imported.localName),
            ),
          });
        }
      }
    }

    for (const link of analysis.links) {
      const destination = [...routeIds.entries()].find(([route]) =>
        routeMatches(normalizedPath(link.target), route),
      );
      if (destination === undefined) continue;
      for (const surfaceId of currentSurfaces) {
        addEdge({
          from: surfaceId,
          to: destination[1],
          relation: "navigates-to",
          provenance: provenance(
            "scanned",
            0.99,
            sourceReference(analysis.path, revision, link.line),
          ),
        });
      }
    }

    for (const call of analysis.fetches) {
      const endpoint = [...endpointIds.entries()].find(([route]) =>
        routeMatches(normalizedPath(call.target), route),
      );
      if (endpoint === undefined) continue;
      for (const surfaceId of currentSurfaces) {
        addEdge({
          from: surfaceId,
          to: endpoint[1],
          relation: "calls",
          provenance: provenance(
            "scanned",
            0.96,
            sourceReference(analysis.path, revision, call.line),
          ),
        });
      }
    }

    const locatorOccurrences = new Map<string, number>();
    for (const locator of analysis.locators) {
      const occurrenceKey = `${locator.attribute}\0${locator.normalizedValue}`;
      const occurrence = locatorOccurrences.get(occurrenceKey) ?? 0;
      locatorOccurrences.set(occurrenceKey, occurrence + 1);
      const interactive = locator.captures.some((capture) =>
        ["activate", "change", "submit"].includes(capture),
      );
      if (interactive && isGenericCatchAllLocator(locator)) {
        diagnostics.push({
          severity: "warning",
          code: "generic-action-locator-skipped",
          message:
            `Generic interactive ${locator.attribute} expression at line ${locator.line} was skipped because it has no stable action-family prefix or suffix`,
          path: analysis.path,
        });
        continue;
      }
      const semanticKey = `${analysis.path}:${locator.attribute}:${locator.normalizedValue}:${occurrence}`;
      const locatorNodeId = stableNodeId(interactive ? "action" : "surface", semanticKey);
      const source = sourceReference(
        analysis.path,
        revision,
        locator.line,
        locator.symbol,
      );
      addNode({
        id: locatorNodeId,
        kind: interactive ? "action" : "surface",
        displayName: locator.normalizedValue,
        provenance: provenance("scanned", locator.dynamic ? 0.9 : 1, source),
        attributes: {
          element: locator.elementName,
          locatorAttribute: locator.attribute,
          locatorValue: locator.normalizedValue,
          dynamic: locator.dynamic,
        },
      });
      const owner =
        (locator.symbol === undefined
          ? undefined
          : componentIds.get(`${analysis.path}#${locator.symbol}`)) ??
        currentSurfaces[0];
      if (owner !== undefined && owner !== locatorNodeId) {
        addEdge({
          from: owner,
          to: locatorNodeId,
          relation: "exposes",
          provenance: provenance("inferred", 0.96, source),
        });
      }
      runtimeLocators.push({
        token: `locator:${shortHash(semanticKey)}`,
        nodeId: locatorNodeId,
        strategy: locator.attribute,
        selector: cssSelector(locator),
        normalizedValue: locator.normalizedValue,
        dynamic: locator.dynamic,
        match: locatorMatch(locator),
        eventBindings: boundEvents(locator.captures),
        captures: locator.captures,
        source,
      });
      for (const capture of locator.captures) {
        const eventName =
          capture === "geometry"
            ? "layout.geometry"
            : capture === "view"
              ? "navigation.view"
              : `action.${capture}`;
        metrics.push({
          id: metricId(locatorNodeId, eventName),
          eventName,
          kind: capture === "geometry" ? "layout" : "workflow",
          targetNodeId: locatorNodeId,
          trigger:
            capture === "geometry"
              ? "Element rendered or resized"
              : `Delegated ${capture} event matched the runtime locator`,
          fields:
            capture === "geometry"
              ? ["x", "y", "width", "height", "viewportWidth", "viewportHeight"]
              : ["locatorId"],
          provenance: locator.dynamic ? "inferred" : "scanned",
        });
      }
    }

    for (const storage of analysis.storage) {
      const integrationId = stableNodeId(
        "integration",
        `local-storage:${storage.key}`,
      );
      const source = sourceReference(analysis.path, revision, storage.line);
      addNode({
        id: integrationId,
        kind: "integration",
        displayName: `localStorage ${storage.key}`,
        provenance: provenance("inferred", storage.dynamic ? 0.7 : 0.9, source),
        attributes: {
          provider: "localStorage",
          key: storage.key,
          access: storage.access,
          dynamic: storage.dynamic,
        },
      });
      for (const surfaceId of currentSurfaces) {
        if (storage.access === "read" || storage.access === "read-write") {
          addEdge({
            from: surfaceId,
            to: integrationId,
            relation: "reads",
            provenance: provenance("inferred", 0.82, source),
          });
        }
        if (storage.access === "write" || storage.access === "read-write") {
          addEdge({
            from: surfaceId,
            to: integrationId,
            relation: "writes",
            provenance: provenance("inferred", 0.82, source),
          });
        }
      }
      metrics.push({
        id: metricId(integrationId, "state.storage-access"),
        eventName: "state.storage-access",
        kind: "outcome",
        targetNodeId: integrationId,
        trigger: "Instrumented storage adapter access",
        fields: ["access"],
        provenance: "inferred",
      });
    }
  }

  const sortedNodes = [...nodes.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const sortedEdges = [...edges.values()].sort((left, right) =>
    `${left.from}\0${left.to}\0${left.relation}`.localeCompare(
      `${right.from}\0${right.to}\0${right.relation}`,
    ),
  );
  const semanticManifest = {
    schemaVersion: "living.product-manifest/v1" as const,
    appId,
    release: {
      revision,
      ...(packageInfo.version === undefined ? {} : { version: packageInfo.version }),
    },
    generators: [{ adapterId: ADAPTER_ID, adapterVersion: ADAPTER_VERSION }],
    nodes: sortedNodes,
    edges: sortedEdges,
  };
  const contentHash = sha256(canonicalJson(semanticManifest));
  const canReusePriorTimestamp =
    options.previous?.sourceDigest === revision &&
    options.previous.manifest.contentHash === contentHash &&
    options.previous.manifest.appId === appId;
  const generatedAt = canReusePriorTimestamp
    ? options.previous.manifest.generatedAt
    : (options.clock ?? (() => new Date()))().toISOString();
  const manifest = parseProductManifest({
    ...semanticManifest,
    generatedAt,
    contentHash:
      canReusePriorTimestamp && options.previous !== undefined
        ? options.previous.manifest.contentHash
        : contentHash,
  });
  const config = buildConfig(
    appId,
    displayName,
    options.collectorEndpoint ?? "http://127.0.0.1:4318/v1/living/events",
  );

  const uniqueLocators = runtimeLocators
    .filter(
      (locator, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.nodeId === locator.nodeId &&
            candidate.strategy === locator.strategy &&
            candidate.selector === locator.selector,
        ) === index,
    )
    .sort((left, right) =>
      `${left.nodeId}\0${left.selector}`.localeCompare(`${right.nodeId}\0${right.selector}`),
    );
  const uniqueMetrics = metrics
    .filter(
      (metric, index, all) =>
        all.findIndex((candidate) => candidate.id === metric.id) === index,
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schemaVersion: "living.discovery-result/v1",
    support: {
      framework: "next-app-router",
      detectedVersion: packageInfo.nextVersion,
      supportedRange: ">=15.3.0",
    },
    sourceDigest: revision,
    manifest,
    config,
    runtimeLocatorMap: {
      schemaVersion: "living.runtime-locator-map/v1",
      locators: uniqueLocators,
    },
    metricCatalog: {
      schemaVersion: "living.metric-catalog/v1",
      metrics: uniqueMetrics,
    },
    diagnostics: [
      ...scan.diagnostics,
      ...diagnostics.sort((left, right) =>
        `${left.path ?? ""}:${left.message}`.localeCompare(
          `${right.path ?? ""}:${right.message}`,
        ),
      ),
      {
        severity: "info",
        code: "static-analysis-only",
        message:
          "Discovery parsed source text without importing host modules or executing configuration and scripts",
      },
      {
        severity: "info",
        code: "runtime-geometry-pending",
        message:
          "Geometry metrics are prepared from stable locators; coordinates require the runtime capture adapter",
      },
    ],
    stats: {
      scannedFiles: scan.files.length,
      scannedBytes: scan.scannedBytes,
      skippedFiles: scan.skippedFiles,
    },
  };
}
