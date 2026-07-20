#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_TRACE_LINE_BYTES = 128 * 1024;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
// Keep this grammar in lockstep with contracts.identifierSchema.
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const ACTION_FAMILY_PATTERN = /^[a-z0-9][a-z0-9._:/-]*(?:\*[a-z0-9._:/-]*)?$/;
const SIMULATOR_TARGET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const ROUTE_PATTERN = /^\/(?:[A-Za-z0-9._~:@*+\-[\]]+\/?)*$/;
const EVENT_KINDS = new Set([
  "navigation",
  "action",
  "outcome",
  "error",
  "system",
]);
const EVENT_STATUSES = new Set([
  "started",
  "succeeded",
  "failed",
  "abandoned",
]);
const PRODUCT_NODE_KINDS = new Set([
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
const SIMULATOR_TYPES = new Set([
  "action",
  "retry",
  "error",
  "session_start",
  "session_end",
]);
const PARITY_ACTIONS = new Set(["goto", "click", "select", "submit"]);
const NON_PARITY_ACTIONS = new Set(["fill", "read"]);
const KNOWN_DYNAMIC_TARGET_PREFIXES = [
  "board-stage-select-",
  "task-checkbox-",
  "company-row-",
  "contact-row-",
  "pipeline-stage-",
  "board-column-",
  "lead-link-",
  "lead-row-",
  "task-item-",
  "board-card-",
];

class ProofInputError extends Error {
  constructor(code) {
    super(code);
    this.name = "ProofInputError";
    this.code = code;
  }
}

function fail(code) {
  throw new ProofInputError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function expectObject(value, code) {
  if (!isPlainObject(value)) fail(code);
  return value;
}

function expectArray(value, max, code) {
  if (!Array.isArray(value) || value.length > max) fail(code);
  return value;
}

function expectString(value, max, code) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    fail(code);
  }
  return value;
}

function expectIdentifier(value, code) {
  const identifier = expectString(value, 160, code);
  if (!IDENTIFIER_PATTERN.test(identifier)) fail(code);
  return identifier;
}

function expectInteger(value, code, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(code);
  return value;
}

function expectFiniteNumber(value, code) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(code);
  }
  return value;
}

function expectBoolean(value, code) {
  if (typeof value !== "boolean") fail(code);
  return value;
}

function expectIsoDate(value, code) {
  const date = expectString(value, 64, code);
  if (!Number.isFinite(Date.parse(date))) fail(code);
  return date;
}

function expectHash(value, code) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) fail(code);
  return value;
}

function exactKeys(value, required, optional, code) {
  const object = expectObject(value, code);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) fail(code);
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key)) fail(code);
  }
  return object;
}

function sourceBuffer(source, code) {
  const buffer = Buffer.isBuffer(source)
    ? source
    : typeof source === "string"
      ? Buffer.from(source, "utf8")
      : null;
  if (buffer === null || buffer.byteLength === 0 || buffer.byteLength > MAX_INPUT_BYTES) {
    fail(code);
  }
  return buffer;
}

function parseJsonSource(source, code) {
  const buffer = sourceBuffer(source, code);
  try {
    return { buffer, value: JSON.parse(buffer.toString("utf8")) };
  } catch {
    fail(code);
  }
}

function sha256(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function canonicalManifestActionFamily(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 160) {
    fail("MANIFEST_ACTION_FAMILY_INVALID");
  }
  const family = value.trim().toLowerCase().replaceAll("{*}", "*");
  if (
    family.length === 0 ||
    family.includes("**") ||
    (family.match(/\*/g)?.length ?? 0) > 1 ||
    !ACTION_FAMILY_PATTERN.test(family)
  ) {
    fail("MANIFEST_ACTION_FAMILY_INVALID");
  }
  return family;
}

function canonicalManifestRoute(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\\") ||
    value.includes("//") ||
    !ROUTE_PATTERN.test(value)
  ) {
    fail("MANIFEST_ROUTE_INVALID");
  }
  const route = value.length > 1 && value.endsWith("/") ? value.slice(0, -1) : value;
  const segments = route.split("/").slice(1);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    fail("MANIFEST_ROUTE_INVALID");
  }
  return route;
}

