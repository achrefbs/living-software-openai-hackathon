import assert from "node:assert/strict";
import test from "node:test";

import {
  parseMetricReport,
  type MetricReport,
  type WorkflowEvent,
} from "@living-software/contracts";
import {
  projectWorkflowCases,
  projectWorkflowVariants,
} from "@living-software/core";

import {
  buildMetricValues,
  SMALL_TARGET_THRESHOLD_CSS_PIXELS,
} from "./metric-reducer.js";

const MANIFEST_HASH = `sha256:${"c".repeat(64)}` as const;
const BASE_TIME = Date.parse("2026-07-20T09:00:00.000Z");

function event(
  sessionId: string,
  sequence: number,
  offsetMs: number,
  options: {
    readonly name: string;
    readonly kind: WorkflowEvent["kind"];
    readonly nodeId?: string;
    readonly routeNodeId?: string;
    readonly metadata: WorkflowEvent["metadata"];
    readonly status?: WorkflowEvent["status"];
  },
): WorkflowEvent {
  return {
    schemaVersion: "living.workflow-event/v1",
    eventId: `evt-${sessionId}-${sequence}`,
    appId: "fixture-app",
    environment: "development",
    releaseRevision: "source:fixture",
    occurredAt: new Date(BASE_TIME + offsetMs).toISOString(),
    sequence,
    name: options.name,
    kind: options.kind,
    status: options.status ?? "succeeded",
    sessionId,
    ...(options.nodeId === undefined
      ? {}
      : {
          product: {
            manifestHash: MANIFEST_HASH,
            nodeId: options.nodeId,
            ...(options.routeNodeId === undefined
              ? {}
              : { surfaceId: options.routeNodeId }),
          },
        }),
    metadata: options.metadata,
    provenance: { source: "technical-telemetry", synthetic: true },
  };
}

function geometry(
  interaction: "click" | "change" | "submit",
  options: {
    readonly documentX: number;
    readonly documentY: number;
    readonly width: number;
    readonly height: number;
    readonly viewportWidth: number;
    readonly viewportHeight: number;
    readonly scrollY: number;
    readonly visibility: number;
  },
): WorkflowEvent["metadata"] {
  return {
    interaction,
    targetGeometry: {
      x: options.documentX,
      y: options.documentY - options.scrollY,
      width: options.width,
      height: options.height,
    },
    viewport: {
      width: options.viewportWidth,
      height: options.viewportHeight,
      scrollX: 0,
      scrollY: options.scrollY,
      pixelRatio: 1,
    },
    visibility: {
      ratio: options.visibility,
      inViewport: options.visibility > 0,
    },
    position: {
      layout: "flow",
      documentX: options.documentX,
      documentY: options.documentY,
    },
    state: { disabled: false },
  };
}

function signalMetadata(
  signal: "dead-click" | "rage-click" | "correction",
): WorkflowEvent["metadata"] {
  const metadata = geometry("click", {
    documentX: 60,
    documentY: 80,
    width: 40,
    height: 40,
    viewportWidth: 500,
    viewportHeight: 800,
    scrollY: 200,
    visibility: 1,
  });
  const { interaction: _interaction, ...rest } = metadata;
  return { signal, ...rest };
}

