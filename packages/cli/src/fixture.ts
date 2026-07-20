import type { JsonValue } from "@living-software/contracts";

import {
  NEXT_HOST_FIXTURE_SCHEMA_VERSION,
  type FixtureEdge,
  type FixtureEventDeclaration,
  type FixtureNode,
  type HostExtensionPoint,
  type HostOperation,
  type NextJsHostFixture,
} from "./types.js";

const NODE_KINDS = new Set([
  "route",
  "surface",
  "action",
  "endpoint",
  "entity",
  "job",
  "integration",
  "test",
  "extension-point",
]);
const EDGE_RELATIONS = new Set([
  "renders",
  "navigates-to",
  "calls",
  "reads",
  "writes",
  "triggers",
  "tests",
  "exposes",
]);
const EVENT_KINDS = new Set(["navigation", "action", "outcome", "error", "system"]);
const OPERATION_EFFECTS = new Set(["read", "write", "external", "irreversible"]);
const IDEMPOTENCY = new Set(["required", "supported", "none"]);
const PRESENTATIONS = new Set(["action", "panel"]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : string(value, path);
}

function integer(value: unknown, path: string, minimum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new TypeError(`${path} must be an integer greater than or equal to ${minimum}`);
  }
  return value as number;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value;
}

function safePath(value: unknown, path: string): string {
  const result = string(value, path).replaceAll("\\", "/");
  if (result.startsWith("/") || /^[a-z]:\//i.test(result) || result.split("/").includes("..")) {
    throw new TypeError(`${path} must stay inside the host root`);
  }
  return result;
}

function jsonObject(value: unknown, path: string): Record<string, JsonValue> {
  const result = object(value, path);
  JSON.stringify(result);
  return result as Record<string, JsonValue>;
}

function parseNode(value: unknown, index: number): FixtureNode {
  const node = object(value, `nodes[${index}]`);
  const kind = string(node.kind, `nodes[${index}].kind`);
  if (!NODE_KINDS.has(kind)) throw new TypeError(`nodes[${index}].kind is unsupported`);

  return {
    id: string(node.id, `nodes[${index}].id`),
    kind: kind as FixtureNode["kind"],
    displayName: string(node.displayName, `nodes[${index}].displayName`),
    sourcePath: safePath(node.sourcePath, `nodes[${index}].sourcePath`),
    ...(node.line === undefined ? {} : { line: integer(node.line, `nodes[${index}].line`, 1) }),
    ...(node.symbol === undefined ? {} : { symbol: string(node.symbol, `nodes[${index}].symbol`) }),
    ...(node.attributes === undefined
      ? {}
      : { attributes: jsonObject(node.attributes, `nodes[${index}].attributes`) }),
  };
}

function parseEdge(value: unknown, index: number): FixtureEdge {
  const edge = object(value, `edges[${index}]`);
  const relation = string(edge.relation, `edges[${index}].relation`);
  if (!EDGE_RELATIONS.has(relation)) throw new TypeError(`edges[${index}].relation is unsupported`);

  return {
    from: string(edge.from, `edges[${index}].from`),
    to: string(edge.to, `edges[${index}].to`),
    relation: relation as FixtureEdge["relation"],
    sourcePath: safePath(edge.sourcePath, `edges[${index}].sourcePath`),
    ...(edge.line === undefined ? {} : { line: integer(edge.line, `edges[${index}].line`, 1) }),
    ...(edge.symbol === undefined ? {} : { symbol: string(edge.symbol, `edges[${index}].symbol`) }),
  };
}

function parseEvent(value: unknown, index: number): FixtureEventDeclaration {
  const event = object(value, `events[${index}]`);
  const kind = string(event.kind, `events[${index}].kind`);
  if (!EVENT_KINDS.has(kind)) throw new TypeError(`events[${index}].kind is unsupported`);

  return {
    name: string(event.name, `events[${index}].name`),
    kind: kind as FixtureEventDeclaration["kind"],
    ...(event.subjectType === undefined
      ? {}
      : { subjectType: string(event.subjectType, `events[${index}].subjectType`) }),
    metadataSchema:
      event.metadataSchema === undefined
        ? { type: "object", additionalProperties: false }
        : jsonObject(event.metadataSchema, `events[${index}].metadataSchema`),
  };
}

function parseExtensionPoint(value: unknown, index: number): HostExtensionPoint {
  const point = object(value, `extensionPoints[${index}]`);
  const presentation = string(point.presentation, `extensionPoints[${index}].presentation`);
  if (!PRESENTATIONS.has(presentation)) {
    throw new TypeError(`extensionPoints[${index}].presentation is unsupported`);
  }
  return {
    id: string(point.id, `extensionPoints[${index}].id`),
    surfaceNodeId: string(point.surfaceNodeId, `extensionPoints[${index}].surfaceNodeId`),
    presentation: presentation as HostExtensionPoint["presentation"],
  };
}

