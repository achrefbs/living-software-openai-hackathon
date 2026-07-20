import type { StudioSnapshot } from "@living-software/contracts";
import { sha256 } from "@living-software/cli";

import fixtureJson from "@/data/studio-fixture.json";
import type {
  Evolution,
  Opportunity,
  ProductNodeKind,
  Receipt,
  StudioDataset,
  WorkflowVariant,
} from "@/lib/studio-types";

type LegacyFixture = {
  schemaVersion: number;
  fixtureNotice: string;
  app: {
    id: string;
    name: string;
    description: string;
    environment: string;
    version: string;
    fixtureLabel: string;
    connection: "offline_fixture";
    lastObservedAt: string;
  };
  productMap: StudioDataset["productMap"] extends infer ProductMap
    ? Omit<ProductMap, "totalNodes" | "totalEdges" | "omittedNodes">
    : never;
  workflows: {
    observedCases: number;
    medianDurationSeconds: number;
    medianSteps: number;
    outcomeRate: number;
    variants: Array<
      Omit<
        WorkflowVariant,
        | "durationSeconds"
        | "durationLabel"
        | "stepCount"
        | "stepLabel"
        | "steps"
      > & {
        medianDurationSeconds: number;
        medianSteps: number;
        steps: string[];
      }
    >;
    evidenceCases: Array<{
      id: string;
      variantId: string;
      actorId: string;
      sessionId: string;
      durationSeconds: number;
      outcome: string;
      actions: string[];
    }>;
  };
  opportunities: Opportunity[];
  evolution: Evolution;
  receipts: Receipt[];
};

const fixture = fixtureJson as LegacyFixture;

