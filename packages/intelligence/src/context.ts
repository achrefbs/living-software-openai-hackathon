import type {
  MetricReport,
  Opportunity,
  ProductManifest,
  WorkflowEvent,
} from "@living-software/contracts";

import type {
  BoundedProductContext,
  BoundedProductNode,
  NormalizedBehaviorMetric,
  NormalizedEvidenceEvent,
} from "./types.js";

const NODE_LIMIT = 120;
const EDGE_LIMIT = 240;
const OPERATION_LIMIT = 64;
const EXTENSION_POINT_LIMIT = 64;
const EVENT_LIMIT = 2_048;
const METRIC_LIMIT = 10_000;
const BYTE_LIMIT = 4_000_000;
const DISPLAY_NAME_LIMIT = 120;
const REDACTED_DISPLAY_NAME = "[label unavailable]";
const UNSAFE_DISPLAY_NAME_CHARACTER = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const INSTRUCTION_LIKE_DISPLAY_NAME = [
  /\b(?:ignore|disregard|override)\b.{0,48}\b(?:instructions?|prompts?|messages?|rules?)\b/iu,
  /\b(?:system|developer|assistant)\s+(?:prompt|message|instructions?)\b/iu,
  /\b(?:follow|execute)\b.{0,24}\b(?:instructions?|prompts?|commands?)\b/iu,
] as const;

function byKey<T>(key: (value: T) => string): (left: T, right: T) => number {
  return (left, right) => key(left).localeCompare(key(right), "en");
}

function safeDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (
    trimmed.length === 0 ||
    UNSAFE_DISPLAY_NAME_CHARACTER.test(displayName) ||
    INSTRUCTION_LIKE_DISPLAY_NAME.some((pattern) => pattern.test(trimmed))
  ) {
    return REDACTED_DISPLAY_NAME;
  }
  const codePoints = [...trimmed];
  return codePoints.length <= DISPLAY_NAME_LIMIT
    ? trimmed
    : `${codePoints.slice(0, DISPLAY_NAME_LIMIT - 1).join("")}…`;
}

function eventOrder(left: WorkflowEvent, right: WorkflowEvent): number {
  return Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
    left.sequence - right.sequence || left.eventId.localeCompare(right.eventId, "en");
}

function evidenceCaseKey(event: WorkflowEvent): string {
  return event.subject === undefined
    ? JSON.stringify(["session", event.sessionId])
    : JSON.stringify([
      "subject",
      event.subject.type,
      event.subject.pseudonymousId,
    ]);
}

function allowlistedInteraction(
  event: WorkflowEvent,
): NormalizedEvidenceEvent["interaction"] {
  const interaction = event.metadata.interaction;
  return interaction === "click" || interaction === "change" ||
    interaction === "submit"
    ? interaction
    : null;
}

export function buildEvidenceAliasEntries(
  events: readonly WorkflowEvent[],
): readonly Readonly<{ alias: string; eventId: string }>[] {
  return [...events].sort(eventOrder).map((event, index) => ({
    alias: `evidence-${String(index + 1).padStart(3, "0")}`,
    eventId: event.eventId,
  }));
}

function evidenceScope(origin: Opportunity["evidence"]["dataOrigin"]): BoundedProductContext["evidenceScope"] {
  return {
    origin,
    claimScope: origin === "synthetic"
      ? "synthetic-only"
      : origin === "mixed"
        ? "mixed-evidence-only"
        : "observed-window-only",
    productionGeneralizationAllowed: false,
  };
}