function parseManifest(source) {
  const parsed = parseJsonSource(source, "MANIFEST_JSON_INVALID");
  const manifest = exactKeys(
    parsed.value,
    [
      "schemaVersion",
      "appId",
      "release",
      "generatedAt",
      "generators",
      "nodes",
      "edges",
      "contentHash",
    ],
    ["hostInterface"],
    "MANIFEST_SHAPE_INVALID",
  );
  if (manifest.schemaVersion !== "living.product-manifest/v1") {
    fail("MANIFEST_VERSION_INVALID");
  }
  const appId = expectIdentifier(manifest.appId, "MANIFEST_APP_INVALID");
  expectHash(manifest.contentHash, "MANIFEST_HASH_INVALID");
  expectIsoDate(manifest.generatedAt, "MANIFEST_DATE_INVALID");
  expectObject(manifest.release, "MANIFEST_RELEASE_INVALID");
  expectArray(manifest.generators, 1_000, "MANIFEST_GENERATORS_INVALID");
  expectArray(manifest.edges, 100_000, "MANIFEST_EDGES_INVALID");
  if (manifest.hostInterface !== undefined) {
    expectObject(manifest.hostInterface, "MANIFEST_HOST_INTERFACE_INVALID");
  }

  const nodes = expectArray(manifest.nodes, 20_000, "MANIFEST_NODES_INVALID");
  const nodeById = new Map();
  const actionFamilies = new Set();
  const routeFamilies = new Set();

  for (const value of nodes) {
    const node = exactKeys(
      value,
      ["id", "kind", "displayName", "provenance"],
      ["attributes"],
      "MANIFEST_NODE_INVALID",
    );
    const id = expectIdentifier(node.id, "MANIFEST_NODE_INVALID");
    if (nodeById.has(id) || !PRODUCT_NODE_KINDS.has(node.kind)) {
      fail("MANIFEST_NODE_INVALID");
    }
    const displayName = expectString(node.displayName, 160, "MANIFEST_NODE_INVALID");
    expectObject(node.provenance, "MANIFEST_NODE_INVALID");
    const attributes = node.attributes === undefined
      ? undefined
      : expectObject(node.attributes, "MANIFEST_NODE_INVALID");

    let family;
    if (node.kind === "action") {
      const locatorValue = attributes?.locatorValue;
      if (locatorValue !== undefined && typeof locatorValue !== "string") {
        fail("MANIFEST_ACTION_FAMILY_INVALID");
      }
      family = canonicalManifestActionFamily(locatorValue ?? displayName);
      actionFamilies.add(family);
    } else if (node.kind === "route") {
      const path = attributes?.path;
      if (path !== undefined && typeof path !== "string") {
        fail("MANIFEST_ROUTE_INVALID");
      }
      family = canonicalManifestRoute(path ?? displayName);
      routeFamilies.add(family);
    }
    nodeById.set(id, { kind: node.kind, family });
  }

  if (actionFamilies.size === 0 || routeFamilies.size === 0) {
    fail("MANIFEST_DISCOVERY_MAP_EMPTY");
  }

  return {
    buffer: parsed.buffer,
    appId,
    contentHash: manifest.contentHash,
    nodeById,
    actionFamilies: [...actionFamilies].sort(),
    routeFamilies: [...routeFamilies].sort(),
  };
}

function validateEvent(value, context) {
  const event = exactKeys(
    value,
    [
      "schemaVersion",
      "eventId",
      "appId",
      "environment",
      "releaseRevision",
      "occurredAt",
      "sequence",
      "name",
      "kind",
      "status",
      "sessionId",
      "metadata",
      "provenance",
    ],
    ["actor", "subject", "product", "trace", "durationMs"],
    "ANALYSIS_EVENT_INVALID",
  );
  if (event.schemaVersion !== "living.workflow-event/v1") {
    fail("ANALYSIS_EVENT_INVALID");
  }
  const eventId = expectIdentifier(event.eventId, "ANALYSIS_EVENT_INVALID");
  const sessionId = expectIdentifier(event.sessionId, "ANALYSIS_EVENT_INVALID");
  if (event.appId !== context.appId) fail("ANALYSIS_APP_MISMATCH");
  if (!new Set(["development", "preview", "production"]).has(event.environment)) {
    fail("ANALYSIS_EVENT_INVALID");
  }
  expectString(event.releaseRevision, 160, "ANALYSIS_EVENT_INVALID");
  const occurredAt = expectIsoDate(event.occurredAt, "ANALYSIS_EVENT_INVALID");
  const sequence = expectInteger(event.sequence, "ANALYSIS_EVENT_INVALID");
  expectString(event.name, 160, "ANALYSIS_EVENT_INVALID");
  if (!EVENT_KINDS.has(event.kind) || !EVENT_STATUSES.has(event.status)) {
    fail("ANALYSIS_EVENT_INVALID");
  }
  expectObject(event.metadata, "ANALYSIS_EVENT_INVALID");
  const provenance = exactKeys(
    event.provenance,
    ["source", "synthetic"],
    [],
    "ANALYSIS_EVENT_INVALID",
  );
  if (!new Set(["sdk", "technical-telemetry"]).has(provenance.source)) {
    fail("ANALYSIS_PRIMARY_NOT_INDEPENDENT");
  }
  expectBoolean(provenance.synthetic, "ANALYSIS_EVENT_INVALID");

  if (event.actor !== undefined) {
    const actor = exactKeys(event.actor, ["pseudonymousId"], [], "ANALYSIS_EVENT_INVALID");
    expectIdentifier(actor.pseudonymousId, "ANALYSIS_EVENT_INVALID");
  }
  if (event.subject !== undefined) {
    const subject = exactKeys(
      event.subject,
      ["type", "pseudonymousId"],
      [],
      "ANALYSIS_EVENT_INVALID",
    );
    expectIdentifier(subject.type, "ANALYSIS_EVENT_INVALID");
    expectIdentifier(subject.pseudonymousId, "ANALYSIS_EVENT_INVALID");
  }
  if (event.trace !== undefined) {
    const trace = exactKeys(event.trace, ["traceId"], ["spanId"], "ANALYSIS_EVENT_INVALID");
    expectString(trace.traceId, 128, "ANALYSIS_EVENT_INVALID");
    if (trace.spanId !== undefined) expectString(trace.spanId, 128, "ANALYSIS_EVENT_INVALID");
  }
  if (event.durationMs !== undefined) {
    expectInteger(event.durationMs, "ANALYSIS_EVENT_INVALID", 86_400_000);
  }

  let node;
  let surface;
  if (event.product !== undefined) {
    const product = exactKeys(
      event.product,
      ["manifestHash", "nodeId"],
      ["surfaceId"],
      "ANALYSIS_EVENT_INVALID",
    );
    if (product.manifestHash !== context.manifest.contentHash) {
      fail("ANALYSIS_MANIFEST_MISMATCH");
    }
    const nodeId = expectIdentifier(product.nodeId, "ANALYSIS_EVENT_INVALID");
    node = context.manifest.nodeById.get(nodeId);
    if (node === undefined) fail("ANALYSIS_NODE_UNKNOWN");
    if (product.surfaceId !== undefined) {
      const surfaceId = expectIdentifier(product.surfaceId, "ANALYSIS_EVENT_INVALID");
      surface = context.manifest.nodeById.get(surfaceId);
      if (surface === undefined) fail("ANALYSIS_NODE_UNKNOWN");
    }
  }
  if (event.kind === "action" && (node === undefined || node.kind !== "action")) {
    fail("ANALYSIS_ACTION_UNMAPPED");
  }

  return {
    eventId,
    sessionId,
    occurredAt,
    sequence,
    kind: event.kind,
    actionFamily: event.kind === "action" ? node.family : undefined,
    routeFamily:
      node?.kind === "route"
        ? node.family
        : surface?.kind === "route"
          ? surface.family
          : undefined,
  };
}

