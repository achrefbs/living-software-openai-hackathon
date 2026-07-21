import assert from "node:assert/strict";
import test from "node:test";

import type { JsonValue, Sha256, WorkflowEvent } from "@living-software/contracts";

import {
  detectBacktrackingOpportunity,
  detectBacktrackingOpportunityWithEvidence,
  detectTechnicalFrictionOpportunitiesWithEvidence,
  projectWorkflowCases,
  projectWorkflowJourneySteps,
  projectWorkflowVariants,
  selectOpportunityDetection,
  sha256,
} from "./index.js";

const manifestHash = `sha256:${"a".repeat(64)}` as Sha256;

function event(
  caseNumber: number,
  sequence: number,
  name: string,
  surface: string,
  nodeId = `action.${name}`,
): WorkflowEvent {
  return {
    schemaVersion: "living.workflow-event/v1",
    eventId: `event.${caseNumber}.${sequence}`,
    appId: "sample.operations-console",
    environment: "development",
    releaseRevision: "fixture-v1",
    occurredAt: new Date(
      Date.UTC(2026, 6, 19, 10, caseNumber, sequence),
    ).toISOString(),
    sequence,
    name,
    kind: name.endsWith("completed") ? "outcome" : "action",
    status: "succeeded",
    sessionId: `session.${caseNumber}`,
    subject: {
      type: "work-item",
      pseudonymousId: `case.${caseNumber}`,
    },
    product: {
      manifestHash,
      nodeId,
      surfaceId: surface,
    },
    metadata: {},
    provenance: {
      source: "simulator",
      synthetic: true,
    },
  };
}

function frictionCase(caseNumber: number): WorkflowEvent[] {
  return [
    event(caseNumber, 0, "work.opened", "surface.work"),
    event(caseNumber, 1, "draft.started", "surface.draft", "action.draft"),
    event(caseNumber, 2, "reference.viewed", "surface.reference"),
    event(caseNumber, 3, "history.viewed", "surface.history", "action.history"),
    event(caseNumber, 4, "draft.resumed", "surface.draft", "action.draft"),
    event(caseNumber, 5, "history.reviewed", "surface.history", "action.history"),
    event(caseNumber, 6, "draft.saved", "surface.draft", "action.draft"),
    event(caseNumber, 7, "work.completed", "surface.work"),
  ];
}

function controlCase(caseNumber: number): WorkflowEvent[] {
  return [
    event(caseNumber, 0, "work.opened", "surface.work"),
    event(caseNumber, 1, "reference.viewed", "surface.reference"),
    event(caseNumber, 2, "draft.saved", "surface.draft"),
    event(caseNumber, 3, "work.completed", "surface.complete"),
  ];
}

function telemetryEvent(
  caseNumber: number,
  sequence: number,
  options: {
    name: string;
    kind: WorkflowEvent["kind"];
    nodeId: string;
    metadata: WorkflowEvent["metadata"];
    status?: WorkflowEvent["status"];
  },
): WorkflowEvent {
  return {
    schemaVersion: "living.workflow-event/v1",
    eventId: `telemetry.${caseNumber}.${sequence}`,
    appId: "sample.operations-console",
    environment: "development",
    releaseRevision: "fixture-v1",
    occurredAt: new Date(
      Date.UTC(2026, 6, 19, 11, caseNumber, sequence),
    ).toISOString(),
    sequence,
    name: options.name,
    kind: options.kind,
    status: options.status ?? "succeeded",
    sessionId: `telemetry-session.${caseNumber}`,
    subject: {
      type: "work-item",
      pseudonymousId: `telemetry-case.${caseNumber}`,
    },
    product: {
      manifestHash,
      nodeId: options.nodeId,
      ...(options.nodeId.startsWith("route.")
        ? { surfaceId: options.nodeId }
        : {}),
    },
    metadata: options.metadata,
    provenance: {
      source: "technical-telemetry",
      synthetic: true,
    },
  };
}

