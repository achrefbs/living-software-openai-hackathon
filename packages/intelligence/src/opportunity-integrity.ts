import type { JsonValue, Opportunity, WorkflowEvent } from "@living-software/contracts";
import {
  findBacktrackingRevisitIndexes,
  projectWorkflowCases,
  projectWorkflowJourneySteps,
  sha256,
} from "@living-software/core";

type Metric = Opportunity["signal"]["metrics"][number];
type BuiltInDetector =
  | "backtracking"
  | "correction"
  | "interaction-failure"
  | "repeated-sequence";

const BUILT_IN_DETECTORS = new Map<string, BuiltInDetector>([
  ["detector.backtracking@1.2.0", "backtracking"],
  [
    "detector.workflow-pattern.repeated-sequence@1.0.0",
    "repeated-sequence",
  ],
  ["detector.technical-friction.correction@1.0.0", "correction"],
  [
    "detector.technical-friction.interaction-failure@1.0.0",
    "interaction-failure",
  ],
]);

const TECHNICAL_REASON_CODES = [
  "minimum-cases-met",
  "explicit-technical-signals",
  "deterministic-evidence",
] as const;

const BACKTRACKING_REASON_CODES = [
  "minimum-cases-met",
  "minimum-revisits-met",
  "friction-corroborated",
  "deterministic-evidence",
] as const;

const REPEATED_SEQUENCE_CONFIG = {
  id: "detector.workflow-pattern.repeated-sequence",
  version: "1.0.0",
  minimumAffectedCases: 3,
  minimumIndependentSessions: 3,
  minimumSequenceLength: 2,
  minimumOccurrencesPerCase: 2,
  maximumSequenceLength: 64,
} as const;

const REPEATED_SEQUENCE_REASON_CODES = [
  "minimum-cases-met",
  "minimum-sessions-met",
  "repeated-sequence-observed",
  "minimized-evidence",
] as const;

function fail(detail: string): never {
  throw new Error(`Built-in Opportunity semantic integrity failed: ${detail}`);
}

function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function sameMetric(actual: Metric, expected: Metric): boolean {
  return actual.name === expected.name &&
    actual.unit === expected.unit &&
    actual.observed === expected.observed &&
    actual.comparator === expected.comparator;
}

function expectMetrics(
  actual: readonly Metric[],
  expected: readonly Metric[],
): void {
  if (
    actual.length !== expected.length ||
    actual.some((metric, index) => !sameMetric(metric, expected[index]!))
  ) {
    fail("signal metrics do not match the detector's evidence-derived metrics");
  }
}

function metric(opportunity: Opportunity, name: string): Metric {
  const candidate = opportunity.signal.metrics.find(
    (item) => item.name === name,
  );
  if (candidate === undefined) fail(`missing ${name} metric`);
  return candidate;
}

function minimumAffectedCases(opportunity: Opportunity): number {
  const candidate = metric(opportunity, "affected_cases").comparator;
  if (!Number.isSafeInteger(candidate) || candidate === undefined || candidate < 1) {
    fail("affected_cases comparator must be a positive integer");
  }
  return candidate;
}

function affectedRatio(opportunity: Opportunity, affectedCases: number): number {
  const candidate = metric(opportunity, "affected_ratio").observed;
  if (!(candidate > 0 && candidate <= 1)) {
    fail("affected_ratio must be inside (0, 1]");
  }
  const impliedCohort = affectedCases / candidate;
  const roundedCohort = Math.round(impliedCohort);
  if (
    !Number.isSafeInteger(roundedCohort) ||
    roundedCohort < affectedCases ||
    Math.abs(impliedCohort - roundedCohort) > 1e-9
  ) {
    fail("affected_ratio is not consistent with an integer source cohort");
  }
  return candidate;
}

function expectEvidenceCounts(
  opportunity: Opportunity,
  events: readonly WorkflowEvent[],
  subjectCount: number,
  occurrenceCount: number,
): void {
  if (opportunity.evidence.subjectCount !== subjectCount) {
    fail("subjectCount does not match the evidence-derived case count");
  }
  if (
    opportunity.evidence.sessionCount !==
      new Set(events.map((event) => event.sessionId)).size
  ) {
    fail("sessionCount does not match the evidence sessions");
  }
  if (opportunity.evidence.occurrenceCount !== occurrenceCount) {
    fail("occurrenceCount does not match the evidence-derived occurrences");
  }
}