function validateWorkflowCases(value, eventIds, sessionIds) {
  const cases = expectArray(value, 100_000, "ANALYSIS_CASES_INVALID");
  const seen = new Set();
  for (const item of cases) {
    const workflowCase = exactKeys(
      item,
      ["caseId", "sessionIds", "events", "eventNames", "surfaces", "durationMs", "outcome"],
      [],
      "ANALYSIS_CASES_INVALID",
    );
    const caseId = expectString(workflowCase.caseId, 320, "ANALYSIS_CASES_INVALID");
    if (seen.has(caseId)) fail("ANALYSIS_CASES_INVALID");
    seen.add(caseId);
    for (const sessionId of expectArray(workflowCase.sessionIds, 10_000, "ANALYSIS_CASES_INVALID")) {
      expectIdentifier(sessionId, "ANALYSIS_CASES_INVALID");
      if (!sessionIds.has(sessionId)) fail("ANALYSIS_CASES_INVALID");
    }
    for (const event of expectArray(workflowCase.events, 1_000_000, "ANALYSIS_CASES_INVALID")) {
      const candidate = expectObject(event, "ANALYSIS_CASES_INVALID");
      if (typeof candidate.eventId !== "string" || !eventIds.has(candidate.eventId)) {
        fail("ANALYSIS_CASES_INVALID");
      }
    }
    for (const name of expectArray(workflowCase.eventNames, 1_000_000, "ANALYSIS_CASES_INVALID")) {
      expectString(name, 160, "ANALYSIS_CASES_INVALID");
    }
    for (const surface of expectArray(workflowCase.surfaces, 1_000_000, "ANALYSIS_CASES_INVALID")) {
      expectString(surface, 320, "ANALYSIS_CASES_INVALID");
    }
    expectFiniteNumber(workflowCase.durationMs, "ANALYSIS_CASES_INVALID");
    if (!new Set(["succeeded", "failed", "abandoned", "unknown"]).has(workflowCase.outcome)) {
      fail("ANALYSIS_CASES_INVALID");
    }
  }
  return cases.length;
}

function validateWorkflowVariants(value) {
  const variants = expectArray(value, 100_000, "ANALYSIS_VARIANTS_INVALID");
  for (const item of variants) {
    const variant = exactKeys(
      item,
      ["signature", "eventNames", "caseCount", "sessionCount", "averageDurationMs", "outcomes"],
      [],
      "ANALYSIS_VARIANTS_INVALID",
    );
    expectString(variant.signature, 32_000, "ANALYSIS_VARIANTS_INVALID");
    for (const name of expectArray(variant.eventNames, 10_000, "ANALYSIS_VARIANTS_INVALID")) {
      expectString(name, 160, "ANALYSIS_VARIANTS_INVALID");
    }
    expectInteger(variant.caseCount, "ANALYSIS_VARIANTS_INVALID");
    expectInteger(variant.sessionCount, "ANALYSIS_VARIANTS_INVALID");
    expectFiniteNumber(variant.averageDurationMs, "ANALYSIS_VARIANTS_INVALID");
    const outcomes = exactKeys(
      variant.outcomes,
      ["succeeded", "failed", "abandoned", "unknown"],
      [],
      "ANALYSIS_VARIANTS_INVALID",
    );
    for (const count of Object.values(outcomes)) {
      expectInteger(count, "ANALYSIS_VARIANTS_INVALID");
    }
  }
  return variants.length;
}

