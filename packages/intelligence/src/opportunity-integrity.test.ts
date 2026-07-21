import assert from "node:assert/strict";
import test from "node:test";

import type {
  JsonValue,
  Opportunity,
  Sha256,
  WorkflowEvent,
} from "@living-software/contracts";
import {
  detectBacktrackingOpportunityWithEvidence,
  detectRepeatedSequenceOpportunityWithEvidence,
  detectTechnicalFrictionOpportunitiesWithEvidence,
  sha256,
} from "@living-software/core";

import { validateBuiltInOpportunitySemantics } from "./opportunity-integrity.js";

const manifestHash = `sha256:${"a".repeat(64)}` as Sha256;
const otherHash = `sha256:${"b".repeat(64)}` as Sha256;

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

function repeatedSequenceEvents(): WorkflowEvent[] {
  return [1, 2, 3].flatMap((caseNumber) => [
    event(caseNumber, 0, {
      kind: "navigation",
      name: "route.alpha",
      nodeId: "route.alpha",
    }),
    event(caseNumber, 1, {
      kind: "action",
      name: "action.review",
      nodeId: "action.review",
    }),
    event(caseNumber, 2, {
      kind: "outcome",
      name: "outcome.saved",
      nodeId: "outcome.saved",
    }),
    event(caseNumber, 3, {
      kind: "navigation",
      name: "route.alpha",
      nodeId: "route.alpha",
    }),
    event(caseNumber, 4, {
      kind: "action",
      name: "action.review",
      nodeId: "action.review",
    }),
    event(caseNumber, 5, {
      kind: "outcome",
      name: "outcome.saved",
      nodeId: "outcome.saved",
    }),
    event(caseNumber, 6, {
      kind: "system",
      name: "telemetry.ignored",
      nodeId: "system.telemetry",
    }),
  ]);
}

function overlappingRepeatedSequenceEvents(): WorkflowEvent[] {
  return [1, 2, 3].flatMap((caseNumber) =>
    [0, 1, 2, 3].map((sequence) =>
      event(caseNumber, sequence, {
        kind: "action",
        name: "action.repeat",
        nodeId: "action.repeat",
      })
    )
  );
}

function canonicalEventSetHash(events: readonly WorkflowEvent[]): Sha256 {
  return sha256(
    events
      .map((candidate) => candidate as unknown as JsonValue)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      ),
  );
}