function telemetryCase(
  caseNumber: number,
  withBacktrack = false,
): WorkflowEvent[] {
  const events = [
    telemetryEvent(caseNumber, 0, {
      name: "route.dashboard.start",
      kind: "navigation",
      nodeId: "route.dashboard",
      metadata: { routePhase: "start" },
      status: "started",
    }),
    telemetryEvent(caseNumber, 1, {
      name: "performance.cls",
      kind: "system",
      nodeId: "integration.performance",
      metadata: { metric: "cls", value: 0.01, unit: "score" },
    }),
    telemetryEvent(caseNumber, 2, {
      name: "route.dashboard.complete",
      kind: "navigation",
      nodeId: "route.dashboard",
      metadata: { routePhase: "complete" },
    }),
    telemetryEvent(caseNumber, 3, {
      name: "performance.lcp",
      kind: "system",
      nodeId: "integration.performance",
      metadata: { metric: "lcp", value: 420, unit: "millisecond" },
    }),
    telemetryEvent(caseNumber, 4, {
      name: "route.dashboard.start",
      kind: "navigation",
      nodeId: "route.dashboard",
      metadata: { routePhase: "start" },
      status: "started",
    }),
    telemetryEvent(caseNumber, 5, {
      name: "performance.cls",
      kind: "system",
      nodeId: "integration.performance",
      metadata: { metric: "cls", value: 0.02, unit: "score" },
    }),
    telemetryEvent(caseNumber, 6, {
      name: "route.dashboard.complete",
      kind: "navigation",
      nodeId: "route.dashboard",
      metadata: { routePhase: "complete" },
    }),
    telemetryEvent(caseNumber, 7, {
      name: "action.open-leads",
      kind: "action",
      nodeId: "action.open-leads",
      metadata: { interaction: "click" },
    }),
    telemetryEvent(caseNumber, 8, {
      name: "route.leads.start",
      kind: "navigation",
      nodeId: "route.leads",
      metadata: { routePhase: "start" },
      status: "started",
    }),
    telemetryEvent(caseNumber, 9, {
      name: "performance.lcp",
      kind: "system",
      nodeId: "integration.performance",
      metadata: { metric: "lcp", value: 390, unit: "millisecond" },
    }),
    telemetryEvent(caseNumber, 10, {
      name: "route.leads.complete",
      kind: "navigation",
      nodeId: "route.leads",
      metadata: { routePhase: "complete" },
    }),
  ];

  if (withBacktrack) {
    events.push(
      telemetryEvent(caseNumber, 11, {
        name: "action.back",
        kind: "action",
        nodeId: "action.back",
        metadata: { interaction: "click" },
      }),
      telemetryEvent(caseNumber, 12, {
        name: "route.dashboard.start",
        kind: "navigation",
        nodeId: "route.dashboard",
        metadata: { routePhase: "start" },
        status: "started",
      }),
      telemetryEvent(caseNumber, 13, {
        name: "performance.cls",
        kind: "system",
        nodeId: "integration.performance",
        metadata: { metric: "cls", value: 0.03, unit: "score" },
      }),
      telemetryEvent(caseNumber, 14, {
        name: "route.dashboard.complete",
        kind: "navigation",
        nodeId: "route.dashboard",
        metadata: { routePhase: "complete" },
      }),
    );
  }

  events.push(
    telemetryEvent(caseNumber, withBacktrack ? 15 : 11, {
      name: "session.pagehide",
      kind: "system",
      nodeId: "integration.performance",
      metadata: { lifecycle: "pagehide" },
    }),
  );
  return events;
}

function technicalFrictionEvent(
  caseNumber: number,
  sequence: number,
  signal: "correction" | "dead-click" | "rage-click",
  nodeId = `action.${signal}`,
): WorkflowEvent {
  return {
    ...event(
      caseNumber,
      sequence,
      `signal.${signal}`,
      "surface.technical-friction",
      nodeId,
    ),
    kind: "outcome",
    metadata: { signal },
  };
}

function telemetrySignalEvent(
  caseNumber: number,
  sequence: number,
  signal: "correction" | "dead-click" | "rage-click",
): WorkflowEvent {
  return telemetryEvent(caseNumber, sequence, {
    name: `signal.${signal}`,
    kind: "outcome",
    nodeId: `action.${signal}`,
    metadata: { signal },
  });
}

function corroboratedFrictionCase(
  caseNumber: number,
  signal: "correction" | "dead-click" | "rage-click" = "correction",
): WorkflowEvent[] {
  return [
    ...frictionCase(caseNumber),
    technicalFrictionEvent(caseNumber, 8, signal),
  ];
}

