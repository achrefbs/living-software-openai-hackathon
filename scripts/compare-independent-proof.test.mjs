import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeSimulatorTargetFamily,
  compareIndependentProof,
  parseCliArguments,
} from "./compare-independent-proof.mjs";

const MANIFEST_HASH = `sha256:${"a".repeat(64)}`;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const SECRET = "ULTRA_SECRET_CORPUS_DO_NOT_EMIT_92741";

function provenance() {
  return {
    origin: "scanned",
    confidence: 1,
    sources: [{ path: "src/app/page.tsx", revision: "proof-revision" }],
  };
}

function node(id, kind, displayName, attributes) {
  return {
    id,
    kind,
    displayName,
    provenance: provenance(),
    ...(attributes === undefined ? {} : { attributes }),
  };
}

function fixtureManifest() {
  return {
    schemaVersion: "living.product-manifest/v1",
    appId: "proof-app",
    release: { revision: "proof-revision" },
    generatedAt: "2026-07-19T10:00:00.000Z",
    generators: [{ adapterId: "next-app-router", adapterVersion: "1.0.0" }],
    nodes: [
      node("route-home", "route", "/", { path: "/", router: "app" }),
      node("route-leads", "route", "/leads", { path: "/leads", router: "app" }),
      node("route-lead-detail", "route", "/leads/:id", {
        path: "/leads/:id",
        router: "app",
      }),
      node("action-lead-link", "action", "lead-link-{*}", {
        element: "a",
        locatorAttribute: "data-testid",
        locatorValue: "lead-link-{*}",
        dynamic: true,
      }),
      node("action-task-checkbox", "action", "task-checkbox-{*}", {
        element: "button",
        locatorAttribute: "data-testid",
        locatorValue: "task-checkbox-{*}",
        dynamic: true,
      }),
      node("action-board-card", "action", "board-card-{*}", {
        element: "button",
        locatorAttribute: "data-testid",
        locatorValue: "board-card-{*}",
        dynamic: true,
      }),
      node("action-board-stage", "action", "board-stage-select-{*}", {
        element: "select",
        locatorAttribute: "data-testid",
        locatorValue: "board-stage-select-{*}",
        dynamic: true,
      }),
      node("action-notes", "action", "lead-notes", {
        element: "textarea",
        locatorAttribute: "data-testid",
        locatorValue: "lead-notes",
        dynamic: false,
      }),
    ],
    edges: [],
    contentHash: MANIFEST_HASH,
  };
}

function livingEvent({ id, sequence, kind = "action", nodeId, surfaceId = "route-lead-detail" }) {
  return {
    schemaVersion: "living.workflow-event/v1",
    eventId: id,
    appId: "proof-app",
    environment: "development",
    releaseRevision: "proof-revision",
    occurredAt: new Date(Date.parse("2026-07-19T10:01:00.000Z") + sequence * 1_000).toISOString(),
    sequence,
    name: kind === "navigation" ? "navigation.complete" : "action.activate",
    kind,
    status: "succeeded",
    sessionId: "living-session-private-731",
    product: {
      manifestHash: MANIFEST_HASH,
      nodeId,
      ...(surfaceId === undefined ? {} : { surfaceId }),
    },
    metadata: { privateNote: SECRET },
    provenance: { source: "sdk", synthetic: true },
  };
}

function fixtureAnalysis() {
  const events = [
    livingEvent({
      id: "living-event-navigation-private",
      sequence: 0,
      kind: "navigation",
      nodeId: "route-lead-detail",
      surfaceId: undefined,
    }),
    livingEvent({ id: "living-event-lead-private", sequence: 1, nodeId: "action-lead-link" }),
    livingEvent({ id: "living-event-task-private", sequence: 2, nodeId: "action-task-checkbox" }),
    livingEvent({ id: "living-event-card-private", sequence: 3, nodeId: "action-board-card" }),
    livingEvent({ id: "living-event-stage-private", sequence: 4, nodeId: "action-board-stage" }),
  ];
  return {
    records: [],
    events,
    workflowCases: [
      {
        caseId: "session:living-session-private-731",
        sessionIds: ["living-session-private-731"],
        events,
        eventNames: events.map((event) => event.name),
        surfaces: events.map((event) => event.product.surfaceId ?? event.product.nodeId),
        durationMs: 4_000,
        outcome: "unknown",
      },
    ],
    workflowVariants: [
      {
        signature: events.map((event) => event.name).join(" -> "),
        eventNames: events.map((event) => event.name),
        caseCount: 1,
        sessionCount: 1,
        averageDurationMs: 4_000,
        outcomes: { succeeded: 0, failed: 0, abandoned: 0, unknown: 1 },
      },
    ],
    metricReport: {
      schemaVersion: "living.metric-report/v1",
      appId: "proof-app",
      manifestHash: MANIFEST_HASH,
      generatedAt: "2026-07-19T10:02:00.000Z",
      window: {
        from: "2026-07-19T10:01:00.000Z",
        to: "2026-07-19T10:02:00.000Z",
      },
      dataOrigin: "synthetic",
      totals: { events: events.length, sessions: 1, cases: 1, variants: 1 },
      values: [
        {
          id: "layout-offset",
          unit: "pixels",
          value: 24,
          samples: 2,
          productNodeId: "action-lead-link",
          routeNodeId: "route-lead-detail",
          viewportClass: "large",
        },
        {
          id: "layout-offset",
          unit: "pixels",
          value: 36,
          samples: 3,
          productNodeId: "action-task-checkbox",
          routeNodeId: "route-lead-detail",
          viewportClass: "large",
        },
      ],
    },
    opportunity: null,
    chainHead: ZERO_HASH,
  };
}

