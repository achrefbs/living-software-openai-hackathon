import { parseMetricReport, } from "@living-software/contracts";
import { evaluateOpportunityDetectors, projectWorkflowCases, projectWorkflowVariants, } from "@living-software/core";
import { buildMetricValues } from "./metric-reducer.js";
import { verifyEvidenceRecords } from "./store.js";
function dataOrigin(events) {
    const synthetic = events.filter((event) => event.provenance.synthetic).length;
    if (synthetic === 0)
        return "observed";
    if (synthetic === events.length)
        return "synthetic";
    return "mixed";
}
export function analyzeEvidenceRecords(candidates, definition) {
    const records = [...verifyEvidenceRecords(candidates, definition)];
    if (records.length === 0)
        throw new TypeError("Cannot analyze empty evidence");
    const events = records.flatMap((record) => record.batch.events);
    if (events.length === 0)
        throw new TypeError("Cannot analyze empty evidence");
    const workflowCases = projectWorkflowCases(events);
    const workflowVariants = projectWorkflowVariants(events);
    const occurredTimes = events
        .map((event) => event.occurredAt)
        .sort((left, right) => Date.parse(left) - Date.parse(right));
    const finalRecord = records.at(-1);
    if (finalRecord === undefined)
        throw new TypeError("Cannot analyze empty evidence");
    const chainHead = finalRecord.recordHash;
    const metricReport = parseMetricReport({
        schemaVersion: "living.metric-report/v1",
        appId: definition.application.appId,
        manifestHash: definition.application.manifestHash,
        generatedAt: finalRecord.acceptedAt,
        window: {
            from: occurredTimes[0],
            to: occurredTimes.at(-1),
        },
        dataOrigin: dataOrigin(events),
        totals: {
            events: events.length,
            sessions: new Set(events.map((event) => event.sessionId)).size,
            cases: workflowCases.length,
            variants: workflowVariants.length,
        },
        values: buildMetricValues(events, workflowCases, workflowVariants),
    });
    const detectorInput = {
        events,
        manifestHash: definition.application.manifestHash,
        evidenceUri: `living://evidence/${chainHead.slice(7)}`,
    };
    const detectorEvaluation = evaluateOpportunityDetectors(detectorInput);
    return Object.freeze({
        records: Object.freeze(records),
        events: Object.freeze(events),
        workflowCases: Object.freeze(workflowCases),
        workflowVariants: Object.freeze(workflowVariants),
        metricReport,
        detectorEvaluations: detectorEvaluation.families,
        detectorProgress: detectorEvaluation.progress,
        opportunity: detectorEvaluation.selected?.opportunity ?? null,
        opportunityEvidenceEvents: detectorEvaluation.selected?.evidenceEvents ?? Object.freeze([]),
        chainHead,
    });
}
