import assert from "node:assert/strict";
import test from "node:test";

import type { Opportunity, Sha256, WorkflowEvent } from "@living-software/contracts";
import {
  detectBacktrackingOpportunityWithEvidence,
  detectTechnicalFrictionOpportunitiesWithEvidence,
} from "@living-software/core";

import { validateBuiltInOpportunitySemantics } from "./opportunity-integrity.js";

const manifestHash = `sha256:${"a".repeat(64)}` as Sha256;

function event(
  caseNumber: number,
  sequence: number,
  options: Readonly<{
    kind: WorkflowEvent["kind"];
    name: string;
    nodeId: string;
    signal?: "correction" | "dead-click" | "rage-click";
  }>,
): WorkflowEvent {
  return {
    schemaVersion: "living.workflow-event/v1",
    eventId: `event.${caseNumber}.${sequence}`,
    appId: "sample.integrity",
    environment: "development",
    releaseRevision: "fixture-v1",
    occurredAt: new Date(Date.UTC(2026, 6, 21, 10, caseNumber, sequence)).toISOString(),
    sequence,
    name: options.name,
    kind: options.kind,
    status: "succeeded",
    sessionId: `session.${caseNumber}`,
    subject: { type: "work-item", pseudonymousId: `case.${caseNumber}` },
    product: {
      manifestHash,
      nodeId: options.nodeId,
      surfaceId: "surface.work",
    },
    metadata: options.signal === undefined ? {} : { signal: options.signal },
    provenance: { source: "simulator", synthetic: true },
  };
}

function correctionEvents(): WorkflowEvent[] {
  return [1, 2, 3].flatMap((caseNumber) => [
    event(caseNumber, 0, {
      kind: "outcome",
      name: "signal.correction",
      nodeId: "action.edit",
      signal: "correction",
    }),
    ...(caseNumber === 1
      ? [event(caseNumber, 1, {
          kind: "outcome",
          name: "signal.correction",
          nodeId: "action.edit",
          signal: "correction",
        })]
      : []),
  ]);
}

function backtrackingEvents(): WorkflowEvent[] {
  return [1, 2, 3].flatMap((caseNumber) => [
    event(caseNumber, 0, { kind: "navigation", name: "route.a", nodeId: "route.a" }),
    event(caseNumber, 1, { kind: "navigation", name: "route.b", nodeId: "route.b" }),
    event(caseNumber, 2, { kind: "navigation", name: "route.a", nodeId: "route.a" }),
    event(caseNumber, 3, { kind: "navigation", name: "route.b", nodeId: "route.b" }),
    event(caseNumber, 4, { kind: "navigation", name: "route.a", nodeId: "route.a" }),
    event(caseNumber, 5, {
      kind: "outcome",
      name: `signal.${caseNumber}`,
      nodeId: "action.review",
      signal: caseNumber === 1 ? "correction" : caseNumber === 2 ? "dead-click" : "rage-click",
    }),
  ]);
}

test("accepts authentic built-in correction and backtracking opportunities", () => {
  const correction = detectTechnicalFrictionOpportunitiesWithEvidence({
    events: correctionEvents(),
    manifestHash,
  })[0];
  const backtracking = detectBacktrackingOpportunityWithEvidence({
    events: backtrackingEvents(),
    manifestHash,
  });
  assert.ok(correction);
  assert.ok(backtracking);
  assert.doesNotThrow(() =>
    validateBuiltInOpportunitySemantics(correction.opportunity, [...correction.evidenceEvents]),
  );
  assert.doesNotThrow(() =>
    validateBuiltInOpportunitySemantics(backtracking.opportunity, [...backtracking.evidenceEvents]),
  );
});

test("rejects hash-valid built-in semantic and sample tampering", () => {
  const detection = detectTechnicalFrictionOpportunitiesWithEvidence({
    events: correctionEvents(),
    manifestHash,
  })[0];
  assert.ok(detection);
  const base = detection.opportunity;
  const mutations: Opportunity[] = [
    {
      ...base,
      evidence: { ...base.evidence, occurrenceCount: base.evidence.occurrenceCount + 1 },
    },
    {
      ...base,
      signal: {
        ...base.signal,
        metrics: base.signal.metrics.map((metric, index) =>
          index === 0 ? { ...metric, observed: metric.observed + 1 } : metric
        ),
      },
    },
    {
      ...base,
      evidence: { ...base.evidence, sampleEventIds: [...base.evidence.sampleEventIds].reverse() },
    },
    {
      ...base,
      confidence: { ...base.confidence, score: base.confidence.score - 0.01 },
    },
    {
      ...base,
      detectedAt: base.window.from,
    },
  ];

  for (const opportunity of mutations) {
    assert.throws(
      () => validateBuiltInOpportunitySemantics(opportunity, [...detection.evidenceEvents]),
      /semantic integrity/u,
    );
  }
});

test("keeps unknown detector versions contract-compatible", () => {
  const detection = detectTechnicalFrictionOpportunitiesWithEvidence({
    events: correctionEvents(),
    manifestHash,
  })[0];
  assert.ok(detection);
  const future: Opportunity = {
    ...detection.opportunity,
    detector: { ...detection.opportunity.detector, version: "9.0.0" },
    evidence: {
      ...detection.opportunity.evidence,
      occurrenceCount: detection.opportunity.evidence.occurrenceCount + 10,
    },
  };
  assert.doesNotThrow(() =>
    validateBuiltInOpportunitySemantics(future, [...detection.evidenceEvents]),
  );
});