function simBase(seq, type) {
  return {
    v: 1,
    runId: "sim-run-private-991",
    mode: "browser",
    scenario: "mixed",
    sessionId: "sim-session-private-884",
    caseId: "sim-case-private-553",
    userId: "sim-user-private-228",
    persona: "sales-rep",
    seq,
    at: new Date(Date.parse("2026-07-19T11:00:00.000Z") + seq * 1_000).toISOString(),
    t: seq * 1_000,
    type,
  };
}

function simAction(seq, action, target, detail = undefined) {
  return {
    ...simBase(seq, "action"),
    name: `step-${seq}`,
    action,
    ...(target === undefined ? {} : { target }),
    page: "/leads/lead-private-19",
    durationMs: 100,
    outcome: "ok",
    attempt: 1,
    ...(detail === undefined ? {} : { detail }),
  };
}

function fixtureTraces() {
  return [
    simBase(0, "session_start"),
    simAction(1, "click", "lead-link-lead-private-19"),
    simAction(2, "click", "task-checkbox-task-private-05"),
    simAction(3, "click", "board-card-card-private-07"),
    simAction(4, "select", "board-stage-select-card-private-07"),
    simAction(5, "fill", "lead-notes", { text: SECRET, recordId: "lead-private-19" }),
    simAction(6, "read", "lead-link-lead-private-19", { text: SECRET }),
    {
      ...simBase(7, "session_end"),
      outcome: "completed",
      durationMs: 7_000,
      actions: 6,
      retries: 0,
      errors: 0,
    },
  ]
    .map((record) => JSON.stringify(record))
    .join("\n") + "\n";
}

function sources() {
  return {
    manifestSource: JSON.stringify(fixtureManifest()),
    analysisSource: JSON.stringify(fixtureAnalysis()),
    simTraceSource: fixtureTraces(),
  };
}

test("comparison output is byte-for-byte deterministic", () => {
  const input = sources();
  const first = compareIndependentProof(input);
  const second = compareIndependentProof(input);
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(second), JSON.stringify(first));
});

test("dynamic CRM targets normalize to manifest action families", () => {
  assert.equal(
    canonicalizeSimulatorTargetFamily("lead-link-lead-19", ["lead-link-*"]),
    "lead-link-*",
  );
  assert.equal(
    canonicalizeSimulatorTargetFamily("task-checkbox-task-05", ["task-checkbox-*"]),
    "task-checkbox-*",
  );
  assert.equal(
    canonicalizeSimulatorTargetFamily("board-card-card-07", ["board-card-*"]),
    "board-card-*",
  );
  assert.equal(
    canonicalizeSimulatorTargetFamily("board-stage-select-card-07", ["board-stage-select-*"]),
    "board-stage-select-*",
  );

  const result = compareIndependentProof(sources());
  assert.deepEqual(
    result.comparison.actionFamilyCoverage.matchedFamilies.map((item) => item.family),
    ["board-card-*", "board-stage-select-*", "lead-link-*", "task-checkbox-*"],
  );
  assert.deepEqual(
    result.comparison.routeCoverage.matchedFamilies.map((item) => item.family),
    ["/leads/:id"],
  );
  assert.equal(result.comparison.actionFamilyCoverage.groundTruthCoveredRatio, 1);
  assert.equal(result.comparison.matchedMotifs.length, 3);
});