function titleCase(value: string): string {
  return value
    .replaceAll(/[-_.:]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .replace(/^./u, (character) => character.toUpperCase());
}

function displayKind(kind: string): string {
  return kind === "extension-point" ? "extension point" : kind;
}

function studioNodeKind(kind: string): ProductNodeKind | undefined {
  switch (kind) {
    case "route":
    case "surface":
      return "surface";
    case "action":
      return "action";
    case "endpoint":
    case "integration":
    case "job":
    case "extension-point":
      return "api";
    case "entity":
      return "entity";
    case "test":
      return undefined;
    default:
      return undefined;
  }
}

function sourceLabel(source: {
  path: string;
  line?: number;
  symbol?: string;
}): string {
  const location = source.line === undefined ? source.path : `${source.path}:${source.line}`;
  return source.symbol === undefined ? location : `${location} · ${source.symbol}`;
}

function shortHash(value: string): string {
  return value.startsWith("sha256:") ? value.slice(7, 19) : value.slice(0, 12);
}

function hasRevisit(nodes: readonly string[]): boolean {
  const seen = new Set<string>();
  return nodes.some((node, index) => {
    const revisited = seen.has(node) && nodes[index - 1] !== node;
    seen.add(node);
    return revisited;
  });
}

function metricValue(metric: {
  observed: number;
  comparator?: number;
  unit: "count" | "milliseconds" | "ratio";
}): string {
  const format = (value: number) => {
    if (metric.unit === "ratio") return `${Math.round(value * 100)}%`;
    if (metric.unit === "milliseconds") return `${Math.round(value)} ms`;
    return String(Math.round(value * 100) / 100);
  };
  const observed = format(metric.observed);
  return metric.comparator === undefined
    ? observed
    : `${observed} · threshold ${format(metric.comparator)}`;
}

export function fixtureStudioDataset(): StudioDataset {
  const nodes = fixture.productMap.nodes;
  const edges = fixture.productMap.edges;
  return {
    schemaVersion: fixture.schemaVersion,
    notice: fixture.fixtureNotice,
    app: {
      id: fixture.app.id,
      name: fixture.app.name,
      description: fixture.app.description,
      environment: fixture.app.environment,
      version: fixture.app.version,
      connection: fixture.app.connection,
      lastObservedAt: fixture.app.lastObservedAt,
      source: {
        kind: "fixture",
        label: fixture.app.fixtureLabel,
        statusTitle: "Offline fixture",
        statusDetail: "No live host connected",
        context: "Recorded sample · not live telemetry",
        noticeTitle: "Interface development dataset.",
        notice: fixture.fixtureNotice,
        dataOrigin: "fixture",
      },
    },
    evidenceIdentity: {
      appId: fixture.app.id,
      snapshotHash: null,
      manifestHash: null,
      opportunityId: null,
      eventSetHash: null,
    },
    productMap: {
      nodes,
      edges,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      omittedNodes: 0,
    },
    workflows: {
      observedCases: fixture.workflows.observedCases,
      durationSeconds: fixture.workflows.medianDurationSeconds,
      durationLabel: "Median duration",
      steps: fixture.workflows.medianSteps,
      stepsLabel: "Median steps",
      outcomeRate: fixture.workflows.outcomeRate,
      variants: fixture.workflows.variants.map((variant) => ({
        ...variant,
        durationSeconds: variant.medianDurationSeconds,
        durationLabel: "Median time",
        stepCount: variant.medianSteps,
        stepLabel: "Median steps",
        steps: variant.steps.map((label) => ({
          id: `fixture-step:${label}`,
          label,
        })),
      })),
      evidenceCases: fixture.workflows.evidenceCases.map((evidenceCase) => ({
        id: evidenceCase.id,
        variantId: evidenceCase.variantId,
        sessionCount: 1,
        eventCount: evidenceCase.actions.length,
        durationSeconds: evidenceCase.durationSeconds,
        outcome: evidenceCase.outcome,
        actions: evidenceCase.actions,
      })),
    },
    opportunities: fixture.opportunities,
    evolution: fixture.evolution,
    receipts: fixture.receipts,
  };
}

export function studioDatasetFromSnapshot(snapshot: StudioSnapshot): StudioDataset {
  const manifest = snapshot.productManifest;
  const visibleNodes = manifest.nodes.flatMap((node) => {
    const kind = studioNodeKind(node.kind);
    const source = node.provenance.sources[0];
    if (kind === undefined || source === undefined) return [];
    return [{
      id: node.id,
      kind,
      label: node.displayName,
      description: `${titleCase(displayKind(node.kind))} captured in the versioned Product Manifest.`,
      provenance: node.provenance.origin,
      confidence: node.provenance.confidence,
      source: sourceLabel(source),
    }];
  });
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = manifest.edges
    .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      relation: edge.relation.replaceAll("-", " "),
    }));
  const labels = new Map(manifest.nodes.map((node) => [node.id, node.displayName]));
  const labelFor = (nodeId: string) => labels.get(nodeId) ?? titleCase(nodeId);
  const totalCases = snapshot.workflows.cases.length;
  const opportunityKind = snapshot.opportunity?.signal.kind;
  const variants = snapshot.workflows.variants.map((variant, index): WorkflowVariant => {
    const steps = variant.journeyNodeIds.map((nodeId) => ({
      id: nodeId,
      label: labelFor(nodeId),
    }));
    const succeeded = variant.outcomes.succeeded;
    const unsuccessful = variant.caseCount - succeeded;
    const first = steps[0]?.label ?? `Path ${index + 1}`;
    const last = steps.at(-1)?.label;
    return {
      id: variant.variantId,
      name: last === undefined || last === first ? first : `${first} → ${last}`,
      description: `${variant.caseCount} captured ${variant.caseCount === 1 ? "case follows" : "cases follow"} this ${steps.length}-step journey.`,
      cases: variant.caseCount,
      share: totalCases === 0 ? 0 : variant.caseCount / totalCases,
      durationSeconds: Math.round(variant.averageDurationMs / 1_000),
      durationLabel: "Average time",
      stepCount: steps.length,
      stepLabel: "Journey steps",
      outcomeRate: variant.caseCount === 0 ? 0 : succeeded / variant.caseCount,
      tone:
        opportunityKind === "backtracking" && hasRevisit(variant.journeyNodeIds)
          ? "friction"
          : unsuccessful > 0
            ? "watch"
            : "healthy",
      steps,
    };
  });
  const variantByCase = new Map(
    snapshot.workflows.variants.flatMap((variant) =>
      variant.caseIds.map((caseId) => [caseId, variant.variantId] as const),
    ),
  );
  const evidenceCases = snapshot.workflows.cases.map((workflowCase) => ({
    id: workflowCase.caseId,
    variantId: variantByCase.get(workflowCase.caseId) ?? "variant.unclassified",
    sessionCount: workflowCase.sessionCount,
    eventCount: workflowCase.eventCount,
    durationSeconds: Math.round(workflowCase.durationMs / 1_000),
    outcome: workflowCase.outcome,
    actions: workflowCase.journeyNodeIds.map(labelFor),
  }));
  const totalDurationMs = snapshot.workflows.cases.reduce(
    (sum, workflowCase) => sum + workflowCase.durationMs,
    0,
  );
  const totalSteps = snapshot.workflows.cases.reduce(
    (sum, workflowCase) => sum + workflowCase.journeyNodeIds.length,
    0,
  );
  const succeededCases = snapshot.workflows.cases.filter(
    (workflowCase) => workflowCase.outcome === "succeeded",
  ).length;
  const opportunities: Opportunity[] = snapshot.opportunity === undefined
    ? []
    : [{
        id: snapshot.opportunity.opportunityId,
        title: `${titleCase(snapshot.opportunity.signal.kind)} pattern detected`,
        summary:
          `${snapshot.opportunity.evidence.subjectCount} captured cases crossed the ` +
          `${snapshot.opportunity.detector.id} threshold. This is deterministic evidence, not a causal explanation.`,
        status: "detected",
        detector: snapshot.opportunity.detector.id,
        detectorVersion: snapshot.opportunity.detector.version,
        confidence: snapshot.opportunity.confidence.score,
        impact: snapshot.opportunity.confidence.score >= 0.75 ? "medium" : "low",
        affectedCases: snapshot.opportunity.evidence.subjectCount,
        evidenceRefs: [
          snapshot.opportunity.evidence.bundle.uri,
          snapshot.opportunity.evidence.eventSetHash,
        ],
        signals: snapshot.opportunity.signal.metrics.map((metric) => ({
          label: titleCase(metric.name),
          value: metricValue(metric),
        })),
        nextStep: "Request a bounded GPT-5.6 interpretation of this evidence package.",
      }];
  const sourceLabelValue = snapshot.application.dataOrigin === "synthetic"
    ? "Synthetic capture"
    : `${titleCase(snapshot.application.dataOrigin)} capture`;

  return {
    schemaVersion: 1,
    notice:
      `Validated captured analysis: ${snapshot.evidence.records} hash-linked records, ` +
      `${snapshot.evidence.events} events, chain ${shortHash(snapshot.evidence.chainHead)}.`,
    app: {
      id: snapshot.application.appId,
      name: snapshot.application.displayName,
      description: `Captured product structure and workflow evidence for ${snapshot.application.displayName}.`,
      environment: snapshot.application.environment,
      version: snapshot.application.releaseRevision,
      connection: "captured_snapshot",
      lastObservedAt: snapshot.generatedAt,
      source: {
        kind: "captured_snapshot",
        label: sourceLabelValue,
        statusTitle: "Captured snapshot",
        statusDetail: "Read-only local evidence",
        context: "Validated export · not live telemetry",
        noticeTitle: "Verified analysis snapshot.",
        notice:
          `Studio validated a local ${snapshot.application.dataOrigin} export against ` +
          `manifest ${shortHash(snapshot.application.manifestHash)}. It does not read the host live.`,
        dataOrigin: snapshot.application.dataOrigin,
      },
    },
    evidenceIdentity: {
      appId: snapshot.application.appId,
      snapshotHash: sha256(snapshot),
      manifestHash: snapshot.application.manifestHash,
      opportunityId: snapshot.opportunity?.opportunityId ?? null,
      eventSetHash: snapshot.opportunity?.evidence.eventSetHash ?? null,
    },
    productMap: {
      nodes: visibleNodes,
      edges: visibleEdges,
      totalNodes: manifest.nodes.length,
      totalEdges: manifest.edges.length,
      omittedNodes: manifest.nodes.length - visibleNodes.length,
    },
    workflows: {
      observedCases: totalCases,
      durationSeconds: totalCases === 0 ? 0 : Math.round(totalDurationMs / totalCases / 1_000),
      durationLabel: "Average duration",
      steps: totalCases === 0 ? 0 : Math.round((totalSteps / totalCases) * 10) / 10,
      stepsLabel: "Average journey steps",
      outcomeRate: totalCases === 0 ? 0 : succeededCases / totalCases,
      variants,
      evidenceCases,
    },
    opportunities,
    evolution: null,
    receipts: null,
  };
}