function fullFixture(): WorkflowEvent[] {
  return [
    event("session-a", 0, 0, {
      name: "route.home.start",
      kind: "navigation",
      nodeId: "route.home",
      routeNodeId: "route.home",
      metadata: { routePhase: "start" },
      status: "started",
    }),
    event("session-a", 1, 100, {
      name: "route.home.complete",
      kind: "navigation",
      nodeId: "route.home",
      routeNodeId: "route.home",
      metadata: { routePhase: "complete" },
    }),
    event("session-a", 2, 200, {
      name: "action.save.click",
      kind: "action",
      nodeId: "action.save",
      routeNodeId: "route.home",
      metadata: geometry("click", {
        documentX: 0,
        documentY: 0,
        width: 40,
        height: 40,
        viewportWidth: 500,
        viewportHeight: 800,
        scrollY: 0,
        visibility: 0.5,
      }),
    }),
    event("session-a", 3, 300, {
      name: "action.save.submit",
      kind: "action",
      nodeId: "action.save",
      routeNodeId: "route.home",
      metadata: geometry("submit", {
        documentX: 30,
        documentY: 40,
        width: 40,
        height: 40,
        viewportWidth: 500,
        viewportHeight: 800,
        scrollY: 100,
        visibility: 1,
      }),
      status: "started",
    }),
    event("session-a", 4, 400, {
      name: "action.save.submit",
      kind: "action",
      nodeId: "action.save",
      routeNodeId: "route.home",
      metadata: geometry("submit", {
        documentX: 60,
        documentY: 80,
        width: 40,
        height: 40,
        viewportWidth: 500,
        viewportHeight: 800,
        scrollY: 200,
        visibility: 0.5,
      }),
      status: "started",
    }),
    event("session-a", 5, 500, {
      name: "signal.dead-click",
      kind: "outcome",
      nodeId: "action.save",
      routeNodeId: "route.home",
      metadata: signalMetadata("dead-click"),
    }),
    event("session-a", 6, 600, {
      name: "signal.rage-click",
      kind: "outcome",
      nodeId: "action.save",
      routeNodeId: "route.home",
      metadata: signalMetadata("rage-click"),
    }),
    event("session-a", 7, 700, {
      name: "signal.correction",
      kind: "outcome",
      nodeId: "action.save",
      routeNodeId: "route.home",
      metadata: signalMetadata("correction"),
    }),
    event("session-a", 8, 800, {
      name: "system.runtime-error",
      kind: "error",
      nodeId: "integration.storage",
      metadata: { errorCategory: "script-runtime", sanitized: true },
      status: "failed",
    }),
    event("session-a", 9, 900, {
      name: "system.lcp",
      kind: "system",
      nodeId: "integration.storage",
      metadata: { metric: "lcp", value: 1200, unit: "millisecond" },
    }),
    event("session-a", 10, 1000, {
      name: "system.inp",
      kind: "system",
      nodeId: "integration.storage",
      metadata: { metric: "inp", value: 200, unit: "millisecond" },
    }),
    event("session-a", 11, 1100, {
      name: "system.cls",
      kind: "system",
      nodeId: "integration.storage",
      metadata: { metric: "cls", value: 0.1, unit: "score" },
    }),
    event("session-a", 12, 1200, {
      name: "route.settings.start",
      kind: "navigation",
      nodeId: "route.settings",
      routeNodeId: "route.settings",
      metadata: { routePhase: "start" },
      status: "started",
    }),
    event("session-a", 13, 1500, {
      name: "route.settings.complete",
      kind: "navigation",
      nodeId: "route.settings",
      routeNodeId: "route.settings",
      metadata: { routePhase: "complete" },
    }),
    event("session-b", 0, 0, {
      name: "route.home.start",
      kind: "navigation",
      nodeId: "route.home",
      routeNodeId: "route.home",
      metadata: { routePhase: "start" },
      status: "started",
    }),
    event("session-b", 1, 300, {
      name: "route.home.complete",
      kind: "navigation",
      nodeId: "route.home",
      routeNodeId: "route.home",
      metadata: { routePhase: "complete" },
    }),
    event("session-b", 2, 400, {
      name: "action.save.click",
      kind: "action",
      nodeId: "action.save",
      routeNodeId: "route.home",
      metadata: geometry("click", {
        documentX: 1000,
        documentY: 2000,
        width: 48,
        height: 48,
        viewportWidth: 500,
        viewportHeight: 800,
        scrollY: 900,
        visibility: 1,
      }),
    }),
    event("session-b", 3, 500, {
      name: "action.filter.change",
      kind: "action",
      nodeId: "action.filter",
      routeNodeId: "route.home",
      metadata: geometry("change", {
        documentX: 100,
        documentY: 100,
        width: 50,
        height: 50,
        viewportWidth: 1200,
        viewportHeight: 800,
        scrollY: 0,
        visibility: 1,
      }),
    }),
  ];
}

