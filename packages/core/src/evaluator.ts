import {
  parseDetectorProgress,
  type DetectorProgress,
  type JsonValue,
  type Sha256,
  type WorkflowEvent,
} from "@living-software/contracts";

import { sha256 } from "./canonical.js";
import {
  detectBacktrackingOpportunityWithEvidence,
  detectRepeatedSequenceOpportunityWithEvidence,
  detectTechnicalFrictionOpportunitiesWithEvidence,
  selectOpportunityDetection,
  type BacktrackingDetectorConfig,
  type OpportunityDetection,
  type RepeatedSequenceDetectorConfig,
  type TechnicalFrictionDetectorConfig,
} from "./detectors.js";
import {
  findBacktrackingRevisitIndexes,
  projectWorkflowCases,
  projectWorkflowJourneySteps,
} from "./workflows.js";

export interface OpportunityDetectorEvaluationInput {
  readonly events: readonly WorkflowEvent[];
  readonly manifestHash: Sha256;
  readonly evidenceUri?: string;
  readonly backtrackingConfig?: Partial<BacktrackingDetectorConfig>;
  readonly repeatedSequenceConfig?: Partial<RepeatedSequenceDetectorConfig>;
  readonly technicalFrictionConfig?: Partial<TechnicalFrictionDetectorConfig>;
}

export interface OpportunityDetectorFamilyEvaluation {
  readonly progress: DetectorProgress;
  /** Exact family Opportunity and minimized evidence once its threshold is met. */
  readonly detection: OpportunityDetection | null;
}

export interface OpportunityDetectorEvaluation {
  /** Stable order: correction, interaction failure, repeated sequence, backtracking. */
  readonly families: readonly OpportunityDetectorFamilyEvaluation[];
  readonly progress: readonly DetectorProgress[];
  readonly detections: readonly OpportunityDetection[];
  readonly selected: OpportunityDetection | null;
}

const defaultBacktrackingConfig: BacktrackingDetectorConfig = {
  id: "detector.backtracking",
  version: "1.2.0",
  minimumAffectedCases: 3,
  minimumRevisitsPerCase: 2,
};

const defaultTechnicalFrictionConfig: TechnicalFrictionDetectorConfig = {
  version: "1.0.0",
  minimumAffectedCases: 3,
};

const defaultRepeatedSequenceConfig: RepeatedSequenceDetectorConfig = {
  id: "detector.workflow-pattern.repeated-sequence",
  version: "1.0.0",
  minimumAffectedCases: 3,
  minimumIndependentSessions: 3,
  minimumSequenceLength: 2,
  minimumOccurrencesPerCase: 2,
  maximumSequenceLength: 64,
};

type TechnicalSignal = "correction" | "dead-click" | "rage-click";

type TechnicalFamily = Readonly<{
  detectorId: string;
  signalKind: "rework-loop" | "failure-cluster";
  signals: readonly TechnicalSignal[];
}>;

const technicalFamilies: readonly TechnicalFamily[] = [
  {
    detectorId: "detector.technical-friction.correction",
    signalKind: "rework-loop",
    signals: ["correction"],
  },
  {
    detectorId: "detector.technical-friction.interaction-failure",
    signalKind: "failure-cluster",
    signals: ["dead-click", "rage-click"],
  },
];

const supportedTechnicalSignals = new Set<TechnicalSignal>([
  "correction",
  "dead-click",
  "rage-click",
]);

function assertPositiveSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
}

function resolvedBacktrackingConfig(
  overrides: Partial<BacktrackingDetectorConfig> | undefined,
): BacktrackingDetectorConfig {
  const config = { ...defaultBacktrackingConfig, ...overrides };
  assertPositiveSafeInteger(config.minimumAffectedCases, "minimumAffectedCases");
  assertPositiveSafeInteger(config.minimumRevisitsPerCase, "minimumRevisitsPerCase");
  return config;
}

function resolvedTechnicalConfig(
  overrides: Partial<TechnicalFrictionDetectorConfig> | undefined,
): TechnicalFrictionDetectorConfig {
  const config = { ...defaultTechnicalFrictionConfig, ...overrides };
  assertPositiveSafeInteger(config.minimumAffectedCases, "minimumAffectedCases");
  return config;
}

