import {
  parseOpportunity,
  type JsonValue,
  type Opportunity,
  type Sha256,
  type WorkflowEvent,
} from "@living-software/contracts";

import { sha256 } from "./canonical.js";
import {
  findBacktrackingRevisitIndexes,
  projectWorkflowCases,
  projectWorkflowJourneySteps,
} from "./workflows.js";

export interface BacktrackingDetectorConfig {
  id: string;
  version: string;
  minimumAffectedCases: number;
  minimumRevisitsPerCase: number;
}

export interface BacktrackingDetectorInput {
  events: WorkflowEvent[];
  manifestHash: Sha256;
  evidenceUri?: string;
  config?: Partial<BacktrackingDetectorConfig>;
}

export interface BacktrackingOpportunityDetection {
  readonly opportunity: Opportunity;
  /** Exact minimized event set used to derive and hash the Opportunity. */
  readonly evidenceEvents: readonly WorkflowEvent[];
}

export type OpportunityDetection = BacktrackingOpportunityDetection;

export interface TechnicalFrictionDetectorConfig {
  version: string;
  minimumAffectedCases: number;
}

export interface TechnicalFrictionDetectorInput {
  events: WorkflowEvent[];
  manifestHash: Sha256;
  evidenceUri?: string;
  config?: Partial<TechnicalFrictionDetectorConfig>;
}

const defaultConfig: BacktrackingDetectorConfig = {
  id: "detector.backtracking",
  version: "1.2.0",
  minimumAffectedCases: 3,
  minimumRevisitsPerCase: 2,
};

const defaultTechnicalFrictionConfig: TechnicalFrictionDetectorConfig = {
  version: "1.0.0",
  minimumAffectedCases: 3,
};

type TechnicalFrictionDefinition = Readonly<{
  kind: "rework-loop" | "failure-cluster";
  detectorId: string;
  signals: readonly TechnicalSignal[];
}>;

type TechnicalSignal = "correction" | "dead-click" | "rage-click";

const supportedTechnicalSignals = new Set<TechnicalSignal>([
  "correction",
  "dead-click",
  "rage-click",
]);

const technicalFrictionDefinitions: readonly TechnicalFrictionDefinition[] = [
  {
    kind: "rework-loop",
    detectorId: "detector.technical-friction.correction",
    signals: ["correction"],
  },
  {
    kind: "failure-cluster",
    detectorId: "detector.technical-friction.interaction-failure",
    signals: ["dead-click", "rage-click"],
  },
];

function dataOrigin(events: WorkflowEvent[]): "observed" | "synthetic" | "mixed" {
  const syntheticCount = events.filter(
    (event) => event.provenance.synthetic,
  ).length;
  if (syntheticCount === events.length) {
    return "synthetic";
  }
  return syntheticCount === 0 ? "observed" : "mixed";
}

function computeEventSetHash(events: readonly WorkflowEvent[]): Sha256 {
  return sha256(
    events
      .map((event) => event as unknown as JsonValue)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
  );
}

function technicalSignal(event: WorkflowEvent): TechnicalSignal | undefined {
  const signal = event.metadata.signal;
  return event.kind === "outcome" &&
    typeof signal === "string" &&
    supportedTechnicalSignals.has(signal as TechnicalSignal)
    ? signal as TechnicalSignal
    : undefined;
}

function backtrackingCorroborationEvents(
  events: readonly WorkflowEvent[],
): WorkflowEvent[] {
  return events.filter(
    (event) =>
      technicalSignal(event) !== undefined ||
      event.status === "failed" ||
      event.status === "abandoned",
  );
}

function uniqueEvents(events: readonly WorkflowEvent[]): WorkflowEvent[] {
  return [
    ...new Map(events.map((event) => [event.eventId, event])).values(),
  ].sort(
    (left, right) =>
      Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
      left.sequence - right.sequence ||
      left.eventId.localeCompare(right.eventId),
  );
}