function journeyTelemetry(withBacktrack = false): WorkflowEvent[] {
  const events = [
    event("session-journey", 0, 0, {
      name: "route.dashboard.start",
      kind: "navigation",
      nodeId: "route.dashboard",
      routeNodeId: "route.dashboard",
      metadata: { routePhase: "start" },
      status: "started",
    }),
    event("session-journey", 1, 10, {
      name: "performance.cls",
      kind: "system",
      nodeId: "integration.performance",
      metadata: { metric: "cls", value: 0.01, unit: "score" },
    }),
    event("session-journey", 2, 20, {
      name: "route.dashboard.complete",
      kind: "navigation",
      nodeId: "route.dashboard",
      routeNodeId: "route.dashboard",
      metadata: { routePhase: "complete" },
    }),
    event("session-journey", 3, 30, {
      name: "performance.lcp",
      kind: "system",
      nodeId: "integration.performance",
      metadata: { metric: "lcp", value: 420, unit: "millisecond" },
    }),
    event("session-journey", 4, 40, {
      name: "route.dashboard.start",
      kind: "navigation",
      nodeId: "route.dashboard",
      routeNodeId: "route.dashboard",
      metadata: { routePhase: "start" },
      status: "started",
    }),
    event("session-journey", 5, 50, {
      name: "performance.cls",
      kind: "system",
      nodeId: "integration.performance",
      metadata: { metric: "cls", value: 0.02, unit: "score" },
    }),
    event("session-journey", 6, 60, {
      name: "route.dashboard.complete",
      kind: "navigation",
      nodeId: "route.dashboard",
      routeNodeId: "route.dashboard",
      metadata: { routePhase: "complete" },
    }),
    event("session-journey", 7, 70, {
      name: "action.open-leads",
      kind: "action",
      nodeId: "action.open-leads",
      routeNodeId: "route.dashboard",
      metadata: { interaction: "click" },
    }),
    event("session-journey", 8, 80, {
      name: "route.leads.start",
      kind: "navigation",
      nodeId: "route.leads",
      routeNodeId: "route.leads",
      metadata: { routePhase: "start" },
      status: "started",
    }),
    event("session-journey", 9, 90, {
      name: "performance.lcp",
      kind: "system",
      nodeId: "integration.performance",
      metadata: { metric: "lcp", value: 390, unit: "millisecond" },
    }),
    event("session-journey", 10, 100, {
      name: "route.leads.complete",
      kind: "navigation",
      nodeId: "route.leads",
      routeNodeId: "route.leads",
      metadata: { routePhase: "complete" },
    }),
  ];

  if (withBacktrack) {
    events.push(
      event("session-journey", 11, 110, {
        name: "action.back",
        kind: "action",
        nodeId: "action.back",
        routeNodeId: "route.leads",
        metadata: { interaction: "click" },
      }),
      event("session-journey", 12, 120, {
        name: "route.dashboard.start",
        kind: "navigation",
        nodeId: "route.dashboard",
        routeNodeId: "route.dashboard",
        metadata: { routePhase: "start" },
        status: "started",
      }),
      event("session-journey", 13, 130, {
        name: "performance.cls",
        kind: "system",
        nodeId: "integration.performance",
        metadata: { metric: "cls", value: 0.03, unit: "score" },
      }),
      event("session-journey", 14, 140, {
        name: "route.dashboard.complete",
        kind: "navigation",
        nodeId: "route.dashboard",
        routeNodeId: "route.dashboard",
        metadata: { routePhase: "complete" },
      }),
    );
  }

  events.push(
    event("session-journey", withBacktrack ? 15 : 11, 150, {
      name: "session.pagehide",
      kind: "system",
      nodeId: "integration.performance",
      metadata: { lifecycle: "pagehide" },
    }),
  );
  return events;
}