function validateMetricReport(value, context) {
  const report = exactKeys(
    value,
    ["schemaVersion", "appId", "manifestHash", "generatedAt", "window", "dataOrigin", "totals", "values"],
    [],
    "ANALYSIS_METRICS_INVALID",
  );
  if (
    report.schemaVersion !== "living.metric-report/v1" ||
    report.appId !== context.appId ||
    report.manifestHash !== context.manifest.contentHash
  ) {
    fail("ANALYSIS_METRICS_INVALID");
  }
  expectIsoDate(report.generatedAt, "ANALYSIS_METRICS_INVALID");
  const window = exactKeys(report.window, ["from", "to"], [], "ANALYSIS_METRICS_INVALID");
  expectIsoDate(window.from, "ANALYSIS_METRICS_INVALID");
  expectIsoDate(window.to, "ANALYSIS_METRICS_INVALID");
  if (!new Set(["observed", "synthetic", "mixed"]).has(report.dataOrigin)) {
    fail("ANALYSIS_METRICS_INVALID");
  }
  const totals = exactKeys(
    report.totals,
    ["events", "sessions", "cases", "variants"],
    [],
    "ANALYSIS_METRICS_INVALID",
  );
  for (const count of Object.values(totals)) {
    expectInteger(count, "ANALYSIS_METRICS_INVALID");
  }
  const values = expectArray(report.values, 10_000, "ANALYSIS_METRICS_INVALID");
  const scopeKeys = new Set();
  const unitAggregates = new Map();
  let productScopedValues = 0;
  let routeScopedValues = 0;
  for (const item of values) {
    const metric = exactKeys(
      item,
      ["id", "unit", "value", "samples"],
      ["productNodeId", "routeNodeId", "viewportClass"],
      "ANALYSIS_METRICS_INVALID",
    );
    const metricId = expectIdentifier(metric.id, "ANALYSIS_METRICS_INVALID");
    if (!new Set(["count", "milliseconds", "pixels", "ratio"]).has(metric.unit)) {
      fail("ANALYSIS_METRICS_INVALID");
    }
    if (typeof metric.value !== "number" || !Number.isFinite(metric.value)) {
      fail("ANALYSIS_METRICS_INVALID");
    }
    expectInteger(metric.samples, "ANALYSIS_METRICS_INVALID");
    let productNodeId = "";
    if (metric.productNodeId !== undefined) {
      productNodeId = expectIdentifier(metric.productNodeId, "ANALYSIS_METRICS_INVALID");
      if (!context.manifest.nodeById.has(productNodeId)) fail("ANALYSIS_METRICS_INVALID");
      productScopedValues += 1;
    }
    let routeNodeId = "";
    if (metric.routeNodeId !== undefined) {
      routeNodeId = expectIdentifier(metric.routeNodeId, "ANALYSIS_METRICS_INVALID");
      const route = context.manifest.nodeById.get(routeNodeId);
      if (route?.kind !== "route") fail("ANALYSIS_METRICS_INVALID");
      routeScopedValues += 1;
    }
    if (
      metric.viewportClass !== undefined &&
      !new Set(["small", "medium", "large"]).has(metric.viewportClass)
    ) {
      fail("ANALYSIS_METRICS_INVALID");
    }
    const scopeKey = JSON.stringify([
      metricId,
      productNodeId,
      routeNodeId,
      metric.viewportClass ?? "",
    ]);
    if (scopeKeys.has(scopeKey)) fail("ANALYSIS_METRICS_INVALID");
    scopeKeys.add(scopeKey);

    const aggregate = unitAggregates.get(metric.unit) ?? {
      metricIds: new Set(),
      valueCount: 0,
      samples: 0,
    };
    aggregate.metricIds.add(metricId);
    aggregate.valueCount += 1;
    aggregate.samples += metric.samples;
    unitAggregates.set(metric.unit, aggregate);
  }
  return {
    totals,
    metricSummary: {
      values: values.length,
      productScopedValues,
      routeScopedValues,
      units: [...unitAggregates.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([unit, aggregate]) => ({
          unit,
          metricCount: aggregate.metricIds.size,
          valueCount: aggregate.valueCount,
          samples: aggregate.samples,
        })),
    },
  };
}

