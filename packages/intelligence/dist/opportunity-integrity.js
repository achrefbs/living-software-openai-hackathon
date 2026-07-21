import { findBacktrackingRevisitIndexes, projectWorkflowCases, projectWorkflowJourneySteps, sha256, } from "@living-software/core";
const BUILT_IN_DETECTORS = new Map([
    ["detector.backtracking@1.2.0", "backtracking"],
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
];
const BACKTRACKING_REASON_CODES = [
    "minimum-cases-met",
    "minimum-revisits-met",
    "friction-corroborated",
    "deterministic-evidence",
];
function fail(detail) {
    throw new Error(`Built-in Opportunity semantic integrity failed: ${detail}`);
}
function sameStrings(actual, expected) {
    return actual.length === expected.length &&
        actual.every((value, index) => value === expected[index]);
}
function sameMetric(actual, expected) {
    return actual.name === expected.name &&
        actual.unit === expected.unit &&
        actual.observed === expected.observed &&
        actual.comparator === expected.comparator;
}
function expectMetrics(actual, expected) {
    if (actual.length !== expected.length ||
        actual.some((metric, index) => !sameMetric(metric, expected[index]))) {
        fail("signal metrics do not match the detector's evidence-derived metrics");
    }
}
function metric(opportunity, name) {
    const candidate = opportunity.signal.metrics.find((item) => item.name === name);
    if (candidate === undefined)
        fail(`missing ${name} metric`);
    return candidate;
}
function minimumAffectedCases(opportunity) {
    const candidate = metric(opportunity, "affected_cases").comparator;
    if (!Number.isSafeInteger(candidate) || candidate === undefined || candidate < 1) {
        fail("affected_cases comparator must be a positive integer");
    }
    return candidate;
}
function affectedRatio(opportunity, affectedCases) {
    const candidate = metric(opportunity, "affected_ratio").observed;
    if (!(candidate > 0 && candidate <= 1)) {
        fail("affected_ratio must be inside (0, 1]");
    }
    const impliedCohort = affectedCases / candidate;
    const roundedCohort = Math.round(impliedCohort);
    if (!Number.isSafeInteger(roundedCohort) ||
        roundedCohort < affectedCases ||
        Math.abs(impliedCohort - roundedCohort) > 1e-9) {
        fail("affected_ratio is not consistent with an integer source cohort");
    }
    return candidate;
}
function expectEvidenceCounts(opportunity, events, subjectCount, occurrenceCount) {
    if (opportunity.evidence.subjectCount !== subjectCount) {
        fail("subjectCount does not match the evidence-derived case count");
    }
    if (opportunity.evidence.sessionCount !==
        new Set(events.map((event) => event.sessionId)).size) {
        fail("sessionCount does not match the evidence sessions");
    }
    if (opportunity.evidence.occurrenceCount !== occurrenceCount) {
        fail("occurrenceCount does not match the evidence-derived occurrences");
    }
}
function expectSampleEventIds(opportunity, expected) {
    if (!sameStrings(opportunity.evidence.sampleEventIds, expected.slice(0, 256))) {
        fail("sampleEventIds do not match the detector's exact ordered sample");
    }
}
function expectExactWindow(opportunity, events) {
    const times = events
        .map((event) => event.occurredAt)
        .sort((left, right) => Date.parse(left) - Date.parse(right));
    const from = times[0];
    const to = times.at(-1);
    if (from === undefined ||
        to === undefined ||
        opportunity.window.from !== from ||
        opportunity.window.to !== to ||
        opportunity.detectedAt !== to) {
        fail("window and detectedAt must equal the exact evidence time bounds");
    }
}
function expectConfidence(opportunity, score, reasonCodes) {
    if (opportunity.confidence.score !== score ||
        !sameStrings(opportunity.confidence.reasonCodes, reasonCodes)) {
        fail("confidence score or reason codes do not match the detector formula");
    }
}
function expectOpportunityIdentity(opportunity) {
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
function expectTechnicalConfig(opportunity, minimumCases, detector) {
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
    });
    if (opportunity.detector.configHash !== expected) {
        fail("detector configHash does not match its declared built-in configuration");
    }
}
function validateTechnicalFriction(opportunity, events, detector) {
    const correction = detector === "correction";
    const expectedKind = correction ? "rework-loop" : "failure-cluster";
    if (opportunity.signal.kind !== expectedKind || opportunity.signal.sequence !== undefined) {
        fail("signal kind or sequence does not match the built-in detector");
    }
    const acceptedSignals = correction
        ? new Set(["correction"])
        : new Set(["dead-click", "rage-click"]);
    const signals = events.map((event) => event.metadata.signal);
    if (events.some((event) => event.kind !== "outcome" ||
        typeof event.metadata.signal !== "string" ||
        !acceptedSignals.has(event.metadata.signal))) {
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
    const expectedMetrics = [
        { name: "affected_cases", unit: "count", observed: affectedCases, comparator: minimumCases },
        ...(correction
            ? [{ name: "correction_count", unit: "count", observed: events.length }]
            : [
                { name: "failure_signal_count", unit: "count", observed: events.length },
                { name: "dead_click_count", unit: "count", observed: deadClicks },
                { name: "rage_click_count", unit: "count", observed: rageClicks },
            ]),
        { name: "affected_ratio", unit: "ratio", observed: ratio },
    ];
    expectMetrics(opportunity.signal.metrics, expectedMetrics);
    expectEvidenceCounts(opportunity, events, affectedCases, events.length);
    expectSampleEventIds(opportunity, cases.flatMap((workflowCase) => workflowCase.events.map((event) => event.eventId)));
    expectExactWindow(opportunity, events);
    expectConfidence(opportunity, Math.min(0.95, 0.55 + ratio * 0.4), TECHNICAL_REASON_CODES);
    expectTechnicalConfig(opportunity, minimumCases, detector);
    expectOpportunityIdentity(opportunity);
}
function isCorroborationEvent(event) {
    const signal = event.metadata.signal;
    return (event.kind === "outcome" &&
        (signal === "correction" || signal === "dead-click" || signal === "rage-click")) || event.status === "failed" || event.status === "abandoned";
}
function inferBacktrackingMinimumRevisits(opportunity, minimumCases, perCaseRevisits) {
    const maximumPossible = Math.min(...perCaseRevisits);
    for (let candidate = 1; candidate <= maximumPossible; candidate += 1) {
        const hash = sha256({
            id: opportunity.detector.id,
            version: opportunity.detector.version,
            minimumAffectedCases: minimumCases,
            minimumRevisitsPerCase: candidate,
        });
        if (hash === opportunity.detector.configHash)
            return candidate;
    }
    fail("detector configHash does not match a valid built-in revisit threshold");
}
function validateBacktracking(opportunity, events) {
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
        if (corroboration.length === 0 ||
            expectedEventIds.size !== workflowCase.events.length ||
            workflowCase.events.some((event) => !expectedEventIds.has(event.eventId))) {
            fail("backtracking evidence is not the detector's minimized corroborated event set");
        }
        return { journey, revisits, corroboration };
    });
    const affectedCases = cases.length;
    const minimumCases = minimumAffectedCases(opportunity);
    if (affectedCases < minimumCases) {
        fail("evidence does not meet the built-in affected-case threshold");
    }
    const minimumRevisits = inferBacktrackingMinimumRevisits(opportunity, minimumCases, analyses.map((analysis) => analysis.revisits.length));
    if (analyses.some((analysis) => analysis.revisits.length < minimumRevisits)) {
        fail("an evidence case does not meet the built-in revisit threshold");
    }
    const occurrenceCount = analyses.reduce((total, analysis) => total + analysis.revisits.length, 0);
    const ratio = affectedRatio(opportunity, affectedCases);
    const expectedSequence = analyses[0]?.journey.map((step) => step.event.name);
    if (expectedSequence === undefined ||
        opportunity.signal.sequence === undefined ||
        !sameStrings(opportunity.signal.sequence, expectedSequence)) {
        fail("backtracking sequence does not match the first evidence case");
    }
    expectMetrics(opportunity.signal.metrics, [
        { name: "affected_cases", unit: "count", observed: affectedCases, comparator: minimumCases },
        { name: "revisit_count", unit: "count", observed: occurrenceCount },
        { name: "affected_ratio", unit: "ratio", observed: ratio },
    ]);
    expectEvidenceCounts(opportunity, events, affectedCases, occurrenceCount);
    expectSampleEventIds(opportunity, [...new Set(analyses.flatMap((analysis) => [
            ...analysis.corroboration.map((event) => event.eventId),
            ...analysis.revisits.map((index) => analysis.journey[index]?.event.eventId),
        ]))].filter((eventId) => eventId !== undefined));
    expectExactWindow(opportunity, events);
    expectConfidence(opportunity, Math.min(0.95, 0.5 + ratio * 0.4), BACKTRACKING_REASON_CODES);
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
export function validateBuiltInOpportunitySemantics(opportunity, events) {
    const detector = BUILT_IN_DETECTORS.get(`${opportunity.detector.id}@${opportunity.detector.version}`);
    if (detector === undefined)
        return;
    if (detector === "backtracking") {
        validateBacktracking(opportunity, events);
        return;
    }
    validateTechnicalFriction(opportunity, events, detector);
}
//# sourceMappingURL=opportunity-integrity.js.map