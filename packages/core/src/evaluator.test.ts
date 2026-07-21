import assert from "node:assert/strict";
import test from "node:test";

import type { Sha256, WorkflowEvent } from "@living-software/contracts";

import { evaluateOpportunityDetectors } from "./evaluator.js";

const manifestHash = `sha256:${"a".repeat(64)}` as Sha256;

function workflowEvent(
  caseNumber: number,
  sequence: number,
  name: string,
  nodeId: string,
): WorkflowEvent {
  return {
    schemaVersion: "living.workflow-event/v1",
    eventId: `progress.${caseNumber}.${sequence}`,
    appId: "sample.progress",
    environment: "development",
    releaseRevision: "fixture-v1",
    occurredAt: new Date(Date.UTC(2026, 6, 21, 10, caseNumber, sequence)).toISOString(),
    sequence,
    name,
    kind: "action",
    status: "succeeded",
    sessionId: `session.${caseNumber}`,
    subject: { type: "work-item", pseudonymousId: `case.${caseNumber}` },
    product: { manifestHash, nodeId, surfaceId: "surface.progress" },
    metadata: {},
    provenance: { source: "simulator", synthetic: true },
  };
}

function signalEvent(
  caseNumber: number,
  sequence: number,
  signal: "correction" | "dead-click" | "rage-click",
): WorkflowEvent {
  return {
    ...workflowEvent(caseNumber, sequence, `signal.${signal}`, `action.${signal}`),
    kind: "outcome",
    metadata: { signal },
  };
}

function routeEvent(
  caseNumber: number,
  sequence: number,
  route: "leads" | "tasks",
): WorkflowEvent {
  return {
    ...workflowEvent(
      caseNumber,
      sequence,
      `route.${route}`,
      `route.${route}`,
    ),
    kind: "navigation",
    metadata: { routePhase: "complete" },
  };
}

function repeatedRouteCase(caseNumber: number): WorkflowEvent[] {
  return (["leads", "tasks", "leads", "tasks"] as const).map(
    (route, sequence) => routeEvent(caseNumber, sequence, route),
  );
}

function correctionCases(count: number): WorkflowEvent[] {
  return Array.from({ length: count }, (_, index) =>
    signalEvent(index + 1, 0, "correction")
  );
}

function allFamilyCase(caseNumber: number): WorkflowEvent[] {
  return [
    workflowEvent(caseNumber, 0, "step.a", "action.a"),
    workflowEvent(caseNumber, 1, "step.b", "action.b"),
    workflowEvent(caseNumber, 2, "step.a-again", "action.a"),
    workflowEvent(caseNumber, 3, "step.b-again", "action.b"),
    workflowEvent(caseNumber, 4, "step.a-final", "action.a"),
    signalEvent(caseNumber, 5, "correction"),
    signalEvent(caseNumber, 6, "dead-click"),
  ];
}

test("returns the four configured detector rows for empty evidence", () => {
  const evaluation = evaluateOpportunityDetectors({ events: [], manifestHash });

  assert.deepEqual(
    evaluation.progress.map((progress) => ({
      id: progress.detectorId,
      kind: progress.signalKind,
      affected: progress.affectedCases,
      minimum: progress.minimumAffectedCases,
      total: progress.totalCases,
      occurrences: progress.occurrenceCount,
      met: progress.thresholdMet,
    })),
    [
      {
        id: "detector.technical-friction.correction",
        kind: "rework-loop",
        affected: 0,
        minimum: 3,
        total: 0,
        occurrences: 0,
        met: false,
      },
      {
        id: "detector.technical-friction.interaction-failure",
        kind: "failure-cluster",
        affected: 0,
        minimum: 3,
        total: 0,
        occurrences: 0,
        met: false,
      },
      {
        id: "detector.workflow-pattern.repeated-sequence",
        kind: "repeated-sequence",
        affected: 0,
        minimum: 3,
        total: 0,
        occurrences: 0,
        met: false,
      },
      {
        id: "detector.backtracking",
        kind: "backtracking",
        affected: 0,
        minimum: 3,
        total: 0,
        occurrences: 0,
        met: false,
      },
    ],
  );
  assert.equal(evaluation.detections.length, 0);
  assert.equal(evaluation.selected, null);
  assert.ok(evaluation.families.every((family) => family.detection === null));
});

test("reports correction progress at 1/3 and 2/3 without a premature Opportunity", () => {
  for (const count of [1, 2]) {
    const evaluation = evaluateOpportunityDetectors({
      events: correctionCases(count),
      manifestHash,
    });
    const family = evaluation.families.find(
      ({ progress }) => progress.signalKind === "rework-loop",
    );
    assert.ok(family);
    assert.equal(family.progress.affectedCases, count);
    assert.equal(family.progress.minimumAffectedCases, 3);
    assert.equal(family.progress.totalCases, count);
    assert.equal(family.progress.occurrenceCount, count);
    assert.equal(family.progress.thresholdMet, false);
    assert.equal(family.detection, null);
    assert.equal(evaluation.detections.length, 0);
    assert.equal(evaluation.selected, null);
  }
});

test("emits the exact correction Opportunity only at 3/3", () => {
  const evaluation = evaluateOpportunityDetectors({
    events: correctionCases(3),
    manifestHash,
  });
  const family = evaluation.families.find(
    ({ progress }) => progress.signalKind === "rework-loop",
  );

  assert.ok(family);
  assert.equal(family.progress.affectedCases, 3);
  assert.equal(family.progress.minimumAffectedCases, 3);
  assert.equal(family.progress.totalCases, 3);
  assert.equal(family.progress.occurrenceCount, 3);
  assert.equal(family.progress.thresholdMet, true);
  assert.ok(family.detection);
  assert.equal(family.detection.opportunity.signal.kind, "rework-loop");
  assert.equal(
    family.detection.opportunity.detector.configHash,
    family.progress.configHash,
  );
  assert.equal(evaluation.selected, family.detection);
});