function parseOperation(value: unknown, index: number): HostOperation {
  const operation = object(value, `operations[${index}]`);
  const effect = string(operation.effect, `operations[${index}].effect`);
  const idempotency = string(operation.idempotency, `operations[${index}].idempotency`);
  if (!OPERATION_EFFECTS.has(effect)) throw new TypeError(`operations[${index}].effect is unsupported`);
  if (!IDEMPOTENCY.has(idempotency)) {
    throw new TypeError(`operations[${index}].idempotency is unsupported`);
  }
  if (typeof operation.requiresUserConfirmation !== "boolean") {
    throw new TypeError(`operations[${index}].requiresUserConfirmation must be a boolean`);
  }

  return {
    id: string(operation.id, `operations[${index}].id`),
    version: string(operation.version, `operations[${index}].version`),
    effect: effect as HostOperation["effect"],
    inputSchema: jsonObject(operation.inputSchema, `operations[${index}].inputSchema`),
    outputSchema: jsonObject(operation.outputSchema, `operations[${index}].outputSchema`),
    idempotency: idempotency as HostOperation["idempotency"],
    requiresUserConfirmation: operation.requiresUserConfirmation,
  };
}

export function parseNextJsHostFixture(candidate: unknown): NextJsHostFixture {
  const fixture = object(candidate, "fixture");
  if (fixture.schemaVersion !== NEXT_HOST_FIXTURE_SCHEMA_VERSION) {
    throw new TypeError(`fixture.schemaVersion must be ${NEXT_HOST_FIXTURE_SCHEMA_VERSION}`);
  }

  const application = object(fixture.application, "application");
  const framework = object(fixture.framework, "framework");
  const release = object(fixture.release, "release");
  if (framework.name !== "nextjs") throw new TypeError("framework.name must be nextjs");

  const generatedAt = string(fixture.generatedAt, "generatedAt");
  if (Number.isNaN(Date.parse(generatedAt))) throw new TypeError("generatedAt must be an ISO timestamp");

  const identifierMode = fixture.identifierMode ?? "anonymous";
  if (identifierMode !== "anonymous" && identifierMode !== "pseudonymous") {
    throw new TypeError("identifierMode is unsupported");
  }
  const pseudonymSaltEnv = optionalString(fixture.pseudonymSaltEnv, "pseudonymSaltEnv");
  if (identifierMode === "pseudonymous" && pseudonymSaltEnv === undefined) {
    throw new TypeError("pseudonymSaltEnv is required for pseudonymous identifiers");
  }

  const nodes = array(fixture.nodes, "nodes").map(parseNode);
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) throw new TypeError(`Duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
  }
  const edges = array(fixture.edges, "edges").map(parseEdge);
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new TypeError(`Edge ${edge.from} -> ${edge.to} references an unknown node`);
    }
  }

  const events = array(fixture.events, "events").map(parseEvent);
  const eventNames = new Set<string>();
  for (const event of events) {
    if (eventNames.has(event.name)) throw new TypeError(`Duplicate event name: ${event.name}`);
    eventNames.add(event.name);
  }

  return {
    schemaVersion: NEXT_HOST_FIXTURE_SCHEMA_VERSION,
    application: {
      id: string(application.id, "application.id"),
      displayName: string(application.displayName, "application.displayName"),
    },
    framework: {
      name: "nextjs",
      version: string(framework.version, "framework.version"),
      adapterVersion: string(framework.adapterVersion, "framework.adapterVersion"),
    },
    release: {
      revision: string(release.revision, "release.revision"),
      ...(release.version === undefined ? {} : { version: string(release.version, "release.version") }),
    },
    generatedAt,
    ...(fixture.collectorEndpoint === undefined
      ? {}
      : { collectorEndpoint: string(fixture.collectorEndpoint, "collectorEndpoint") }),
    identifierMode,
    ...(pseudonymSaltEnv === undefined ? {} : { pseudonymSaltEnv }),
    retentionDays:
      fixture.retentionDays === undefined
        ? 14
        : integer(fixture.retentionDays, "retentionDays", 1),
    nodes,
    edges,
    events,
    extensionPoints: array(fixture.extensionPoints ?? [], "extensionPoints").map(parseExtensionPoint),
    operations: array(fixture.operations ?? [], "operations").map(parseOperation),
  };
}