function resolvedRepeatedSequenceConfig(
  overrides: Partial<RepeatedSequenceDetectorConfig> | undefined,
): RepeatedSequenceDetectorConfig {
  const config = { ...defaultRepeatedSequenceConfig, ...overrides };
  assertPositiveSafeInteger(config.minimumAffectedCases, "minimumAffectedCases");
  assertPositiveSafeInteger(
    config.minimumIndependentSessions,
    "minimumIndependentSessions",
  );
  assertPositiveSafeInteger(config.minimumSequenceLength, "minimumSequenceLength");
  assertPositiveSafeInteger(
    config.minimumOccurrencesPerCase,
    "minimumOccurrencesPerCase",
  );
  assertPositiveSafeInteger(config.maximumSequenceLength, "maximumSequenceLength");
  if (config.minimumSequenceLength < 2) {
    throw new TypeError("minimumSequenceLength must be at least 2");
  }
  if (config.minimumOccurrencesPerCase < 2) {
    throw new TypeError("minimumOccurrencesPerCase must be at least 2");
  }
  if (config.minimumSequenceLength > config.maximumSequenceLength) {
    throw new TypeError(
      "minimumSequenceLength must not exceed maximumSequenceLength",
    );
  }
  return config;
}

function technicalSignal(event: WorkflowEvent): TechnicalSignal | undefined {
  const signal = event.metadata.signal;
  return event.kind === "outcome" &&
    typeof signal === "string" &&
    supportedTechnicalSignals.has(signal as TechnicalSignal)
    ? signal as TechnicalSignal
    : undefined;
}

function familyDetection(
  detections: readonly OpportunityDetection[],
  detectorId: string,
): OpportunityDetection | null {
  return detections.find(
    (candidate) => candidate.opportunity.detector.id === detectorId,
  ) ?? null;
}

function validateFamilyEvaluation(
  evaluation: OpportunityDetectorFamilyEvaluation,
): OpportunityDetectorFamilyEvaluation {
  const { progress, detection } = evaluation;
  if ((detection !== null) !== progress.thresholdMet) {
    throw new TypeError("Detector progress and Opportunity threshold disagree");
  }
  if (
    detection !== null &&
    (detection.opportunity.detector.id !== progress.detectorId ||
      detection.opportunity.detector.version !== progress.detectorVersion ||
      detection.opportunity.detector.configHash !== progress.configHash)
  ) {
    throw new TypeError("Detector progress does not match its exact Opportunity identity");
  }
  return Object.freeze(evaluation);
}

function evaluateTechnicalFamily(
  events: WorkflowEvent[],
  config: TechnicalFrictionDetectorConfig,
  family: TechnicalFamily,
  detections: readonly OpportunityDetection[],
): OpportunityDetectorFamilyEvaluation {
  const cases = projectWorkflowCases(events);
  const acceptedSignals = new Set<TechnicalSignal>(family.signals);
  const affected = cases.map((workflowCase) =>
    workflowCase.events.filter((event) => {
      const signal = technicalSignal(event);
      return signal !== undefined && acceptedSignals.has(signal);
    })
  ).filter((signalEvents) => signalEvents.length > 0);
  const occurrenceCount = affected.reduce(
    (total, signalEvents) => total + signalEvents.length,
    0,
  );
  const configHash = sha256({
    ...config,
    detectorId: family.detectorId,
    kind: family.signalKind,
    signals: family.signals,
  } as unknown as JsonValue);
  const progress = Object.freeze(parseDetectorProgress({
    schemaVersion: "living.detector-progress/v1",
    detectorId: family.detectorId,
    detectorVersion: config.version,
    configHash,
    signalKind: family.signalKind,
    affectedCases: affected.length,
    minimumAffectedCases: config.minimumAffectedCases,
    totalCases: cases.length,
    occurrenceCount,
    thresholdMet: affected.length >= config.minimumAffectedCases,
  }));
  return validateFamilyEvaluation({
    progress,
    detection: familyDetection(detections, family.detectorId),
  });
}

function evaluateBacktrackingFamily(
  events: WorkflowEvent[],
  config: BacktrackingDetectorConfig,
  detection: OpportunityDetection | null,
): OpportunityDetectorFamilyEvaluation {
  const cases = projectWorkflowCases(events);
  const affected = cases.map((workflowCase) => {
    const journey = projectWorkflowJourneySteps(workflowCase.events);
    const revisits = findBacktrackingRevisitIndexes(journey);
    const corroborated = workflowCase.events.some((event) =>
      technicalSignal(event) !== undefined ||
      event.status === "failed" ||
      event.status === "abandoned"
    );
    return { revisits, corroborated };
  }).filter((candidate) =>
    candidate.revisits.length >= config.minimumRevisitsPerCase &&
    candidate.corroborated
  );
  const occurrenceCount = affected.reduce(
    (total, candidate) => total + candidate.revisits.length,
    0,
  );
  const progress = Object.freeze(parseDetectorProgress({
    schemaVersion: "living.detector-progress/v1",
    detectorId: config.id,
    detectorVersion: config.version,
    configHash: sha256(config as unknown as JsonValue),
    signalKind: "backtracking",
    affectedCases: affected.length,
    minimumAffectedCases: config.minimumAffectedCases,
    totalCases: cases.length,
    occurrenceCount,
    thresholdMet: affected.length >= config.minimumAffectedCases,
    minimumRevisitsPerCase: config.minimumRevisitsPerCase,
  }));
  return validateFamilyEvaluation({ progress, detection });
}