function normalizedEvents(
  events: readonly WorkflowEvent[],
  sampleIds: readonly string[],
): NormalizedEvidenceEvent[] {
  const ordered = [...events].sort(eventOrder);
  if (events.length > EVENT_LIMIT) {
    throw new Error(
      `Behavior matrix exceeds the hard ${EVENT_LIMIT}-event window limit`,
    );
  }
  const aliasById = new Map(buildEvidenceAliasEntries(events).map((entry) => [entry.eventId, entry.alias]));
  const caseKeys = [...new Set(ordered.map(evidenceCaseKey))]
    .sort((left, right) => left.localeCompare(right, "en"));
  const caseAliasByKey = new Map(caseKeys.map((key, index) => [
    key,
    `case-${String(index + 1).padStart(3, "0")}`,
  ]));
  const caseStepByEvent = new Map<WorkflowEvent, number>();
  const lastStepByCaseKey = new Map<string, number>();
  for (const event of ordered) {
    const key = evidenceCaseKey(event);
    const step = (lastStepByCaseKey.get(key) ?? 0) + 1;
    lastStepByCaseKey.set(key, step);
    caseStepByEvent.set(event, step);
  }
  const samples = new Set(sampleIds);
  const selected = [
    ...ordered.filter((event) => samples.has(event.eventId)),
    ...ordered.filter((event) => !samples.has(event.eventId)),
  ].sort(eventOrder);

  return selected.map((event, ordinal) => ({
    ordinal,
    citationAlias: aliasById.get(event.eventId)!,
    caseAlias: caseAliasByKey.get(evidenceCaseKey(event))!,
    caseStep: caseStepByEvent.get(event)!,
    name: event.name,
    kind: event.kind,
    status: event.status,
    environment: event.environment,
    sequence: event.sequence,
    productNodeId: event.product?.nodeId ?? null,
    surfaceId: event.product?.surfaceId ?? null,
    durationMs: event.durationMs ?? null,
    interaction: allowlistedInteraction(event),
    source: event.provenance.source,
    synthetic: event.provenance.synthetic,
  }));
}

export function buildBehaviorMetricEntries(
  report: MetricReport | undefined,
): readonly NormalizedBehaviorMetric[] {
  if (report === undefined) return Object.freeze([]);
  if (report.values.length > METRIC_LIMIT) {
    throw new Error(
      `Behavior matrix exceeds the hard ${METRIC_LIMIT}-metric limit`,
    );
  }
  return Object.freeze(report.values.map((metric, index) => Object.freeze({
    citationName: `matrix.metric.${String(index + 1).padStart(3, "0")}`,
    id: metric.id,
    unit: metric.unit,
    value: metric.value,
    samples: metric.samples,
    productNodeId: metric.productNodeId ?? null,
    routeNodeId: metric.routeNodeId ?? null,
    viewportClass: metric.viewportClass ?? null,
  })));
}