function detectTechnicalFrictionDefinition(
  events: WorkflowEvent[],
  manifestHash: Sha256,
  evidenceUri: string | undefined,
  config: TechnicalFrictionDetectorConfig,
  definition: TechnicalFrictionDefinition,
): OpportunityDetection | null {
  const acceptedSignals = new Set<string>(definition.signals);
  const cases = projectWorkflowCases(events);
  const affected = cases
    .map((workflowCase) => ({
      workflowCase,
      signalEvents: workflowCase.events.filter((event) => {
        const signal = technicalSignal(event);
        return signal !== undefined && acceptedSignals.has(signal);
      }),
    }))
    .filter((item) => item.signalEvents.length > 0);

  if (affected.length < config.minimumAffectedCases) return null;

  const evidenceEvents = affected.flatMap((item) => item.signalEvents);
  const evidenceCaseCount = projectWorkflowCases(evidenceEvents).length;
  if (evidenceCaseCount !== affected.length) {
    throw new TypeError("Technical-friction evidence cases do not match the detected cases");
  }
  const orderedTimes = evidenceEvents
    .map((event) => event.occurredAt)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const evidenceHash = computeEventSetHash(evidenceEvents);
  const configHash = sha256({
    ...config,
    detectorId: definition.detectorId,
    kind: definition.kind,
    signals: definition.signals,
  } as unknown as JsonValue);
  const identityHash = sha256({
    appId: events[0]?.appId ?? "",
    configHash,
    eventSetHash: evidenceHash,
    manifestHash,
  });
  const sessions = new Set(evidenceEvents.map((event) => event.sessionId));
  const signalCounts = new Map(
    definition.signals.map((signal) => [
      signal,
      evidenceEvents.filter((event) => technicalSignal(event) === signal).length,
    ]),
  );
  const metrics: Opportunity["signal"]["metrics"] = [
    {
      name: "affected_cases",
      unit: "count",
      observed: affected.length,
      comparator: config.minimumAffectedCases,
    },
    ...(definition.kind === "rework-loop"
      ? [{
          name: "correction_count",
          unit: "count" as const,
          observed: signalCounts.get("correction") ?? 0,
        }]
      : [
          {
            name: "failure_signal_count",
            unit: "count" as const,
            observed: evidenceEvents.length,
          },
          {
            name: "dead_click_count",
            unit: "count" as const,
            observed: signalCounts.get("dead-click") ?? 0,
          },
          {
            name: "rage_click_count",
            unit: "count" as const,
            observed: signalCounts.get("rage-click") ?? 0,
          },
        ]),
    {
      name: "affected_ratio",
      unit: "ratio",
      observed: affected.length / Math.max(1, cases.length),
    },
  ];

  const opportunity = parseOpportunity({
    schemaVersion: "living.opportunity/v1",
    opportunityId: `opportunity.${definition.kind}.${identityHash.slice(7, 19)}`,
    appId: evidenceEvents[0]?.appId,
    manifestHash,
    detectedAt: orderedTimes.at(-1),
    detector: {
      id: definition.detectorId,
      version: config.version,
      configHash,
    },
    window: { from: orderedTimes[0], to: orderedTimes.at(-1) },
    signal: { kind: definition.kind, metrics },
    evidence: {
      bundle: {
        uri: evidenceUri ?? `living://evidence/${evidenceHash.slice(7)}`,
        mediaType: "application/x-ndjson",
        sha256: evidenceHash,
      },
      eventSetHash: evidenceHash,
      sampleEventIds: evidenceEvents.map((event) => event.eventId).slice(0, 256),
      subjectCount: evidenceCaseCount,
      sessionCount: sessions.size,
      occurrenceCount: evidenceEvents.length,
      dataOrigin: dataOrigin(evidenceEvents),
    },
    confidence: {
      score: Math.min(
        0.95,
        0.55 + (affected.length / Math.max(1, cases.length)) * 0.4,
      ),
      reasonCodes: [
        "minimum-cases-met",
        "explicit-technical-signals",
        "deterministic-evidence",
      ],
    },
  });

  return Object.freeze({
    opportunity,
    evidenceEvents: Object.freeze([...evidenceEvents]),
  });
}

/**
 * Converts explicit observer friction signals into independent, falsifiable
 * opportunity candidates. Correction signals represent rework; dead and rage
 * clicks represent an interaction-failure cluster. Only the exact signal
 * events cross the evidence boundary.
 */
export function detectTechnicalFrictionOpportunitiesWithEvidence({
  events,
  manifestHash,
  evidenceUri,
  config: overrides,
}: TechnicalFrictionDetectorInput): readonly OpportunityDetection[] {
  if (events.length === 0) return Object.freeze([]);
  const config = { ...defaultTechnicalFrictionConfig, ...overrides };
  return Object.freeze(
    technicalFrictionDefinitions
      .map((definition) =>
        detectTechnicalFrictionDefinition(
          events,
          manifestHash,
          evidenceUri,
          config,
          definition,
        ),
      )
      .filter((candidate): candidate is OpportunityDetection => candidate !== null),
  );
}

function metric(opportunity: Opportunity, name: string): number {
  return opportunity.signal.metrics.find((candidate) => candidate.name === name)
    ?.observed ?? 0;
}

function explicitTechnicalSignal(opportunity: Opportunity): number {
  return opportunity.signal.kind === "rework-loop" ||
    opportunity.signal.kind === "failure-cluster"
    ? 1
    : 0;
}

/** Deterministic and input-order-independent arbitration across detectors. */
export function selectOpportunityDetection(
  detections: readonly OpportunityDetection[],
): OpportunityDetection | null {
  return [...detections].sort((left, right) => {
    const byRatio = metric(right.opportunity, "affected_ratio") -
      metric(left.opportunity, "affected_ratio");
    if (byRatio !== 0) return byRatio;
    const byCases = metric(right.opportunity, "affected_cases") -
      metric(left.opportunity, "affected_cases");
    if (byCases !== 0) return byCases;
    const bySpecificity = explicitTechnicalSignal(right.opportunity) -
      explicitTechnicalSignal(left.opportunity);
    if (bySpecificity !== 0) return bySpecificity;
    const byOccurrences = right.opportunity.evidence.occurrenceCount -
      left.opportunity.evidence.occurrenceCount;
    if (byOccurrences !== 0) return byOccurrences;
    const byDetector = left.opportunity.detector.id.localeCompare(
      right.opportunity.detector.id,
    );
    return byDetector !== 0
      ? byDetector
      : left.opportunity.opportunityId.localeCompare(right.opportunity.opportunityId);
  })[0] ?? null;
}