test("binds threshold rows to their exact family Opportunities", () => {
  const events = [1, 2, 3].flatMap(allFamilyCase);
  const evaluation = evaluateOpportunityDetectors({ events, manifestHash });

  assert.equal(evaluation.families.length, 4);
  assert.equal(evaluation.detections.length, 3);
  for (const family of evaluation.families.filter(
    ({ progress }) => progress.signalKind !== "repeated-sequence",
  )) {
    assert.equal(family.progress.affectedCases, 3);
    assert.equal(family.progress.minimumAffectedCases, 3);
    assert.equal(family.progress.totalCases, 3);
    assert.equal(family.progress.thresholdMet, true);
    assert.ok(family.detection);
    assert.equal(
      family.detection.opportunity.detector.id,
      family.progress.detectorId,
    );
    assert.equal(
      family.detection.opportunity.detector.configHash,
      family.progress.configHash,
    );
  }
  assert.deepEqual(
    evaluation.progress.map((progress) => progress.occurrenceCount),
    [3, 3, 0, 9],
  );
  const repeatedSequence = evaluation.families[2];
  assert.equal(repeatedSequence?.progress.thresholdMet, false);
  assert.equal(repeatedSequence?.detection, null);
  assert.equal(evaluation.selected?.opportunity.signal.kind, "rework-loop");
});

test("discovers an ordinary repeated route workflow without technical signals", () => {
  const events = [1, 2, 3].flatMap(repeatedRouteCase);
  const evaluation = evaluateOpportunityDetectors({ events, manifestHash });
  const repeatedSequence = evaluation.families.find(
    ({ progress }) => progress.signalKind === "repeated-sequence",
  );

  assert.ok(repeatedSequence);
  assert.equal(repeatedSequence.progress.affectedCases, 3);
  assert.equal(repeatedSequence.progress.minimumAffectedCases, 3);
  assert.equal(repeatedSequence.progress.affectedSessions, 3);
  assert.equal(repeatedSequence.progress.minimumIndependentSessions, 3);
  assert.equal(repeatedSequence.progress.totalCases, 3);
  assert.equal(repeatedSequence.progress.occurrenceCount, 6);
  assert.equal(repeatedSequence.progress.thresholdMet, true);
  assert.ok(repeatedSequence.detection);
  assert.equal(
    repeatedSequence.detection.opportunity.signal.kind,
    "repeated-sequence",
  );
  assert.deepEqual(
    repeatedSequence.detection.opportunity.signal.sequence,
    ["route.leads", "route.tasks"],
  );
  assert.equal(repeatedSequence.detection.evidenceEvents.length, 12);
  assert.equal(evaluation.detections.length, 1);
  assert.equal(evaluation.selected, repeatedSequence.detection);

  const technicalFamilies = evaluation.families.filter(({ progress }) =>
    progress.signalKind === "rework-loop" ||
    progress.signalKind === "failure-cluster"
  );
  assert.ok(technicalFamilies.every(({ progress }) =>
    progress.affectedCases === 0 && progress.occurrenceCount === 0
  ));
});

test("progress follows the valid detected pattern instead of a broader invalid probe", () => {
  const broadButDependent = [1, 2, 3, 4].flatMap((caseNumber) =>
    ["broad.a", "broad.b", "broad.a", "broad.b"].map((name, sequence) => ({
      ...workflowEvent(caseNumber, sequence, name, name),
      sessionId: caseNumber <= 2 ? "session.shared-a" : "session.shared-b",
    }))
  );
  const validIndependent = [5, 6, 7].flatMap((caseNumber) =>
    ["valid.x", "valid.y", "valid.x", "valid.y"].map((name, sequence) =>
      workflowEvent(caseNumber, sequence, name, name)
    )
  );
  const evaluation = evaluateOpportunityDetectors({
    events: [...broadButDependent, ...validIndependent],
    manifestHash,
  });
  const repeatedSequence = evaluation.families.find(
    ({ progress }) => progress.signalKind === "repeated-sequence",
  );

  assert.ok(repeatedSequence);
  assert.equal(repeatedSequence.progress.affectedCases, 3);
  assert.equal(repeatedSequence.progress.affectedSessions, 3);
  assert.equal(repeatedSequence.progress.thresholdMet, true);
  assert.deepEqual(repeatedSequence.detection?.opportunity.signal.sequence, [
    "valid.x",
    "valid.y",
  ]);
});

test("rejects non-positive detector thresholds even when evidence is empty", () => {
  assert.throws(
    () => evaluateOpportunityDetectors({
      events: [],
      manifestHash,
      technicalFrictionConfig: { minimumAffectedCases: 0 },
    }),
    /positive safe integer/,
  );
  assert.throws(
    () => evaluateOpportunityDetectors({
      events: [],
      manifestHash,
      backtrackingConfig: { minimumRevisitsPerCase: 0 },
    }),
    /positive safe integer/,
  );
  assert.throws(
    () => evaluateOpportunityDetectors({
      events: [],
      manifestHash,
      repeatedSequenceConfig: { minimumIndependentSessions: 0 },
    }),
    /positive safe integer/,
  );
});