test("source-linked manifest identifiers use the public contract grammar", () => {
  const manifest = fixtureManifest();
  const analysis = fixtureAnalysis();
  const routeId = "route:/leads/:id:1745537a243f";
  const actionId =
    "action:src/components/leads-table.tsx:data-testid:lead-link-:0:d2d44935cef3";

  const routeNode = manifest.nodes.find((item) => item.id === "route-lead-detail");
  const actionNode = manifest.nodes.find((item) => item.id === "action-lead-link");
  assert.ok(routeNode);
  assert.ok(actionNode);
  routeNode.id = routeId;
  actionNode.id = actionId;

  for (const event of analysis.events) {
    if (event.product.nodeId === "route-lead-detail") event.product.nodeId = routeId;
    if (event.product.nodeId === "action-lead-link") event.product.nodeId = actionId;
    if (event.product.surfaceId === "route-lead-detail") {
      event.product.surfaceId = routeId;
    }
  }
  for (const metric of analysis.metricReport.values) {
    if (metric.productNodeId === "action-lead-link") metric.productNodeId = actionId;
    if (metric.routeNodeId === "route-lead-detail") metric.routeNodeId = routeId;
  }

  const result = compareIndependentProof({
    manifestSource: JSON.stringify(manifest),
    analysisSource: JSON.stringify(analysis),
    simTraceSource: fixtureTraces(),
  });

  assert.deepEqual(
    result.comparison.actionFamilyCoverage.matchedFamilies.map((item) => item.family),
    ["board-card-*", "board-stage-select-*", "lead-link-*", "task-checkbox-*"],
  );
  assert.deepEqual(
    result.comparison.routeCoverage.matchedFamilies.map((item) => item.family),
    ["/leads/:id"],
  );
});

test("raw detail, text, dynamic ids, and source identifiers never appear", () => {
  const output = JSON.stringify(compareIndependentProof(sources()));
  for (const privateValue of [
    SECRET,
    "living-session-private-731",
    "living-event-lead-private",
    "sim-run-private-991",
    "sim-session-private-884",
    "sim-case-private-553",
    "sim-user-private-228",
    "action-lead-link",
    "action-task-checkbox",
    "lead-private-19",
    "task-private-05",
    "card-private-07",
  ]) {
    assert.equal(output.includes(privateValue), false, privateValue);
  }
  assert.equal(output.includes("privateNote"), false);
  assert.equal(output.includes("recordId"), false);
});

test("pixel metrics aggregate product scopes without emitting product node ids", () => {
  const input = sources();
  const result = compareIndependentProof(input);
  assert.deepEqual(result.primaryEvidence.metricSummary, {
    values: 2,
    productScopedValues: 2,
    routeScopedValues: 2,
    units: [
      {
        unit: "pixels",
        metricCount: 1,
        valueCount: 2,
        samples: 5,
      },
    ],
  });

  const analysis = fixtureAnalysis();
  analysis.metricReport.values.push({ ...analysis.metricReport.values[0] });
  assert.throws(
    () =>
      compareIndependentProof({
        ...input,
        analysisSource: JSON.stringify(analysis),
      }),
    (error) => error?.code === "ANALYSIS_METRICS_INVALID",
  );
});

test("sources are aggregated independently with no cross-id join surface", () => {
  const result = compareIndependentProof(sources());
  assert.equal(result.primaryEvidence.sessions, 1);
  assert.equal(result.groundTruth.sessions, 1);
  assert.equal(result.primaryEvidence.cases, 1);
  assert.equal(result.groundTruth.cases, 1);
  assert.equal(result.independence.crossSourceIdentifierJoin, false);
  assert.equal(result.independence.collectorCoreOrModelReceivedSimulatorData, false);

  const forbiddenKeys = new Set(["runId", "sessionId", "caseId", "userId", "eventId", "nodeId"]);
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        assert.equal(forbiddenKeys.has(key), false, key);
        visit(child);
      }
    }
  };
  visit(result);
});

test("read/fill and lifecycle records are intentional exclusions", () => {
  const result = compareIndependentProof(sources());
  const exclusions = new Map(
    result.comparison.intentionalExclusions.map((item) => [item.reason, item.count]),
  );
  assert.equal(exclusions.get("not-exact-action-parity"), 2);
  assert.equal(exclusions.get("session-bookkeeping"), 2);
  assert.equal(result.groundTruth.includedActions, 4);
});

test("unknown trace fields fail closed without echoing their value", () => {
  const input = sources();
  const line = JSON.parse(input.simTraceSource.split("\n")[1]);
  line.unexpected = SECRET;
  assert.throws(
    () => compareIndependentProof({ ...input, simTraceSource: `${JSON.stringify(line)}\n` }),
    (error) => error?.code === "SIM_TRACE_RECORD_INVALID" && !error.message.includes(SECRET),
  );
});

test("CLI requires exactly the three independent input flags", () => {
  assert.deepEqual(
    parseCliArguments([
      "--manifest",
      "manifest.json",
      "--analysis",
      "analysis.json",
      "--sim-traces",
      "traces.jsonl",
    ]),
    {
      manifest: "manifest.json",
      analysis: "analysis.json",
      simTraces: "traces.jsonl",
    },
  );
  assert.throws(() => parseCliArguments(["--manifest", "manifest.json"]));
});