function validateEvidenceRecords(value, eventIds, chainHead) {
  const records = expectArray(value, 1_000_000, "ANALYSIS_RECORDS_INVALID");
  for (const item of records) {
    const record = exactKeys(
      item,
      ["schemaVersion", "acceptedAt", "previousRecordHash", "batchHash", "recordHash", "batch"],
      [],
      "ANALYSIS_RECORDS_INVALID",
    );
    if (record.schemaVersion !== "living.evidence-batch/v1") fail("ANALYSIS_RECORDS_INVALID");
    expectIsoDate(record.acceptedAt, "ANALYSIS_RECORDS_INVALID");
    if (record.previousRecordHash !== null) expectHash(record.previousRecordHash, "ANALYSIS_RECORDS_INVALID");
    expectHash(record.batchHash, "ANALYSIS_RECORDS_INVALID");
    expectHash(record.recordHash, "ANALYSIS_RECORDS_INVALID");
    const batch = exactKeys(record.batch, ["schemaVersion", "sequence", "events"], [], "ANALYSIS_RECORDS_INVALID");
    if (batch.schemaVersion !== "living.event-batch/v1") fail("ANALYSIS_RECORDS_INVALID");
    expectInteger(batch.sequence, "ANALYSIS_RECORDS_INVALID");
    for (const event of expectArray(batch.events, 100, "ANALYSIS_RECORDS_INVALID")) {
      const candidate = expectObject(event, "ANALYSIS_RECORDS_INVALID");
      if (typeof candidate.eventId !== "string" || !eventIds.has(candidate.eventId)) {
        fail("ANALYSIS_RECORDS_INVALID");
      }
    }
  }
  if (records.length > 0 && records.at(-1).recordHash !== chainHead) {
    fail("ANALYSIS_CHAIN_INVALID");
  }
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortedCounts(map) {
  return [...map.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, count]) => ({ family, count }));
}

function aggregateMotifs(groupedSequences) {
  const motifs = new Map();
  for (const sequence of groupedSequences.values()) {
    for (let index = 0; index + 1 < sequence.length; index += 1) {
      increment(motifs, JSON.stringify([sequence[index], sequence[index + 1]]));
    }
  }
  return motifs;
}

function parseAnalysis(source, manifest) {
  const parsed = parseJsonSource(source, "ANALYSIS_JSON_INVALID");
  const analysis = exactKeys(
    parsed.value,
    ["records", "events", "workflowCases", "workflowVariants", "metricReport", "opportunity", "chainHead"],
    [],
    "ANALYSIS_SHAPE_INVALID",
  );
  const chainHead = expectHash(analysis.chainHead, "ANALYSIS_CHAIN_INVALID");
  if (analysis.opportunity !== null) {
    expectObject(analysis.opportunity, "ANALYSIS_OPPORTUNITY_INVALID");
  }

  const rawEvents = expectArray(analysis.events, 10_000_000, "ANALYSIS_EVENTS_INVALID");
  const events = [];
  const eventIds = new Set();
  const sessionIds = new Set();
  const sessionSequences = new Set();
  const context = { appId: manifest.appId, manifest };
  for (const value of rawEvents) {
    const event = validateEvent(value, context);
    if (eventIds.has(event.eventId)) fail("ANALYSIS_EVENT_DUPLICATE");
    eventIds.add(event.eventId);
    sessionIds.add(event.sessionId);
    const sequenceKey = `${event.sessionId}\u0000${event.sequence}`;
    if (sessionSequences.has(sequenceKey)) fail("ANALYSIS_SEQUENCE_DUPLICATE");
    sessionSequences.add(sequenceKey);
    events.push(event);
  }

  const caseCount = validateWorkflowCases(analysis.workflowCases, eventIds, sessionIds);
  const variantCount = validateWorkflowVariants(analysis.workflowVariants);
  const { totals, metricSummary } = validateMetricReport(analysis.metricReport, context);
  validateEvidenceRecords(analysis.records, eventIds, chainHead);
  if (
    totals.events !== events.length ||
    totals.sessions !== sessionIds.size ||
    totals.cases !== caseCount ||
    totals.variants !== variantCount
  ) {
    fail("ANALYSIS_TOTALS_MISMATCH");
  }

  const routeCounts = new Map();
  const actionCounts = new Map();
  const actionSequences = new Map();
  const ordered = [...events].sort(
    (left, right) =>
      left.sessionId.localeCompare(right.sessionId) ||
      Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
      left.sequence - right.sequence ||
      left.eventId.localeCompare(right.eventId),
  );
  for (const event of ordered) {
    if (event.routeFamily !== undefined) increment(routeCounts, event.routeFamily);
    if (event.actionFamily !== undefined) {
      increment(actionCounts, event.actionFamily);
      const sequence = actionSequences.get(event.sessionId) ?? [];
      sequence.push(event.actionFamily);
      actionSequences.set(event.sessionId, sequence);
    }
  }

  return {
    buffer: parsed.buffer,
    counts: {
      events: totals.events,
      sessions: totals.sessions,
      cases: totals.cases,
      variants: totals.variants,
    },
    routeCounts,
    actionCounts,
    motifs: aggregateMotifs(actionSequences),
    metricSummary,
  };
}

