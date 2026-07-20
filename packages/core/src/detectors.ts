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

const defaultConfig: BacktrackingDetectorConfig = {
  id: "detector.backtracking",
  version: "1.1.0",
  minimumAffectedCases: 3,
  minimumRevisitsPerCase: 2,
};

function dataOrigin(events: WorkflowEvent[]): "observed" | "synthetic" | "mixed" {
  const syntheticCount = events.filter(
    (event) => event.provenance.synthetic,
  ).length;
  if (syntheticCount === events.length) {
    return "synthetic";
  }
  return syntheticCount === 0 ? "observed" : "mixed";
}

export function detectBacktrackingOpportunity({
  events,
  manifestHash,
  evidenceUri,
  config: overrides,
}: BacktrackingDetectorInput): Opportunity | null {
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
      };
    })
    .filter(
      (item) =>
        item.revisitIndexes.length >= config.minimumRevisitsPerCase,
    );

  if (affected.length < config.minimumAffectedCases) {
    return null;
  }

  const affectedEvents = affected.flatMap((item) =>
    item.journey.map((step) => step.event),
  );
  const sampleEventIds = [
    ...new Set(
      affected.flatMap((item) =>
        item.revisitIndexes.map(
          (index) => item.journey[index]?.event.eventId,
        ),
      ),
    ),
  ].filter((eventId): eventId is string => eventId !== undefined);
  const sessions = new Set(
    affected.flatMap((item) => item.workflowCase.sessionIds),
  );
  const occurrenceCount = affected.reduce(
    (sum, item) => sum + item.revisitIndexes.length,
    0,
  );
  const orderedTimes = affectedEvents
    .map((event) => event.occurredAt)
    .sort((left, right) => Date.parse(left) - Date.parse(right));

  const eventSetHash = sha256(
    affectedEvents
      .map((event) => event as unknown as JsonValue)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
  );
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

  return parseOpportunity({
    schemaVersion: "living.opportunity/v1",
    opportunityId: `opportunity.backtracking.${identityHash.slice(7, 19)}`,
    appId: events[0]?.appId,
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
      subjectCount: affected.length,
      sessionCount: sessions.size,
      occurrenceCount,
      dataOrigin: dataOrigin(affectedEvents),
    },
    confidence: {
      score: confidence,
      reasonCodes: [
        "minimum-cases-met",
        "minimum-revisits-met",
        "deterministic-evidence",
      ],
    },
  });
}