function normalizedRecordReviewCase(caseNumber: number): WorkflowEvent[] {
  // The two records have different runtime identities, but privacy-preserving
  // discovery intentionally normalizes both to the same route/action nodes.
  return [
    event(caseNumber, 0, "lead.opened", "surface.leads", "action.lead-link"),
    event(caseNumber, 1, "lead.detail", "surface.lead-detail", "route.lead-detail"),
    event(caseNumber, 2, "lead.returned", "surface.lead-detail", "action.back"),
    event(caseNumber, 3, "lead.list", "surface.leads", "route.leads"),
    event(caseNumber, 4, "lead.opened", "surface.leads", "action.lead-link"),
    event(caseNumber, 5, "lead.detail", "surface.lead-detail", "route.lead-detail"),
    event(caseNumber, 6, "review.completed", "surface.lead-detail", "outcome.review"),
  ];
}

test("projects stable workflow variants", () => {
  const variants = projectWorkflowVariants([
    ...controlCase(1),
    ...controlCase(2),
    ...frictionCase(3),
  ]);
  assert.equal(variants.length, 2);
  assert.equal(variants[0]?.caseCount, 2);
  assert.equal(variants[0]?.outcomes.succeeded, 2);
});

test("projects meaningful journey steps without phase or performance noise", () => {
  const events = telemetryCase(1);
  const journey = projectWorkflowJourneySteps(events);

  assert.deepEqual(
    journey.map((step) => step.event.eventId),
    ["telemetry.1.2", "telemetry.1.7", "telemetry.1.10"],
  );
  assert.deepEqual(projectWorkflowCases(events)[0]?.surfaces, [
    "route.dashboard",
    "action.open-leads",
    "route.leads",
  ]);
});

test("keeps phase-less successful navigation compatible without counting route noise", () => {
  const events = [
    telemetryEvent(1, 0, {
      name: "legacy.dashboard",
      kind: "navigation",
      nodeId: "route.dashboard",
      metadata: {},
    }),
    telemetryEvent(1, 1, {
      name: "route.dashboard.start",
      kind: "navigation",
      nodeId: "route.dashboard",
      metadata: { routePhase: "start" },
      status: "started",
    }),
    telemetryEvent(1, 2, {
      name: "route.dashboard.complete",
      kind: "navigation",
      nodeId: "route.dashboard",
      metadata: { routePhase: "complete" },
    }),
    telemetryEvent(1, 3, {
      name: "route.dashboard.complete",
      kind: "navigation",
      nodeId: "route.dashboard",
      metadata: { routePhase: "complete" },
    }),
    telemetryEvent(1, 4, {
      name: "performance.cls",
      kind: "system",
      nodeId: "integration.performance",
      metadata: { metric: "cls", value: 0.01, unit: "score" },
    }),
    telemetryEvent(1, 5, {
      name: "action.open-leads",
      kind: "action",
      nodeId: "action.open-leads",
      metadata: { interaction: "click" },
    }),
    telemetryEvent(1, 6, {
      name: "legacy.leads",
      kind: "navigation",
      nodeId: "route.leads",
      metadata: {},
    }),
  ];

  assert.deepEqual(
    projectWorkflowJourneySteps(events).map((step) => step.event.eventId),
    ["telemetry.1.0", "telemetry.1.5", "telemetry.1.6"],
  );
  assert.equal(
    detectBacktrackingOpportunity({
      events,
      manifestHash,
      config: { minimumAffectedCases: 1, minimumRevisitsPerCase: 1 },
    }),
    null,
  );
});

test("detects repeated backtracking from synthetic evidence", () => {
  const opportunity = detectBacktrackingOpportunity({
    events: [
      ...corroboratedFrictionCase(1, "correction"),
      ...corroboratedFrictionCase(2, "dead-click"),
      ...corroboratedFrictionCase(3, "rage-click"),
    ],
    manifestHash,
  });
  assert.ok(opportunity);
  assert.equal(opportunity.signal.kind, "backtracking");
  assert.equal(opportunity.detector.version, "1.2.0");
  assert.equal(opportunity.evidence.subjectCount, 3);
  assert.equal(opportunity.evidence.dataOrigin, "synthetic");
});