function dynamicFamilyMatches(family, target) {
  const wildcard = family.indexOf("*");
  if (wildcard === -1) return family === target;
  const prefix = family.slice(0, wildcard);
  const suffix = family.slice(wildcard + 1);
  return (
    target.length > prefix.length + suffix.length &&
    target.startsWith(prefix) &&
    target.endsWith(suffix)
  );
}

export function canonicalizeSimulatorTargetFamily(target, manifestActionFamilies = []) {
  if (typeof target !== "string" || !SIMULATOR_TARGET_PATTERN.test(target)) return null;
  const normalized = target.toLowerCase();
  const candidates = [...manifestActionFamilies]
    .filter((family) => typeof family === "string" && ACTION_FAMILY_PATTERN.test(family))
    .sort((left, right) => {
      const leftStatic = left.includes("*") ? 0 : 1;
      const rightStatic = right.includes("*") ? 0 : 1;
      return rightStatic - leftStatic || right.length - left.length || left.localeCompare(right);
    });
  for (const family of candidates) {
    if (dynamicFamilyMatches(family, normalized)) return family;
  }
  for (const prefix of KNOWN_DYNAMIC_TARGET_PREFIXES) {
    if (normalized.length > prefix.length && normalized.startsWith(prefix)) {
      return `${prefix}*`;
    }
  }
  return null;
}

