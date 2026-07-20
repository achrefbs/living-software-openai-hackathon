import assert from "node:assert/strict";
import test from "node:test";

import type { JsonValue, Sha256, WorkflowEvent } from "@living-software/contracts";

import {
  detectBacktrackingOpportunity,
  detectBacktrackingOpportunityWithEvidence,
  projectWorkflowCases,
  projectWorkflowJourneySteps,
  projectWorkflowVariants,
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
      ...frictionCase(1),
      ...frictionCase(2),
      ...frictionCase(3),
    ],
    manifestHash,
  });
  assert.ok(opportunity);
  assert.equal(opportunity.signal.kind, "backtracking");
  assert.equal(opportunity.evidence.subjectCount, 3);
  assert.equal(opportunity.evidence.dataOrigin, "synthetic");
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
    events: telemetryCase(1, true),
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
  assert.deepEqual(opportunity.evidence.sampleEventIds, ["telemetry.1.14"]);
  assert.equal(opportunity.evidence.occurrenceCount, 1);
});

test("returns the exact minimized evidence set used for Opportunity identity", () => {
  const allEvents = [
    ...telemetryCase(1, true),
    ...telemetryCase(2, true),
    ...telemetryCase(3, true),
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
  assert.equal(allEvents.length, 60);
  assert.equal(detection.evidenceEvents.length, 15);
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
    events: [...frictionCase(1), ...frictionCase(2)],
    manifestHash,
  });
  assert.equal(opportunity, null);
});