export function boundProductContext(
  manifest: ProductManifest,
  opportunity: Opportunity,
  events: readonly WorkflowEvent[],
  metricReport?: MetricReport,
): BoundedProductContext {
  const nodeById = new Map(manifest.nodes.map((node) => [node.id, node]));
  const evidenceNodeIds = [...new Set(events.flatMap((event) =>
    event.product === undefined ? [] : [event.product.nodeId]
  ))].sort((left, right) => left.localeCompare(right, "en"));
  const missingEvidenceNodeId = evidenceNodeIds.find((id) => !nodeById.has(id));
  if (missingEvidenceNodeId !== undefined) {
    throw new Error(`Evidence-linked product node is absent from the manifest: ${missingEvidenceNodeId}`);
  }
  if (evidenceNodeIds.length === 0) {
    throw new Error("At least one evidence event must link to a product node");
  }
  if (evidenceNodeIds.length > NODE_LIMIT) {
    throw new Error("Evidence-linked product nodes exceed the hard product-context node limit");
  }

  const evidenceNodeIdSet = new Set(evidenceNodeIds);
  const neighborNodeIds = [...new Set(manifest.edges.flatMap((edge) => {
    if (evidenceNodeIdSet.has(edge.from)) return [edge.to];
    if (evidenceNodeIdSet.has(edge.to)) return [edge.from];
    return [];
  }))]
    .filter((id) => !evidenceNodeIdSet.has(id))
    .sort((left, right) => left.localeCompare(right, "en"));
  const relevantNodeIdSet = new Set([...evidenceNodeIds, ...neighborNodeIds]);
  const lexicalFillNodeIds = [...nodeById.keys()]
    .filter((id) => !relevantNodeIdSet.has(id))
    .sort((left, right) => left.localeCompare(right, "en"));
  const selectedNodeIds = [
    ...evidenceNodeIds,
    ...neighborNodeIds,
    ...lexicalFillNodeIds,
  ].slice(0, NODE_LIMIT);
  const operations = [...(manifest.hostInterface?.operations ?? [])]
    .sort(byKey((operation) => `${operation.id}@${operation.version}`))
    .slice(0, OPERATION_LIMIT)
    .map(({ id, effect, requiresUserConfirmation }) => ({ id, effect, requiresUserConfirmation }));
  const extensionPoints = [...(manifest.hostInterface?.extensionPoints ?? [])]
    .sort(byKey((point) => point.id))
    .slice(0, EXTENSION_POINT_LIMIT)
    .map(({ id, surfaceNodeId, presentation }) => ({ id, surfaceNodeId, presentation }));
  const evidenceEvents = normalizedEvents(events, opportunity.evidence.sampleEventIds);
  if (
    metricReport !== undefined &&
    (metricReport.appId !== manifest.appId ||
      metricReport.manifestHash !== manifest.contentHash)
  ) {
    throw new Error("Behavior matrix identity does not match the product manifest");
  }
  const behaviorMetrics = buildBehaviorMetricEntries(metricReport);
  const aliasById = new Map(buildEvidenceAliasEntries(events).map((entry) => [entry.eventId, entry.alias]));
  const sampleEvidenceAliases = opportunity.evidence.sampleEventIds.map((eventId) => {
    const alias = aliasById.get(eventId);
    if (alias === undefined) throw new Error("Sample evidence id is absent from the supplied events");
    return alias;
  });

  const makeContext = (): BoundedProductContext => {
    const nodes: BoundedProductNode[] = selectedNodeIds
      .map((id) => nodeById.get(id)!)
      .map((node) => ({
        id: node.id,
        kind: node.kind,
        displayName: safeDisplayName(node.displayName),
      }))
      .sort(byKey((node) => node.id));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = [...manifest.edges]
      .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .sort(byKey((edge) => `${edge.from}:${edge.relation}:${edge.to}`))
      .slice(0, EDGE_LIMIT)
      .map(({ from, to, relation }) => ({ from, to, relation }));
    const includedCount = nodes.length + edges.length + operations.length + extensionPoints.length + evidenceEvents.length + behaviorMetrics.length;
    const totalCount = manifest.nodes.length + manifest.edges.length + events.length +
      (manifest.hostInterface?.operations.length ?? 0) +
      (manifest.hostInterface?.extensionPoints.length ?? 0) + behaviorMetrics.length;
    return {
      schemaVersion: "living.intelligence-context/v1",
      appId: manifest.appId,
      manifestHash: manifest.contentHash,
      totals: {
        nodes: manifest.nodes.length,
        edges: manifest.edges.length,
        operations: manifest.hostInterface?.operations.length ?? 0,
        extensionPoints: manifest.hostInterface?.extensionPoints.length ?? 0,
        evidenceEvents: events.length,
        behaviorMetrics: behaviorMetrics.length,
      },
      included: { nodes: [...nodes], edges, operations, extensionPoints, evidenceEvents, behaviorMetrics },
      truncated: includedCount < totalCount,
      relevantProductNodeIds: selectedNodeIds
        .filter((id) => relevantNodeIdSet.has(id))
        .sort((left, right) => left.localeCompare(right, "en")),
      sampleEvidenceAliases,
      evidenceScope: evidenceScope(opportunity.evidence.dataOrigin),
    };
  };

  let context = makeContext();
  while (
    Buffer.byteLength(JSON.stringify(context), "utf8") > BYTE_LIMIT &&
    selectedNodeIds.length > evidenceNodeIds.length
  ) {
    selectedNodeIds.pop();
    context = makeContext();
  }
  if (Buffer.byteLength(JSON.stringify(context), "utf8") > BYTE_LIMIT) {
    throw new Error("Unable to construct product context within the hard byte limit");
  }
  return context;
}

export const PRODUCT_CONTEXT_LIMITS = Object.freeze({
  nodes: NODE_LIMIT,
  edges: EDGE_LIMIT,
  operations: OPERATION_LIMIT,
  extensionPoints: EXTENSION_POINT_LIMIT,
  evidenceEvents: EVENT_LIMIT,
  behaviorMetrics: METRIC_LIMIT,
  bytes: BYTE_LIMIT,
});