function opportunityMetric(
  detection: OpportunityDetection | null,
  name: string,
): number {
  return detection?.opportunity.signal.metrics.find(
    (candidate) => candidate.name === name,
  )?.observed ?? 0;
}

function evaluateRepeatedSequenceFamily(
  events: WorkflowEvent[],
  manifestHash: Sha256,
  evidenceUri: string | undefined,
  config: RepeatedSequenceDetectorConfig,
  detection: OpportunityDetection | null,
): OpportunityDetectorFamilyEvaluation {
  const progressProbe = detectRepeatedSequenceOpportunityWithEvidence({
    events,
    manifestHash,
    ...(evidenceUri === undefined ? {} : { evidenceUri }),
    config: {
      ...config,
      minimumAffectedCases: 1,
      minimumIndependentSessions: 1,
    },
  });
  const metricSource = detection ?? progressProbe;
  const affectedCases = opportunityMetric(metricSource, "affected_cases");
  const affectedSessions = opportunityMetric(metricSource, "affected_sessions");
  const occurrenceCount = opportunityMetric(metricSource, "repeat_occurrences");
  const progress = Object.freeze(parseDetectorProgress({
    schemaVersion: "living.detector-progress/v1",
    detectorId: config.id,
    detectorVersion: config.version,
    configHash: sha256(config as unknown as JsonValue),
    signalKind: "repeated-sequence",
    affectedCases,
    minimumAffectedCases: config.minimumAffectedCases,
    affectedSessions,
    minimumIndependentSessions: config.minimumIndependentSessions,
    totalCases: projectWorkflowCases(events).length,
    occurrenceCount,
    thresholdMet: detection !== null,
  }));
  return validateFamilyEvaluation({ progress, detection });
}

/**
 * Runs exactly the four supported detector families and returns progress and
 * any threshold-complete Opportunities together. The evaluator is read-only,
 * deterministic, and safe to call with no events (four configured 0/3 rows).
 */
export function evaluateOpportunityDetectors({
  events,
  manifestHash,
  evidenceUri,
  backtrackingConfig: backtrackingOverrides,
  repeatedSequenceConfig: repeatedSequenceOverrides,
  technicalFrictionConfig: technicalOverrides,
}: OpportunityDetectorEvaluationInput): OpportunityDetectorEvaluation {
  const evaluatedEvents = [...events];
  const backtrackingConfig = resolvedBacktrackingConfig(backtrackingOverrides);
  const repeatedSequenceConfig = resolvedRepeatedSequenceConfig(
    repeatedSequenceOverrides,
  );
  const technicalConfig = resolvedTechnicalConfig(technicalOverrides);
  const shared = {
    events: evaluatedEvents,
    manifestHash,
    ...(evidenceUri === undefined ? {} : { evidenceUri }),
  };
  const technicalDetections = detectTechnicalFrictionOpportunitiesWithEvidence({
    ...shared,
    config: technicalConfig,
  });
  const backtrackingDetection = detectBacktrackingOpportunityWithEvidence({
    ...shared,
    config: backtrackingConfig,
  });
  const repeatedSequenceDetection =
    detectRepeatedSequenceOpportunityWithEvidence({
      ...shared,
      config: repeatedSequenceConfig,
    });
  const families = Object.freeze([
    ...technicalFamilies.map((family) =>
      evaluateTechnicalFamily(
        evaluatedEvents,
        technicalConfig,
        family,
        technicalDetections,
      )
    ),
    evaluateRepeatedSequenceFamily(
      evaluatedEvents,
      manifestHash,
      evidenceUri,
      repeatedSequenceConfig,
      repeatedSequenceDetection,
    ),
    evaluateBacktrackingFamily(
      evaluatedEvents,
      backtrackingConfig,
      backtrackingDetection,
    ),
  ]);
  const progress = Object.freeze(families.map((family) => family.progress));
  const detections = Object.freeze(families.flatMap((family) =>
    family.detection === null ? [] : [family.detection]
  ));
  return Object.freeze({
    families,
    progress,
    detections,
    selected: selectOpportunityDetection(detections),
  });
}