function rebindRepeatedSequenceEvidence(
  opportunity: Opportunity,
  events: readonly WorkflowEvent[],
): Opportunity {
  const eventSetHash = canonicalEventSetHash(events);
  const ordered = [...events].sort(
    (left, right) =>
      Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
      left.sequence - right.sequence ||
      left.eventId.localeCompare(right.eventId),
  );
  const identityHash = sha256({
    appId: opportunity.appId,
    configHash: opportunity.detector.configHash,
    eventSetHash,
    manifestHash: opportunity.manifestHash,
  });
  return {
    ...opportunity,
    opportunityId: `opportunity.repeated-sequence.${identityHash.slice(7, 19)}`,
    detectedAt: ordered.at(-1)!.occurredAt,
    window: {
      from: ordered[0]!.occurredAt,
      to: ordered.at(-1)!.occurredAt,
    },
    evidence: {
      ...opportunity.evidence,
      bundle: {
        ...opportunity.evidence.bundle,
        uri: `living://evidence/${eventSetHash.slice(7)}`,
        sha256: eventSetHash,
      },
      eventSetHash,
      sampleEventIds: ordered.map((candidate) => candidate.eventId).slice(0, 256),
    },
  };
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

test("accepts authentic built-in repeated-sequence semantics", () => {
  const sourceEvents = repeatedSequenceEvents();
  const detection = detectRepeatedSequenceOpportunityWithEvidence({
    events: sourceEvents,
    manifestHash,
  });
  assert.ok(detection);
  assert.deepEqual(detection.opportunity.signal.sequence, [
    "route.alpha",
    "action.review",
    "outcome.saved",
  ]);
  assert.equal(
    detection.opportunity.signal.metrics.find(
      (candidate) => candidate.name === "repeat_occurrences",
    )?.observed,
    6,
  );
  assert.equal(sourceEvents.length, 21);
  assert.equal(detection.evidenceEvents.length, 18);
  assert.ok(
    detection.evidenceEvents.every((candidate) => candidate.kind !== "system"),
  );
  assert.doesNotThrow(() =>
    validateBuiltInOpportunitySemantics(
      detection.opportunity,
      [...detection.evidenceEvents],
    ),
  );

  const overlapping = detectRepeatedSequenceOpportunityWithEvidence({
    events: overlappingRepeatedSequenceEvents(),
    manifestHash,
  });
  assert.ok(overlapping);
  assert.equal(
    overlapping.opportunity.signal.metrics.find(
      (candidate) => candidate.name === "repeat_occurrences",
    )?.observed,
    6,
  );
  assert.doesNotThrow(() =>
    validateBuiltInOpportunitySemantics(
      overlapping.opportunity,
      [...overlapping.evidenceEvents],
    ),
  );
});

test("rejects repeated-sequence semantic, evidence, and identity tampering", () => {
  const detection = detectRepeatedSequenceOpportunityWithEvidence({
    events: repeatedSequenceEvents(),
    manifestHash,
  });
  assert.ok(detection);
  const base = detection.opportunity;
  const mutations: Opportunity[] = [
    {
      ...base,
      signal: {
        ...base.signal,
        sequence: [...(base.signal.sequence ?? [])].reverse(),
      },
    },
    {
      ...base,
      signal: {
        ...base.signal,
        metrics: base.signal.metrics.map((candidate) =>
          candidate.name === "repeat_occurrences"
            ? { ...candidate, observed: candidate.observed + 1 }
            : candidate
        ),
      },
    },
    {
      ...base,
      signal: {
        ...base.signal,
        metrics: base.signal.metrics.map((candidate) =>
          candidate.name === "affected_sessions"
            ? { ...candidate, comparator: candidate.comparator! + 1 }
            : candidate
        ),
      },
    },
    {
      ...base,
      evidence: {
        ...base.evidence,
        occurrenceCount: base.evidence.occurrenceCount + 1,
      },
    },
    {
      ...base,
      evidence: {
        ...base.evidence,
        sampleEventIds: [...base.evidence.sampleEventIds].reverse(),
      },
    },
    {
      ...base,
      detector: { ...base.detector, configHash: otherHash },
    },
    {
      ...base,
      confidence: { ...base.confidence, score: base.confidence.score - 0.01 },
    },
    {
      ...base,
      detectedAt: base.window.from,
    },
    {
      ...base,
      opportunityId: `${base.opportunityId}.tampered`,
    },
  ];
  for (const opportunity of mutations) {
    assert.throws(
      () =>
        validateBuiltInOpportunitySemantics(
          opportunity,
          [...detection.evidenceEvents],
        ),
      /semantic integrity/u,
    );
  }

  const nodeTampered = structuredClone([...detection.evidenceEvents]);
  nodeTampered[2]!.product!.nodeId = "outcome.different-node";
  assert.throws(
    () =>
      validateBuiltInOpportunitySemantics(
        rebindRepeatedSequenceEvidence(base, nodeTampered),
        nodeTampered,
      ),
    /semantic integrity/u,
  );

  const extraEvent: WorkflowEvent = {
    ...detection.evidenceEvents[0]!,
    eventId: "event.extra.non-journey",
    sequence: 99,
    name: "telemetry.extra",
    kind: "system",
  };
  const nonMinimal = [...detection.evidenceEvents, extraEvent];
  assert.throws(
    () =>
      validateBuiltInOpportunitySemantics(
        rebindRepeatedSequenceEvidence(base, nonMinimal),
        nonMinimal,
      ),
    /semantic integrity/u,
  );
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