test("does not mistake successful review of distinct normalized records for friction", () => {
  const events = [
    ...normalizedRecordReviewCase(1),
    ...normalizedRecordReviewCase(2),
    ...normalizedRecordReviewCase(3),
  ];
  assert.ok(
    events.every(
      (candidate) =>
        candidate.status === "succeeded" && candidate.metadata.signal === undefined,
    ),
  );
  assert.equal(
    detectBacktrackingOpportunity({ events, manifestHash }),
    null,
  );
});

test("does not emit an opportunity for the direct control workflow", () => {
  const opportunity = detectBacktrackingOpportunity({
    events: [
      ...controlCase(1),
      ...controlCase(2),
      ...controlCase(3),
      ...controlCase(4),
    ],
    manifestHash,
  });
  assert.equal(opportunity, null);
});

test("does not treat repeated route phases or web vitals as backtracking", () => {
  const events = Array.from({ length: 8 }, (_, index) =>
    telemetryCase(index + 1),
  ).flat();

  assert.equal(
    detectBacktrackingOpportunity({ events, manifestHash }),
    null,
  );
});

test("detects a true A-B-A revisit and samples the filtered event", () => {
  const opportunity = detectBacktrackingOpportunity({
    events: [
      ...telemetryCase(1, true),
      telemetrySignalEvent(1, 16, "dead-click"),
    ],
    manifestHash,
    config: {
      minimumAffectedCases: 1,
      minimumRevisitsPerCase: 1,
    },
  });

  assert.ok(opportunity);
  assert.equal(opportunity.signal.kind, "backtracking");
  assert.deepEqual(opportunity.signal.sequence, [
    "route.dashboard.complete",
    "action.open-leads",
    "route.leads.complete",
    "action.back",
    "route.dashboard.complete",
  ]);
  assert.deepEqual(opportunity.evidence.sampleEventIds, [
    "telemetry.1.16",
    "telemetry.1.14",
  ]);
  assert.equal(opportunity.evidence.occurrenceCount, 1);
});

test("returns the exact minimized evidence set used for Opportunity identity", () => {
  const allEvents = [
    ...telemetryCase(1, true),
    telemetrySignalEvent(1, 16, "dead-click"),
    ...telemetryCase(2, true),
    telemetrySignalEvent(2, 16, "dead-click"),
    ...telemetryCase(3, true),
    telemetrySignalEvent(3, 16, "dead-click"),
    ...telemetryCase(4, false),
  ];
  const input = {
    events: allEvents,
    manifestHash,
    config: {
      minimumAffectedCases: 3,
      minimumRevisitsPerCase: 1,
    },
  };
  const detection = detectBacktrackingOpportunityWithEvidence(input);

  assert.ok(detection);
  assert.equal(allEvents.length, 63);
  assert.equal(detection.evidenceEvents.length, 18);
  assert.ok(
    detection.evidenceEvents.every(
      (candidate) =>
        !candidate.eventId.startsWith("telemetry.4.") &&
        candidate.kind !== "system" &&
        candidate.metadata.routePhase !== "start",
    ),
  );
  const canonicalHash = sha256(
    detection.evidenceEvents
      .map((candidate) => candidate as unknown as JsonValue)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
  );
  assert.equal(detection.opportunity.evidence.eventSetHash, canonicalHash);
  assert.equal(detection.opportunity.evidence.bundle.sha256, canonicalHash);
  assert.equal(detection.opportunity.evidence.sessionCount, 3);
  assert.equal(detection.opportunity.evidence.subjectCount, 3);
  assert.equal(projectWorkflowCases([...detection.evidenceEvents]).length, 3);
  assert.deepEqual(
    detectBacktrackingOpportunity(input),
    detection.opportunity,
  );
});

test("is falsifiable below the affected-case threshold", () => {
  const opportunity = detectBacktrackingOpportunity({
    events: [
      ...corroboratedFrictionCase(1),
      ...corroboratedFrictionCase(2),
    ],
    manifestHash,
  });
  assert.equal(opportunity, null);
});