function compileRouteMatcher(route) {
  if (route === "/") return { route, regex: /^\/$/, staticSegments: 0 };
  const segments = route.split("/").slice(1);
  let staticSegments = 0;
  const patterns = segments.map((segment) => {
    if (
      segment === "*" ||
      segment.startsWith(":") ||
      /^\[\[?\.\.\..+\]\]?$/.test(segment)
    ) {
      return ".+";
    }
    if (/^\[[^\]]+\]$/.test(segment)) return "[^/]+";
    staticSegments += 1;
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return {
    route,
    regex: new RegExp(`^/${patterns.join("/")}/?$`),
    staticSegments,
  };
}

function createRouteResolver(routeFamilies) {
  const matchers = routeFamilies
    .map(compileRouteMatcher)
    .sort(
      (left, right) =>
        right.staticSegments - left.staticSegments ||
        right.route.length - left.route.length ||
        left.route.localeCompare(right.route),
    );
  return (page) => {
    if (
      typeof page !== "string" ||
      page.length === 0 ||
      page.length > 512 ||
      page.includes("?") ||
      page.includes("#") ||
      page.includes("\\") ||
      page.includes("//") ||
      !page.startsWith("/")
    ) {
      return null;
    }
    return matchers.find((matcher) => matcher.regex.test(page))?.route ?? null;
  };
}

function validateSimulatorBase(value) {
  const baseRequired = [
    "v",
    "runId",
    "mode",
    "scenario",
    "sessionId",
    "caseId",
    "userId",
    "persona",
    "seq",
    "at",
    "t",
    "type",
  ];
  const type = isPlainObject(value) ? value.type : undefined;
  if (!SIMULATOR_TYPES.has(type)) fail("SIM_TRACE_RECORD_INVALID");
  const typeFields = {
    action: ["name", "action", "page", "durationMs", "outcome", "attempt"],
    retry: ["name", "attempt", "reason"],
    error: ["name", "reason", "recoverable"],
    session_start: [],
    session_end: ["outcome", "durationMs", "actions", "retries", "errors"],
  }[type];
  const optional = type === "action"
    ? ["cohortMember", "target", "detail"]
    : type === "session_end"
      ? ["cohortMember", "abandonedAt"]
      : ["cohortMember"];
  const record = exactKeys(value, [...baseRequired, ...typeFields], optional, "SIM_TRACE_RECORD_INVALID");
  if (record.v !== 1) fail("SIM_TRACE_RECORD_INVALID");
  const runId = expectString(record.runId, 320, "SIM_TRACE_RECORD_INVALID");
  const sessionId = expectString(record.sessionId, 320, "SIM_TRACE_RECORD_INVALID");
  const caseId = expectString(record.caseId, 320, "SIM_TRACE_RECORD_INVALID");
  expectString(record.mode, 64, "SIM_TRACE_RECORD_INVALID");
  expectString(record.scenario, 320, "SIM_TRACE_RECORD_INVALID");
  expectString(record.userId, 320, "SIM_TRACE_RECORD_INVALID");
  expectString(record.persona, 160, "SIM_TRACE_RECORD_INVALID");
  const seq = expectInteger(record.seq, "SIM_TRACE_RECORD_INVALID");
  expectIsoDate(record.at, "SIM_TRACE_RECORD_INVALID");
  expectFiniteNumber(record.t, "SIM_TRACE_RECORD_INVALID");
  if (record.cohortMember !== undefined) expectString(record.cohortMember, 320, "SIM_TRACE_RECORD_INVALID");
  return { record, type, runId, sessionId, caseId, seq };
}

function parseSimulatorTraces(source, manifest) {
  const buffer = sourceBuffer(source, "SIM_TRACE_INPUT_INVALID");
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const routeForPage = createRouteResolver(manifest.routeFamilies);
  const sessionIds = new Set();
  const caseIds = new Set();
  const sequenceKeys = new Set();
  const routeCounts = new Map();
  const actionCounts = new Map();
  const actionSequences = new Map();
  const exclusions = {
    fill: 0,
    read: 0,
    bookkeeping: 0,
    missingTarget: 0,
    unmappedTarget: 0,
  };
  let records = 0;
  let includedActions = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.trim().length === 0) continue;
    if (Buffer.byteLength(rawLine, "utf8") > MAX_TRACE_LINE_BYTES) {
      fail("SIM_TRACE_LINE_TOO_LARGE");
    }
    let value;
    try {
      value = JSON.parse(rawLine);
    } catch {
      fail("SIM_TRACE_JSON_INVALID");
    }
    const { record, type, runId, sessionId, caseId, seq } = validateSimulatorBase(value);
    records += 1;
    const internalSessionKey = `${runId}\u0000${sessionId}`;
    const internalCaseKey = `${runId}\u0000${caseId}`;
    const sequenceKey = `${internalSessionKey}\u0000${seq}`;
    if (sequenceKeys.has(sequenceKey)) fail("SIM_TRACE_SEQUENCE_DUPLICATE");
    sequenceKeys.add(sequenceKey);
    sessionIds.add(internalSessionKey);
    caseIds.add(internalCaseKey);

    if (type !== "action") {
      exclusions.bookkeeping += 1;
      if (type === "retry") {
        expectString(record.name, 320, "SIM_TRACE_RECORD_INVALID");
        expectInteger(record.attempt, "SIM_TRACE_RECORD_INVALID");
        expectString(record.reason, 2_000, "SIM_TRACE_RECORD_INVALID");
      } else if (type === "error") {
        expectString(record.name, 320, "SIM_TRACE_RECORD_INVALID");
        expectString(record.reason, 2_000, "SIM_TRACE_RECORD_INVALID");
        expectBoolean(record.recoverable, "SIM_TRACE_RECORD_INVALID");
      } else if (type === "session_end") {
        if (!new Set(["completed", "abandoned", "error"]).has(record.outcome)) {
          fail("SIM_TRACE_RECORD_INVALID");
        }
        expectFiniteNumber(record.durationMs, "SIM_TRACE_RECORD_INVALID");
        expectInteger(record.actions, "SIM_TRACE_RECORD_INVALID");
        expectInteger(record.retries, "SIM_TRACE_RECORD_INVALID");
        expectInteger(record.errors, "SIM_TRACE_RECORD_INVALID");
        if (record.abandonedAt !== undefined) expectString(record.abandonedAt, 320, "SIM_TRACE_RECORD_INVALID");
      }
      continue;
    }

    expectString(record.name, 320, "SIM_TRACE_RECORD_INVALID");
    if (!PARITY_ACTIONS.has(record.action) && !NON_PARITY_ACTIONS.has(record.action)) {
      fail("SIM_TRACE_RECORD_INVALID");
    }
    expectFiniteNumber(record.durationMs, "SIM_TRACE_RECORD_INVALID");
    if (!new Set(["ok", "failed", "blocked"]).has(record.outcome)) {
      fail("SIM_TRACE_RECORD_INVALID");
    }
    expectInteger(record.attempt, "SIM_TRACE_RECORD_INVALID");
    if (record.target !== undefined) expectString(record.target, 256, "SIM_TRACE_RECORD_INVALID");
    if (record.page !== undefined) expectString(record.page, 512, "SIM_TRACE_RECORD_INVALID");
    if (record.detail !== undefined) expectObject(record.detail, "SIM_TRACE_RECORD_INVALID");

    const route = routeForPage(record.page);
    if (route !== null) increment(routeCounts, route);
    if (NON_PARITY_ACTIONS.has(record.action)) {
      exclusions[record.action] += 1;
      continue;
    }
    if (record.target === undefined) {
      exclusions.missingTarget += 1;
      continue;
    }
    const family = canonicalizeSimulatorTargetFamily(record.target, manifest.actionFamilies);
    if (family === null) {
      exclusions.unmappedTarget += 1;
      continue;
    }
    includedActions += 1;
    increment(actionCounts, family);
    const sequence = actionSequences.get(internalSessionKey) ?? [];
    sequence.push({ family, seq });
    actionSequences.set(internalSessionKey, sequence);
  }

  if (records === 0) fail("SIM_TRACE_EMPTY");
  const orderedSequences = new Map(
    [...actionSequences.entries()].map(([key, sequence]) => [
      key,
      sequence.sort((left, right) => left.seq - right.seq).map((item) => item.family),
    ]),
  );
  return {
    buffer,
    counts: {
      records,
      sessions: sessionIds.size,
      cases: caseIds.size,
      includedActions,
    },
    routeCounts,
    actionCounts,
    motifs: aggregateMotifs(orderedSequences),
    exclusions,
  };
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(6));
}