function metric(
  report: readonly MetricReport["values"][number][],
  id: string,
  scope: {
    readonly productNodeId?: string;
    readonly routeNodeId?: string;
    readonly viewportClass?: string;
  } = {},
): MetricReport["values"][number] {
  const found = report.find(
    (entry) =>
      entry.id === id &&
      entry.productNodeId === scope.productNodeId &&
      entry.routeNodeId === scope.routeNodeId &&
      entry.viewportClass === scope.viewportClass,
  );
  assert.ok(found, `Missing metric ${id} ${JSON.stringify(scope)}`);
  return found;
}

test("reduces the first-slice catalog with exact deterministic scopes and formulas", () => {
  const events = fullFixture();
  const cases = projectWorkflowCases(events);
  const variants = projectWorkflowVariants(events);
  const values = buildMetricValues(events, cases, variants);

  assert.equal(SMALL_TARGET_THRESHOLD_CSS_PIXELS, 44);
  assert.deepEqual(metric(values, "workflow.actions-per-case-average"), {
    id: "workflow.actions-per-case-average",
    unit: "count",
    value: 2.5,
    samples: 2,
  });
  assert.equal(metric(values, "workflow.case-duration-average").value, 1000);
  assert.equal(metric(values, "workflow.repeated-submit-case-ratio").value, 0.5);

  assert.equal(
    metric(values, "navigation.route-complete-frequency", {
      routeNodeId: "route.home",
    }).value,
    2,
  );
  assert.equal(
    metric(values, "navigation.route-complete-frequency", {
      routeNodeId: "route.settings",
    }).value,
    1,
  );
  const saveScope = {
    productNodeId: "action.save",
    routeNodeId: "route.home",
    viewportClass: "small",
  } as const;
  assert.equal(metric(values, "interaction.control-frequency", saveScope).value, 4);
  assert.equal(metric(values, "layout.small-target-ratio", saveScope).value, 0.75);
  assert.equal(metric(values, "layout.visibility-average", saveScope).value, 0.75);
  assert.equal(
    metric(values, "layout.target-area-ratio-average", saveScope).value,
    0.00444,
  );

  const movementScope = {
    routeNodeId: "route.home",
    viewportClass: "small",
  } as const;
  assert.deepEqual(metric(values, "layout.scroll-burden-average", movementScope), {
    id: "layout.scroll-burden-average",
    unit: "pixels",
    value: 100,
    samples: 2,
    ...movementScope,
  });
  assert.deepEqual(metric(values, "layout.target-distance-average", movementScope), {
    id: "layout.target-distance-average",
    unit: "pixels",
    value: 50,
    samples: 2,
    ...movementScope,
  });
  assert.equal(
    metric(values, "performance.route-transition-average", {
      routeNodeId: "route.home",
    }).value,
    200,
  );
  assert.equal(
    metric(values, "performance.route-transition-average", {
      routeNodeId: "route.home",
    }).samples,
    2,
  );
  assert.equal(
    metric(values, "performance.route-transition-average", {
      routeNodeId: "route.settings",
    }).value,
    300,
  );

  for (const signal of ["dead-click", "rage-click", "correction"] as const) {
    assert.equal(metric(values, `friction.${signal}-count`).value, 1);
    assert.equal(metric(values, `friction.${signal}-case-ratio`).value, 0.5);
  }
  assert.equal(metric(values, "reliability.runtime-error-count").value, 1);
  assert.equal(metric(values, "performance.lcp-average").value, 1200);
  assert.equal(metric(values, "performance.inp-average").value, 200);
  assert.equal(metric(values, "performance.cls-average").value, 0.1);

  assert.doesNotThrow(() =>
    parseMetricReport({
      schemaVersion: "living.metric-report/v1",
      appId: "fixture-app",
      manifestHash: MANIFEST_HASH,
      generatedAt: "2026-07-20T10:00:00.000Z",
      window: {
        from: events[0]?.occurredAt,
        to: events.at(-1)?.occurredAt,
      },
      dataOrigin: "synthetic",
      totals: {
        events: events.length,
        sessions: 2,
        cases: cases.length,
        variants: variants.length,
      },
      values,
    }),
  );
});