export function detectBacktrackingOpportunityWithEvidence({
  events,
  manifestHash,
  evidenceUri,
  config: overrides,
}: BacktrackingDetectorInput): BacktrackingOpportunityDetection | null {
  if (events.length === 0) {
    return null;
  }

  const config = { ...defaultConfig, ...overrides };
  const cases = projectWorkflowCases(events);
  const affected = cases
    .map((workflowCase) => {
      const journey = projectWorkflowJourneySteps(workflowCase.events);
      return {
        workflowCase,
        journey,
        revisitIndexes: findBacktrackingRevisitIndexes(journey),
        corroborationEvents: backtrackingCorroborationEvents(
          workflowCase.events,
        ),
      };
    })
    .filter(
      (item) =>
        item.revisitIndexes.length >= config.minimumRevisitsPerCase &&
        item.corroborationEvents.length > 0,
    );

  if (affected.length < config.minimumAffectedCases) {
    return null;
  }

  const affectedEvents = affected.flatMap((item) =>
    uniqueEvents([
      ...item.journey.map((step) => step.event),
      ...item.corroborationEvents,
    ]),
  );
  const sampleEventIds = [
    ...new Set(
      affected.flatMap((item) =>
        [
          ...item.corroborationEvents.map((event) => event.eventId),
          ...item.revisitIndexes.map(
            (index) => item.journey[index]?.event.eventId,
          ),
        ],
      ),
    ),
  ].filter((eventId): eventId is string => eventId !== undefined);
  const sessions = new Set(affectedEvents.map((event) => event.sessionId));
  const evidenceCaseCount = projectWorkflowCases(affectedEvents).length;
  if (evidenceCaseCount !== affected.length) {
    throw new TypeError("Backtracking evidence cases do not match the detected cases");
  }
  const occurrenceCount = affected.reduce(
    (sum, item) => sum + item.revisitIndexes.length,
    0,
  );
  const orderedTimes = affectedEvents
    .map((event) => event.occurredAt)
    .sort((left, right) => Date.parse(left) - Date.parse(right));

  const eventSetHash = computeEventSetHash(affectedEvents);
  const configHash = sha256(config as unknown as JsonValue);
  const identityHash = sha256({
    appId: events[0]?.appId ?? "",
    configHash,
    eventSetHash,
    manifestHash,
  });
  const confidence = Math.min(
    0.95,
    0.5 + (affected.length / Math.max(1, cases.length)) * 0.4,
  );

  const opportunity = parseOpportunity({
    schemaVersion: "living.opportunity/v1",
    opportunityId: `opportunity.backtracking.${identityHash.slice(7, 19)}`,
    appId: affectedEvents[0]?.appId,
    manifestHash,
    detectedAt: orderedTimes.at(-1),
    detector: {
      id: config.id,
      version: config.version,
      configHash,
    },
    window: {
      from: orderedTimes[0],
      to: orderedTimes.at(-1),
    },
    signal: {
      kind: "backtracking",
      sequence: affected[0]?.journey.map((step) => step.event.name),
      metrics: [
        {
          name: "affected_cases",
          unit: "count",
          observed: affected.length,
          comparator: config.minimumAffectedCases,
        },
        {
          name: "revisit_count",
          unit: "count",
          observed: occurrenceCount,
        },
        {
          name: "affected_ratio",
          unit: "ratio",
          observed: affected.length / Math.max(1, cases.length),
        },
      ],
    },
    evidence: {
      bundle: {
        uri: evidenceUri ?? `living://evidence/${eventSetHash.slice(7)}`,
        mediaType: "application/x-ndjson",
        sha256: eventSetHash,
      },
      eventSetHash,
      sampleEventIds: sampleEventIds.slice(0, 256),
      subjectCount: evidenceCaseCount,
      sessionCount: sessions.size,
      occurrenceCount,
      dataOrigin: dataOrigin(affectedEvents),
    },
    confidence: {
      score: confidence,
      reasonCodes: [
        "minimum-cases-met",
        "minimum-revisits-met",
        "friction-corroborated",
        "deterministic-evidence",
      ],
    },
  });

  return Object.freeze({
    opportunity,
    evidenceEvents: Object.freeze([...affectedEvents]),
  });
}

export function detectBacktrackingOpportunity(
  input: BacktrackingDetectorInput,
): Opportunity | null {
  return detectBacktrackingOpportunityWithEvidence(input)?.opportunity ?? null;
}