function expectSampleEventIds(
  opportunity: Opportunity,
  expected: readonly string[],
): void {
  if (!sameStrings(opportunity.evidence.sampleEventIds, expected.slice(0, 256))) {
    fail("sampleEventIds do not match the detector's exact ordered sample");
  }
}

function expectExactWindow(
  opportunity: Opportunity,
  events: readonly WorkflowEvent[],
): void {
  const times = events
    .map((event) => event.occurredAt)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const from = times[0];
  const to = times.at(-1);
  if (
    from === undefined ||
    to === undefined ||
    opportunity.window.from !== from ||
    opportunity.window.to !== to ||
    opportunity.detectedAt !== to
  ) {
    fail("window and detectedAt must equal the exact evidence time bounds");
  }
}

function expectConfidence(
  opportunity: Opportunity,
  score: number,
  reasonCodes: readonly string[],
): void {
  if (
    opportunity.confidence.score !== score ||
    !sameStrings(opportunity.confidence.reasonCodes, reasonCodes)
  ) {
    fail("confidence score or reason codes do not match the detector formula");
  }
}

function expectOpportunityIdentity(opportunity: Opportunity): void {
  const identityHash = sha256({
    appId: opportunity.appId,
    configHash: opportunity.detector.configHash,
    eventSetHash: opportunity.evidence.eventSetHash,
    manifestHash: opportunity.manifestHash,
  });
  const prefix = opportunity.signal.kind === "backtracking"
    ? "opportunity.backtracking"
    : `opportunity.${opportunity.signal.kind}`;
  if (opportunity.opportunityId !== `${prefix}.${identityHash.slice(7, 19)}`) {
    fail("opportunityId does not match the detector identity inputs");
  }
}

function expectTechnicalConfig(
  opportunity: Opportunity,
  minimumCases: number,
  detector: Exclude<BuiltInDetector, "backtracking">,
): void {
  const definition = detector === "correction"
    ? {
        detectorId: "detector.technical-friction.correction",
        kind: "rework-loop",
        signals: ["correction"],
      }
    : {
        detectorId: "detector.technical-friction.interaction-failure",
        kind: "failure-cluster",
        signals: ["dead-click", "rage-click"],
      };
  const expected = sha256({
    version: opportunity.detector.version,
    minimumAffectedCases: minimumCases,
    ...definition,
  } as unknown as JsonValue);
  if (opportunity.detector.configHash !== expected) {
    fail("detector configHash does not match its declared built-in configuration");
  }
}

function validateTechnicalFriction(
  opportunity: Opportunity,
  events: readonly WorkflowEvent[],
  detector: Exclude<BuiltInDetector, "backtracking">,
): void {
  const correction = detector === "correction";
  const expectedKind = correction ? "rework-loop" : "failure-cluster";
  if (opportunity.signal.kind !== expectedKind || opportunity.signal.sequence !== undefined) {
    fail("signal kind or sequence does not match the built-in detector");
  }
  const acceptedSignals = correction
    ? new Set(["correction"])
    : new Set(["dead-click", "rage-click"]);
  const signals = events.map((event) => event.metadata.signal);
  if (
    events.some(
      (event) =>
        event.kind !== "outcome" ||
        typeof event.metadata.signal !== "string" ||
        !acceptedSignals.has(event.metadata.signal),
    )
  ) {
    fail("technical-friction evidence contains a non-signal event");
  }
  const cases = projectWorkflowCases([...events]);
  const affectedCases = cases.length;
  const minimumCases = minimumAffectedCases(opportunity);
  if (affectedCases < minimumCases) {
    fail("evidence does not meet the built-in affected-case threshold");
  }
  const ratio = affectedRatio(opportunity, affectedCases);
  const deadClicks = signals.filter((signal) => signal === "dead-click").length;
  const rageClicks = signals.filter((signal) => signal === "rage-click").length;
  const expectedMetrics: Metric[] = [
    { name: "affected_cases", unit: "count", observed: affectedCases, comparator: minimumCases },
    ...(correction
      ? [{ name: "correction_count", unit: "count" as const, observed: events.length }]
      : [
          { name: "failure_signal_count", unit: "count" as const, observed: events.length },
          { name: "dead_click_count", unit: "count" as const, observed: deadClicks },
          { name: "rage_click_count", unit: "count" as const, observed: rageClicks },
        ]),
    { name: "affected_ratio", unit: "ratio", observed: ratio },
  ];
  expectMetrics(opportunity.signal.metrics, expectedMetrics);
  expectEvidenceCounts(opportunity, events, affectedCases, events.length);
  expectSampleEventIds(
    opportunity,
    cases.flatMap((workflowCase) =>
      workflowCase.events.map((event) => event.eventId)
    ),
  );
  expectExactWindow(opportunity, events);
  expectConfidence(opportunity, Math.min(0.95, 0.55 + ratio * 0.4), TECHNICAL_REASON_CODES);
  expectTechnicalConfig(opportunity, minimumCases, detector);
  expectOpportunityIdentity(opportunity);
}

