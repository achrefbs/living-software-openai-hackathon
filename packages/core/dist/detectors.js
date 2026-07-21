import { parseOpportunity, } from "@living-software/contracts";
import { sha256 } from "./canonical.js";
import { findBacktrackingRevisitIndexes, projectWorkflowCases, projectWorkflowJourneySteps, } from "./workflows.js";
const defaultConfig = {
    id: "detector.backtracking",
    version: "1.2.0",
    minimumAffectedCases: 3,
    minimumRevisitsPerCase: 2,
};
const defaultTechnicalFrictionConfig = {
    version: "1.0.0",
    minimumAffectedCases: 3,
};
const supportedTechnicalSignals = new Set([
    "correction",
    "dead-click",
    "rage-click",
]);
const technicalFrictionDefinitions = [
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
function dataOrigin(events) {
    const syntheticCount = events.filter((event) => event.provenance.synthetic).length;
    if (syntheticCount === events.length) {
        return "synthetic";
    }
    return syntheticCount === 0 ? "observed" : "mixed";
}
function computeEventSetHash(events) {
    return sha256(events
        .map((event) => event)
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
}
function technicalSignal(event) {
    const signal = event.metadata.signal;
    return event.kind === "outcome" &&
        typeof signal === "string" &&
        supportedTechnicalSignals.has(signal)
        ? signal
        : undefined;
}
function backtrackingCorroborationEvents(events) {
    return events.filter((event) => technicalSignal(event) !== undefined ||
        event.status === "failed" ||
        event.status === "abandoned");
}
function uniqueEvents(events) {
    return [
        ...new Map(events.map((event) => [event.eventId, event])).values(),
    ].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
        left.sequence - right.sequence ||
        left.eventId.localeCompare(right.eventId));
}
function detectTechnicalFrictionDefinition(events, manifestHash, evidenceUri, config, definition) {
    const acceptedSignals = new Set(definition.signals);
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
    if (affected.length < config.minimumAffectedCases)
        return null;
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
    });
    const identityHash = sha256({
        appId: events[0]?.appId ?? "",
        configHash,
        eventSetHash: evidenceHash,
        manifestHash,
    });
    const sessions = new Set(evidenceEvents.map((event) => event.sessionId));
    const signalCounts = new Map(definition.signals.map((signal) => [
        signal,
        evidenceEvents.filter((event) => technicalSignal(event) === signal).length,
    ]));
    const metrics = [
        {
            name: "affected_cases",
            unit: "count",
            observed: affected.length,
            comparator: config.minimumAffectedCases,
        },
        ...(definition.kind === "rework-loop"
            ? [{
                    name: "correction_count",
                    unit: "count",
                    observed: signalCounts.get("correction") ?? 0,
                }]
            : [
                {
                    name: "failure_signal_count",
                    unit: "count",
                    observed: evidenceEvents.length,
                },
                {
                    name: "dead_click_count",
                    unit: "count",
                    observed: signalCounts.get("dead-click") ?? 0,
                },
                {
                    name: "rage_click_count",
                    unit: "count",
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
            score: Math.min(0.95, 0.55 + (affected.length / Math.max(1, cases.length)) * 0.4),
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
export function detectTechnicalFrictionOpportunitiesWithEvidence({ events, manifestHash, evidenceUri, config: overrides, }) {
    if (events.length === 0)
        return Object.freeze([]);
    const config = { ...defaultTechnicalFrictionConfig, ...overrides };
    return Object.freeze(technicalFrictionDefinitions
        .map((definition) => detectTechnicalFrictionDefinition(events, manifestHash, evidenceUri, config, definition))
        .filter((candidate) => candidate !== null));
}
function metric(opportunity, name) {
    return opportunity.signal.metrics.find((candidate) => candidate.name === name)
        ?.observed ?? 0;
}
function explicitTechnicalSignal(opportunity) {
    return opportunity.signal.kind === "rework-loop" ||
        opportunity.signal.kind === "failure-cluster"
        ? 1
        : 0;
}
/** Deterministic and input-order-independent arbitration across detectors. */
export function selectOpportunityDetection(detections) {
    return [...detections].sort((left, right) => {
        const byRatio = metric(right.opportunity, "affected_ratio") -
            metric(left.opportunity, "affected_ratio");
        if (byRatio !== 0)
            return byRatio;
        const byCases = metric(right.opportunity, "affected_cases") -
            metric(left.opportunity, "affected_cases");
        if (byCases !== 0)
            return byCases;
        const bySpecificity = explicitTechnicalSignal(right.opportunity) -
            explicitTechnicalSignal(left.opportunity);
        if (bySpecificity !== 0)
            return bySpecificity;
        const byOccurrences = right.opportunity.evidence.occurrenceCount -
            left.opportunity.evidence.occurrenceCount;
        if (byOccurrences !== 0)
            return byOccurrences;
        const byDetector = left.opportunity.detector.id.localeCompare(right.opportunity.detector.id);
        return byDetector !== 0
            ? byDetector
            : left.opportunity.opportunityId.localeCompare(right.opportunity.opportunityId);
    })[0] ?? null;
}
export function detectBacktrackingOpportunityWithEvidence({ events, manifestHash, evidenceUri, config: overrides, }) {
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
            corroborationEvents: backtrackingCorroborationEvents(workflowCase.events),
        };
    })
        .filter((item) => item.revisitIndexes.length >= config.minimumRevisitsPerCase &&
        item.corroborationEvents.length > 0);
    if (affected.length < config.minimumAffectedCases) {
        return null;
    }
    const affectedEvents = affected.flatMap((item) => uniqueEvents([
        ...item.journey.map((step) => step.event),
        ...item.corroborationEvents,
    ]));
    const sampleEventIds = [
        ...new Set(affected.flatMap((item) => [
            ...item.corroborationEvents.map((event) => event.eventId),
            ...item.revisitIndexes.map((index) => item.journey[index]?.event.eventId),
        ])),
    ].filter((eventId) => eventId !== undefined);
    const sessions = new Set(affectedEvents.map((event) => event.sessionId));
    const evidenceCaseCount = projectWorkflowCases(affectedEvents).length;
    if (evidenceCaseCount !== affected.length) {
        throw new TypeError("Backtracking evidence cases do not match the detected cases");
    }
    const occurrenceCount = affected.reduce((sum, item) => sum + item.revisitIndexes.length, 0);
    const orderedTimes = affectedEvents
        .map((event) => event.occurredAt)
        .sort((left, right) => Date.parse(left) - Date.parse(right));
    const eventSetHash = computeEventSetHash(affectedEvents);
    const configHash = sha256(config);
    const identityHash = sha256({
        appId: events[0]?.appId ?? "",
        configHash,
        eventSetHash,
        manifestHash,
    });
    const confidence = Math.min(0.95, 0.5 + (affected.length / Math.max(1, cases.length)) * 0.4);
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
export function detectBacktrackingOpportunity(input) {
    return detectBacktrackingOpportunityWithEvidence(input)?.opportunity ?? null;
}
//# sourceMappingURL=detectors.js.map