function coverage(primary, groundTruth) {
  const matched = [...groundTruth.keys()]
    .filter((family) => primary.has(family))
    .sort()
    .map((family) => ({
      family,
      primaryCount: primary.get(family),
      groundTruthCount: groundTruth.get(family),
      matchedCount: Math.min(primary.get(family), groundTruth.get(family)),
    }));
  return {
    primaryFamilyCount: primary.size,
    groundTruthFamilyCount: groundTruth.size,
    matchedFamilyCount: matched.length,
    groundTruthCoveredRatio: ratio(matched.length, groundTruth.size),
    matchedFamilies: matched,
  };
}

function matchedMotifs(primary, groundTruth) {
  return [...groundTruth.keys()]
    .filter((signature) => primary.has(signature))
    .sort()
    .map((signature) => ({
      signature: JSON.parse(signature),
      primaryCount: primary.get(signature),
      groundTruthCount: groundTruth.get(signature),
      matchedCount: Math.min(primary.get(signature), groundTruth.get(signature)),
    }));
}

export function compareIndependentProof({ manifestSource, analysisSource, simTraceSource }) {
  const manifest = parseManifest(manifestSource);

  // Ordering is a security boundary: finalize and summarize Living evidence first.
  const primary = parseAnalysis(analysisSource, manifest);

  // Simulator data enters only after the primary summary exists.
  const groundTruth = parseSimulatorTraces(simTraceSource, manifest);

  return {
    schemaVersion: "living.independent-proof-comparison/v1",
    inputs: {
      manifest: { sha256: sha256(manifest.buffer) },
      analysis: { sha256: sha256(primary.buffer) },
      simulatorTraces: { sha256: sha256(groundTruth.buffer) },
    },
    primaryEvidence: {
      source: "finalized-living-analysis",
      ...primary.counts,
      metricSummary: primary.metricSummary,
      routeFamilies: sortedCounts(primary.routeCounts),
      actionFamilies: sortedCounts(primary.actionCounts),
    },
    groundTruth: {
      source: "simulator-jsonl-post-analysis",
      ...groundTruth.counts,
      routeFamilies: sortedCounts(groundTruth.routeCounts),
      actionFamilies: sortedCounts(groundTruth.actionCounts),
    },
    comparison: {
      routeCoverage: coverage(primary.routeCounts, groundTruth.routeCounts),
      actionFamilyCoverage: coverage(primary.actionCounts, groundTruth.actionCounts),
      matchedMotifs: matchedMotifs(primary.motifs, groundTruth.motifs),
      intentionalExclusions: [
        {
          reason: "not-exact-action-parity",
          categories: ["fill", "read"],
          count: groundTruth.exclusions.fill + groundTruth.exclusions.read,
        },
        {
          reason: "session-bookkeeping",
          categories: ["error", "retry", "session_end", "session_start"],
          count: groundTruth.exclusions.bookkeeping,
        },
        {
          reason: "missing-action-target",
          categories: [],
          count: groundTruth.exclusions.missingTarget,
        },
        {
          reason: "target-not-manifest-mapped",
          categories: [],
          count: groundTruth.exclusions.unmappedTarget,
        },
      ],
    },
    independence: {
      statement:
        "Living analysis was finalized and summarized before simulator traces were parsed; simulator data was used only for post-analysis aggregate comparison and was not provided to the collector, workflow core, or model.",
      primaryFinalizedBeforeGroundTruth: true,
      collectorCoreOrModelReceivedSimulatorData: false,
      crossSourceIdentifierJoin: false,
      rawIdentifiersEmitted: false,
      rawDetailOrTextEmitted: false,
    },
  };
}

export function parseCliArguments(argv) {
  const allowed = new Set(["--manifest", "--analysis", "--sim-traces"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.has(flag) ||
      values.has(flag) ||
      typeof value !== "string" ||
      value.length === 0 ||
      value.startsWith("--")
    ) {
      fail("CLI_ARGUMENTS_INVALID");
    }
    values.set(flag, value);
  }
  if (values.size !== allowed.size) fail("CLI_ARGUMENTS_INVALID");
  return {
    manifest: values.get("--manifest"),
    analysis: values.get("--analysis"),
    simTraces: values.get("--sim-traces"),
  };
}

async function main() {
  let paths;
  try {
    paths = parseCliArguments(process.argv.slice(2));
  } catch (error) {
    const code = error instanceof ProofInputError ? error.code : "CLI_ARGUMENTS_INVALID";
    process.stderr.write(`Independent proof comparison failed: ${code}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    const [manifestSource, analysisSource, simTraceSource] = await Promise.all([
      readFile(paths.manifest),
      readFile(paths.analysis),
      readFile(paths.simTraces),
    ]);
    const result = compareIndependentProof({ manifestSource, analysisSource, simTraceSource });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof ProofInputError ? error.code : "INPUT_READ_FAILED";
    process.stderr.write(`Independent proof comparison failed: ${code}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