function isCorroborationEvent(event: WorkflowEvent): boolean {
  const signal = event.metadata.signal;
  return (
    event.kind === "outcome" &&
    (signal === "correction" || signal === "dead-click" || signal === "rage-click")
  ) || event.status === "failed" || event.status === "abandoned";
}

function inferBacktrackingMinimumRevisits(
  opportunity: Opportunity,
  minimumCases: number,
  perCaseRevisits: readonly number[],
): number {
  const maximumPossible = Math.min(...perCaseRevisits);
  for (let candidate = 1; candidate <= maximumPossible; candidate += 1) {
    const hash = sha256({
      id: opportunity.detector.id,
      version: opportunity.detector.version,
      minimumAffectedCases: minimumCases,
      minimumRevisitsPerCase: candidate,
    } as unknown as JsonValue);
    if (hash === opportunity.detector.configHash) return candidate;
  }
  fail("detector configHash does not match a valid built-in revisit threshold");
}

function validateBacktracking(
  opportunity: Opportunity,
  events: readonly WorkflowEvent[],
): void {
  if (opportunity.signal.kind !== "backtracking") {
    fail("signal kind does not match the built-in backtracking detector");
  }
  const cases = projectWorkflowCases([...events]);
  const analyses = cases.map((workflowCase) => {
    const journey = projectWorkflowJourneySteps(workflowCase.events);
    const revisits = findBacktrackingRevisitIndexes(journey);
    const corroboration = workflowCase.events.filter(isCorroborationEvent);
    const expectedEventIds = new Set([
      ...journey.map((step) => step.event.eventId),
      ...corroboration.map((event) => event.eventId),
    ]);
    if (
      corroboration.length === 0 ||
      expectedEventIds.size !== workflowCase.events.length ||
      workflowCase.events.some((event) => !expectedEventIds.has(event.eventId))
    ) {
      fail("backtracking evidence is not the detector's minimized corroborated event set");
    }
    return { journey, revisits, corroboration };
  });
  const affectedCases = cases.length;
  const minimumCases = minimumAffectedCases(opportunity);
  if (affectedCases < minimumCases) {
    fail("evidence does not meet the built-in affected-case threshold");
  }
  const minimumRevisits = inferBacktrackingMinimumRevisits(
    opportunity,
    minimumCases,
    analyses.map((analysis) => analysis.revisits.length),
  );
  if (analyses.some((analysis) => analysis.revisits.length < minimumRevisits)) {
    fail("an evidence case does not meet the built-in revisit threshold");
  }
  const occurrenceCount = analyses.reduce(
    (total, analysis) => total + analysis.revisits.length,
    0,
  );
  const ratio = affectedRatio(opportunity, affectedCases);
  const expectedSequence = analyses[0]?.journey.map((step) => step.event.name);
  if (
    expectedSequence === undefined ||
    opportunity.signal.sequence === undefined ||
    !sameStrings(opportunity.signal.sequence, expectedSequence)
  ) {
    fail("backtracking sequence does not match the first evidence case");
  }
  expectMetrics(opportunity.signal.metrics, [
    { name: "affected_cases", unit: "count", observed: affectedCases, comparator: minimumCases },
    { name: "revisit_count", unit: "count", observed: occurrenceCount },
    { name: "affected_ratio", unit: "ratio", observed: ratio },
  ]);
  expectEvidenceCounts(opportunity, events, affectedCases, occurrenceCount);
  expectSampleEventIds(
    opportunity,
    [...new Set(analyses.flatMap((analysis) => [
      ...analysis.corroboration.map((event) => event.eventId),
      ...analysis.revisits.map((index) => analysis.journey[index]?.event.eventId),
    ]))].filter((eventId): eventId is string => eventId !== undefined),
  );
  expectExactWindow(opportunity, events);
  expectConfidence(opportunity, Math.min(0.95, 0.5 + ratio * 0.4), BACKTRACKING_REASON_CODES);
  expectOpportunityIdentity(opportunity);
}

type RepeatedSequenceMatch = Readonly<{
  evidenceEvents: readonly WorkflowEvent[];
  occurrenceCount: number;
}>;