test("maps correction signals to a rework opportunity with exact minimized evidence", () => {
  const unrelated = controlCase(4);
  const detections = detectTechnicalFrictionOpportunitiesWithEvidence({
    events: [
      ...controlCase(1),
      technicalFrictionEvent(1, 10, "correction", "action.stage"),
      ...controlCase(2),
      technicalFrictionEvent(2, 10, "correction", "action.stage"),
      ...controlCase(3),
      technicalFrictionEvent(3, 10, "correction", "action.task-status"),
      ...unrelated,
    ],
    manifestHash,
  });

  assert.equal(detections.length, 1);
  const detection = detections[0];
  assert.ok(detection);
  assert.equal(detection.opportunity.signal.kind, "rework-loop");
  assert.equal(detection.opportunity.evidence.subjectCount, 3);
  assert.equal(detection.opportunity.evidence.occurrenceCount, 3);
  assert.deepEqual(
    detection.evidenceEvents.map((candidate) => candidate.metadata.signal),
    ["correction", "correction", "correction"],
  );
  assert.ok(
    detection.evidenceEvents.every(
      (candidate) => candidate.kind === "outcome" && candidate.eventId.endsWith(".10"),
    ),
  );
  assert.equal(
    detection.opportunity.signal.metrics.find(
      (candidate) => candidate.name === "correction_count",
    )?.observed,
    3,
  );
  assert.equal(
    detection.opportunity.evidence.eventSetHash,
    sha256(
      detection.evidenceEvents
        .map((candidate) => candidate as unknown as JsonValue)
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        ),
    ),
  );
});

test("maps dead and rage clicks into one failure cluster", () => {
  const detections = detectTechnicalFrictionOpportunitiesWithEvidence({
    events: [
      technicalFrictionEvent(1, 0, "dead-click", "action.save"),
      technicalFrictionEvent(2, 0, "rage-click", "action.search"),
      technicalFrictionEvent(3, 0, "dead-click", "action.save"),
    ],
    manifestHash,
  });

  assert.equal(detections.length, 1);
  const opportunity = detections[0]?.opportunity;
  assert.ok(opportunity);
  assert.equal(opportunity.signal.kind, "failure-cluster");
  assert.equal(opportunity.evidence.occurrenceCount, 3);
  assert.equal(
    opportunity.signal.metrics.find((candidate) => candidate.name === "dead_click_count")
      ?.observed,
    2,
  );
  assert.equal(
    opportunity.signal.metrics.find((candidate) => candidate.name === "rage_click_count")
      ?.observed,
    1,
  );
});

test("technical friction is falsifiable below three affected cases", () => {
  assert.deepEqual(
    detectTechnicalFrictionOpportunitiesWithEvidence({
      events: [
        technicalFrictionEvent(1, 0, "correction"),
        technicalFrictionEvent(2, 0, "correction"),
        technicalFrictionEvent(3, 0, "dead-click"),
        technicalFrictionEvent(4, 0, "rage-click"),
      ],
      manifestHash,
    }),
    [],
  );
});

test("detector arbitration is input-order independent and favors equally broad explicit signals", () => {
  const events = [1, 2, 3].flatMap((caseNumber) => [
    ...frictionCase(caseNumber),
    technicalFrictionEvent(caseNumber, 8, "correction", "action.stage"),
  ]);
  const backtracking = detectBacktrackingOpportunityWithEvidence({
    events,
    manifestHash,
  });
  const technical = detectTechnicalFrictionOpportunitiesWithEvidence({
    events,
    manifestHash,
  });
  assert.ok(backtracking);
  const forward = selectOpportunityDetection([backtracking, ...technical]);
  const reverse = selectOpportunityDetection([...technical, backtracking]);

  assert.equal(forward?.opportunity.signal.kind, "rework-loop");
  assert.equal(reverse?.opportunity.opportunityId, forward?.opportunity.opportunityId);
  assert.equal(
    selectOpportunityDetection([backtracking]),
    backtracking,
  );
});

test("an equally broad failure cluster wins deterministic arbitration", () => {
  const events = [1, 2, 3].flatMap((caseNumber) => [
    ...frictionCase(caseNumber),
    technicalFrictionEvent(caseNumber, 8, "dead-click", "action.save"),
  ]);
  const backtracking = detectBacktrackingOpportunityWithEvidence({
    events,
    manifestHash,
  });
  assert.ok(backtracking);
  const selected = selectOpportunityDetection([
    backtracking,
    ...detectTechnicalFrictionOpportunitiesWithEvidence({ events, manifestHash }),
  ]);
  assert.equal(selected?.opportunity.signal.kind, "failure-cluster");
});