test("never pairs target movement across sessions", () => {
  const events = fullFixture();
  const values = buildMetricValues(
    events,
    projectWorkflowCases(events),
    projectWorkflowVariants(events),
  );
  const distance = metric(values, "layout.target-distance-average", {
    routeNodeId: "route.home",
    viewportClass: "small",
  });
  assert.equal(distance.samples, 2);
  assert.equal(distance.value, 50);
});

test("backtracking ignores route phases and vitals but preserves a true revisit", () => {
  const normalEvents = journeyTelemetry();
  const normalValues = buildMetricValues(
    normalEvents,
    projectWorkflowCases(normalEvents),
    projectWorkflowVariants(normalEvents),
  );
  assert.deepEqual(metric(normalValues, "workflow.backtracking-ratio"), {
    id: "workflow.backtracking-ratio",
    unit: "ratio",
    value: 0,
    samples: 1,
  });
  assert.equal(
    normalValues.some((entry) => entry.id === "workflow.abandonment-ratio"),
    false,
  );

  const backtrackEvents = journeyTelemetry(true);
  const backtrackValues = buildMetricValues(
    backtrackEvents,
    projectWorkflowCases(backtrackEvents),
    projectWorkflowVariants(backtrackEvents),
  );
  assert.equal(
    metric(backtrackValues, "workflow.backtracking-ratio").value,
    1,
  );
});

test("abandonment uses known outcomes only and never infers pagehide success", () => {
  const events = [
    event("session-success", 0, 0, {
      name: "workflow.completed",
      kind: "outcome",
      nodeId: "action.complete",
      metadata: {},
    }),
    event("session-abandoned", 0, 10, {
      name: "action.cancel",
      kind: "action",
      nodeId: "action.cancel",
      metadata: { interaction: "click" },
      status: "abandoned",
    }),
    event("session-unknown", 0, 20, {
      name: "route.home.complete",
      kind: "navigation",
      nodeId: "route.home",
      routeNodeId: "route.home",
      metadata: { routePhase: "complete" },
    }),
    event("session-unknown", 1, 30, {
      name: "session.pagehide",
      kind: "system",
      nodeId: "integration.performance",
      metadata: { lifecycle: "pagehide" },
    }),
  ];
  const values = buildMetricValues(
    events,
    projectWorkflowCases(events),
    projectWorkflowVariants(events),
  );

  assert.deepEqual(metric(values, "workflow.abandonment-ratio"), {
    id: "workflow.abandonment-ratio",
    unit: "ratio",
    value: 0.5,
    samples: 2,
  });
});

test("omits scoped and paired metrics when required metadata is absent", () => {
  const events = [
    event("session-missing", 0, 0, {
      name: "route.unknown.complete",
      kind: "navigation",
      metadata: { routePhase: "complete" },
    }),
    event("session-missing", 1, 100, {
      name: "action.unknown.click",
      kind: "action",
      metadata: { interaction: "click" },
    }),
    event("session-missing", 2, 200, {
      name: "route.unmatched.start",
      kind: "navigation",
      nodeId: "route.unmatched",
      metadata: { routePhase: "start" },
      status: "started",
    }),
  ];
  const values = buildMetricValues(
    events,
    projectWorkflowCases(events),
    projectWorkflowVariants(events),
  );
  const omitted = new Set([
    "interaction.control-frequency",
    "navigation.route-complete-frequency",
    "layout.scroll-burden-average",
    "layout.small-target-ratio",
    "layout.visibility-average",
    "layout.target-area-ratio-average",
    "layout.target-distance-average",
    "performance.route-transition-average",
    "workflow.repeated-submit-case-ratio",
    "friction.dead-click-count",
    "reliability.runtime-error-count",
    "performance.lcp-average",
    "performance.inp-average",
    "performance.cls-average",
  ]);
  assert.ok(values.every((entry) => !omitted.has(entry.id)));
  assert.equal(metric(values, "workflow.actions-per-case-average").value, 1);
});