type RepeatedSequenceCandidate = Readonly<{
  key: string;
  sequence: readonly string[];
  matches: readonly RepeatedSequenceMatch[];
  sessions: ReadonlySet<string>;
  occurrenceCount: number;
}>;

function uniqueOrderedEvents(
  events: readonly WorkflowEvent[],
): WorkflowEvent[] {
  return [
    ...new Map(events.map((event) => [event.eventId, event])).values(),
  ].sort(
    (left, right) =>
      Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
      left.sequence - right.sequence ||
      left.eventId.localeCompare(right.eventId),
  );
}

function repeatedStepToken(
  step: ReturnType<typeof projectWorkflowJourneySteps>[number],
): string {
  return JSON.stringify([step.kind, step.nodeId, step.event.name]);
}

function repeatedSequenceCandidates(
  events: readonly WorkflowEvent[],
): RepeatedSequenceCandidate[] {
  const candidates = new Map<
    string,
    {
      sequence: readonly string[];
      matches: RepeatedSequenceMatch[];
    }
  >();

  for (const workflowCase of projectWorkflowCases([...events])) {
    const journey = projectWorkflowJourneySteps(workflowCase.events);
    const tokens = journey.map(repeatedStepToken);
    const casePatterns = new Map<
      string,
      {
        sequence: readonly string[];
        length: number;
        starts: number[];
      }
    >();
    const maximumLength = Math.min(
      REPEATED_SEQUENCE_CONFIG.maximumSequenceLength,
      Math.floor(
        journey.length /
          REPEATED_SEQUENCE_CONFIG.minimumOccurrencesPerCase,
      ),
    );

    for (
      let length = REPEATED_SEQUENCE_CONFIG.minimumSequenceLength;
      length <= maximumLength;
      length += 1
    ) {
      for (let start = 0; start + length <= journey.length; start += 1) {
        const key = JSON.stringify(tokens.slice(start, start + length));
        const existing = casePatterns.get(key);
        if (existing === undefined) {
          casePatterns.set(key, {
            sequence: journey
              .slice(start, start + length)
              .map((step) => step.event.name),
            length,
            starts: [start],
          });
        } else {
          existing.starts.push(start);
        }
      }
    }

    for (const [key, pattern] of casePatterns) {
      const acceptedStarts: number[] = [];
      let nextAvailableIndex = 0;
      for (const start of pattern.starts) {
        if (start < nextAvailableIndex) continue;
        acceptedStarts.push(start);
        nextAvailableIndex = start + pattern.length;
      }
      if (
        acceptedStarts.length <
        REPEATED_SEQUENCE_CONFIG.minimumOccurrencesPerCase
      ) {
        continue;
      }
      const evidenceEvents = uniqueOrderedEvents(
        acceptedStarts.flatMap((start) =>
          journey
            .slice(start, start + pattern.length)
            .map((step) => step.event)
        ),
      );
      const match: RepeatedSequenceMatch = {
        evidenceEvents,
        occurrenceCount: acceptedStarts.length,
      };
      const existing = candidates.get(key);
      if (existing === undefined) {
        candidates.set(key, {
          sequence: [...pattern.sequence],
          matches: [match],
        });
      } else {
        existing.matches.push(match);
      }
    }
  }

  return [...candidates.entries()].map(([key, candidate]) => {
    const evidenceEvents = candidate.matches.flatMap(
      (match) => match.evidenceEvents,
    );
    return {
      key,
      sequence: candidate.sequence,
      matches: candidate.matches,
      sessions: new Set(evidenceEvents.map((event) => event.sessionId)),
      occurrenceCount: candidate.matches.reduce(
        (total, match) => total + match.occurrenceCount,
        0,
      ),
    };
  });
}


function expectRepeatedSequenceIdentityLinkage(
  opportunity: Opportunity,
  events: readonly WorkflowEvent[],
): void {
  const eventSetHash = sha256(
    events
      .map((event) => event as unknown as JsonValue)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      ),
  );
  if (
    opportunity.evidence.eventSetHash !== eventSetHash ||
    opportunity.evidence.bundle.sha256 !== eventSetHash ||
    events.some(
      (event) =>
        event.appId !== opportunity.appId ||
        (event.product !== undefined &&
          event.product.manifestHash !== opportunity.manifestHash),
    )
  ) {
    fail("repeated-sequence evidence identity linkage is not exact");
  }
}

function validateRepeatedSequence(
  opportunity: Opportunity,
  events: readonly WorkflowEvent[],
): void {
  if (
    opportunity.signal.kind !== "repeated-sequence" ||
    opportunity.signal.sequence === undefined
  ) {
    fail("signal kind or sequence does not match the repeated-sequence detector");
  }
  const expectedConfigHash = sha256(
    REPEATED_SEQUENCE_CONFIG as unknown as JsonValue,
  );
  if (opportunity.detector.configHash !== expectedConfigHash) {
    fail("detector configHash does not match the repeated-sequence configuration");
  }
  expectRepeatedSequenceIdentityLinkage(opportunity, events);

  const candidate = repeatedSequenceCandidates(events)
    .filter(
      (item) =>
        item.matches.length >=
          REPEATED_SEQUENCE_CONFIG.minimumAffectedCases &&
        item.sessions.size >=
          REPEATED_SEQUENCE_CONFIG.minimumIndependentSessions,
    )
    .sort(
      (left, right) =>
        right.matches.length - left.matches.length ||
        right.sessions.size - left.sessions.size ||
        right.occurrenceCount - left.occurrenceCount ||
        right.sequence.length - left.sequence.length ||
        left.key.localeCompare(right.key),
    )[0];
  if (candidate === undefined) {
    fail("evidence does not contain a threshold-complete repeated sequence");
  }

  const expectedEvidenceEvents = uniqueOrderedEvents(
    candidate.matches.flatMap((match) => match.evidenceEvents),
  );
  const suppliedEvidenceEvents = uniqueOrderedEvents(events);
  if (
    suppliedEvidenceEvents.length !== events.length ||
    !sameStrings(
      suppliedEvidenceEvents.map((event) => event.eventId),
      expectedEvidenceEvents.map((event) => event.eventId),
    )
  ) {
    fail("evidence is not the detector's exact minimized repeated-sequence set");
  }
  if (!sameStrings(opportunity.signal.sequence, candidate.sequence)) {
    fail("signal sequence does not match the strongest evidence candidate");
  }

  const evidenceCaseCount = projectWorkflowCases(expectedEvidenceEvents).length;
  if (evidenceCaseCount !== candidate.matches.length) {
    fail("repeated-sequence evidence case count is inconsistent");
  }
  const affectedCaseRatio = affectedRatio(
    opportunity,
    candidate.matches.length,
  );

  expectMetrics(opportunity.signal.metrics, [
    {
      name: "affected_cases",
      unit: "count",
      observed: candidate.matches.length,
      comparator: REPEATED_SEQUENCE_CONFIG.minimumAffectedCases,
    },
    {
      name: "affected_sessions",
      unit: "count",
      observed: candidate.sessions.size,
      comparator: REPEATED_SEQUENCE_CONFIG.minimumIndependentSessions,
    },
    {
      name: "repeat_occurrences",
      unit: "count",
      observed: candidate.occurrenceCount,
    },
    {
      name: "sequence_length",
      unit: "count",
      observed: candidate.sequence.length,
    },
    {
      name: "affected_ratio",
      unit: "ratio",
      observed: affectedCaseRatio,
    },
  ]);
  expectEvidenceCounts(
    opportunity,
    expectedEvidenceEvents,
    evidenceCaseCount,
    candidate.occurrenceCount,
  );
  expectSampleEventIds(
    opportunity,
    expectedEvidenceEvents.map((event) => event.eventId),
  );
  expectExactWindow(opportunity, expectedEvidenceEvents);
  expectConfidence(
    opportunity,
    Math.min(0.9, 0.5 + affectedCaseRatio * 0.35),
    REPEATED_SEQUENCE_REASON_CODES,
  );
  expectOpportunityIdentity(opportunity);
}

/**
 * Recomputes the semantics of exact built-in detector versions before their
 * evidence can be sent to a model. Unknown detector/version pairs deliberately
 * remain contract-compatible and are handled by the generic evidence checks.
 * Minimized evidence excludes unaffected source-cohort cases, so the exact
 * affected-ratio denominator cannot be reconstructed here; this boundary can
 * still require an integer-consistent implied cohort and matching confidence.
 */
export function validateBuiltInOpportunitySemantics(
  opportunity: Opportunity,
  events: readonly WorkflowEvent[],
): void {
  const detector = BUILT_IN_DETECTORS.get(
    `${opportunity.detector.id}@${opportunity.detector.version}`,
  );
  if (detector === undefined) return;
  if (detector === "backtracking") {
    validateBacktracking(opportunity, events);
    return;
  }
  if (detector === "repeated-sequence") {
    validateRepeatedSequence(opportunity, events);
    return;
  }
  validateTechnicalFriction(opportunity, events, detector);
}
