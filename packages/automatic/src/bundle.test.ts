import assert from "node:assert/strict";
import test from "node:test";

import {
  metricCatalogSchema,
  observationRuntimeMapSchema,
  parseDiscoveryResult,
  parseLivingConfig,
  parseProductManifest,
  parseWorkflowEvent,
  validateWorkflowEventAgainstConfig,
  type DiscoveryResult,
} from "@living-software/contracts";

import { buildAutomaticInstallBundle } from "./bundle.js";
import { AutomaticBundleError } from "./types.js";

const REVISION = `sha256:${"a".repeat(64)}`;
const MANIFEST_HASH = `sha256:${"b".repeat(64)}`;

function emptyMetadataSchema(): Record<string, unknown> {
  return { type: "object", additionalProperties: false, properties: {} };
}

function discoveryFixture(): DiscoveryResult {
  const source = { path: "src/app/page.tsx", revision: REVISION, line: 1 };
  const provenance = { origin: "scanned" as const, confidence: 1, sources: [source] };
  return parseDiscoveryResult({
    schemaVersion: "living.discovery-result/v1",
    support: {
      framework: "next-app-router",
      detectedVersion: "16.1.0",
      supportedRange: ">=15.3.0",
    },
    sourceDigest: REVISION,
    manifest: {
      schemaVersion: "living.product-manifest/v1",
      appId: "fixture-crm",
      release: { revision: REVISION, version: "1.0.0" },
      generatedAt: "2026-07-19T10:00:00.000Z",
      generators: [
        { adapterId: "next-app-router-discovery", adapterVersion: "0.1.0" },
      ],
      nodes: [
        { id: "route:/", kind: "route", displayName: "/", provenance },
        {
          id: "route:/settings",
          kind: "route",
          displayName: "/settings",
          provenance,
        },
        {
          id: "surface:home",
          kind: "surface",
          displayName: "Home page",
          provenance,
        },
        {
          id: "surface:settings",
          kind: "surface",
          displayName: "Settings page",
          provenance,
        },
        {
          id: "surface:shared",
          kind: "surface",
          displayName: "Shared shell",
          provenance,
        },
        {
          id: "action:save",
          kind: "action",
          displayName: "Save",
          provenance,
        },
        {
          id: "action:delete",
          kind: "action",
          displayName: "Delete",
          provenance,
        },
        {
          id: "action:living",
          kind: "action",
          displayName: "Living id",
          provenance,
        },
        {
          id: "action:ambiguous",
          kind: "action",
          displayName: "Shared action",
          provenance,
        },
        {
          id: "action:presence",
          kind: "surface",
          displayName: "Presence only",
          provenance,
        },
        {
          id: "action:combined",
          kind: "action",
          displayName: "Combined matcher",
          provenance,
        },
        {
          id: "integration:storage",
          kind: "integration",
          displayName: "localStorage",
          provenance,
        },
      ],
      edges: [
        { from: "route:/", to: "surface:home", relation: "renders", provenance },
        {
          from: "route:/settings",
          to: "surface:settings",
          relation: "renders",
          provenance,
        },
        { from: "route:/", to: "surface:shared", relation: "renders", provenance },
        {
          from: "route:/settings",
          to: "surface:shared",
          relation: "renders",
          provenance,
        },
        { from: "surface:home", to: "action:save", relation: "exposes", provenance },
        {
          from: "surface:settings",
          to: "action:delete",
          relation: "exposes",
          provenance,
        },
        {
          from: "surface:home",
          to: "action:living",
          relation: "exposes",
          provenance,
        },
        {
          from: "surface:shared",
          to: "action:ambiguous",
          relation: "exposes",
          provenance,
        },
      ],
      contentHash: MANIFEST_HASH,
    },
    config: {
      schemaVersion: "living.config/v1",
      application: { id: "fixture-crm", displayName: "Fixture CRM" },
      adapters: [{ id: "next-app-router-discovery", version: "0.1.0" }],
      collector: { endpoint: "http://127.0.0.1:4318/v1/living/events" },
      manifest: { root: "." },
      semantics: {
        events: {
          "navigation.view": {
            kind: "navigation",
            metadataSchema: emptyMetadataSchema(),
          },
          "action.activate": {
            kind: "action",
            metadataSchema: emptyMetadataSchema(),
          },
          "layout.geometry": {
            kind: "system",
            metadataSchema: emptyMetadataSchema(),
          },
          "endpoint.request": {
            kind: "outcome",
            metadataSchema: emptyMetadataSchema(),
          },
        },
      },
      privacy: {
        metadataPolicy: "deny-by-default",
        identifierMode: "anonymous",
        retentionDays: 30,
      },
    },
    runtimeLocatorMap: {
      schemaVersion: "living.runtime-locator-map/v1",
      locators: [
        {
          token: "locator:route-home",
          nodeId: "route:/",
          strategy: "route",
          selector: "/",
          normalizedValue: "/",
          dynamic: false,
          match: { kind: "exact", value: "/" },
          eventBindings: ["navigation.view"],
          captures: ["view"],
          source,
        },
        {
          token: "locator:route-settings",
          nodeId: "route:/settings",
          strategy: "route",
          selector: "/settings",
          normalizedValue: "/settings",
          dynamic: false,
          match: { kind: "exact", value: "/settings" },
          eventBindings: ["navigation.view"],
          captures: ["view"],
          source,
        },
        {
          token: "locator:save",
          nodeId: "action:save",
          strategy: "data-testid",
          selector: '[data-testid="RAW-SELECTOR-SENTINEL"]',
          normalizedValue: "save-control",
          dynamic: false,
          match: { kind: "exact", value: "save-control" },
          eventBindings: ["action.activate", "layout.geometry"],
          captures: ["activate", "geometry"],
          source,
        },
        {
          token: "locator:delete",
          nodeId: "action:delete",
          strategy: "data-testid",
          selector: '[data-testid^="delete-"]',
          normalizedValue: "delete-{*}",
          dynamic: true,
          match: { kind: "prefix", value: "delete-" },
          eventBindings: ["action.activate", "layout.geometry"],
          captures: ["activate", "geometry"],
          source,
        },
        {
          token: "locator:living",
          nodeId: "action:living",
          strategy: "data-living-id",
          selector: '[data-living-id="safe-living-id"]',
          normalizedValue: "safe-living-id",
          dynamic: false,
          match: { kind: "exact", value: "safe-living-id" },
          eventBindings: ["action.activate"],
          captures: ["activate"],
          source,
        },
        {
          token: "locator:ambiguous",
          nodeId: "action:ambiguous",
          strategy: "data-testid",
          selector: '[data-testid="shared-action"]',
          normalizedValue: "shared-action",
          dynamic: false,
          match: { kind: "exact", value: "shared-action" },
          eventBindings: ["action.activate"],
          captures: ["activate"],
          source,
        },
        {
          token: "locator:presence",
          nodeId: "action:presence",
          strategy: "data-testid",
          selector: "[data-testid]",
          normalizedValue: "{*}",
          dynamic: true,
          match: { kind: "presence" },
          eventBindings: ["action.activate"],
          captures: ["activate"],
          source,
        },
        {
          token: "locator:combined",
          nodeId: "action:combined",
          strategy: "data-testid",
          selector: '[data-testid^="row-"][data-testid$="-edit"]',
          normalizedValue: "row-{*}-edit",
          dynamic: true,
          match: { kind: "prefix-suffix", prefix: "row-", suffix: "-edit" },
          eventBindings: ["action.activate"],
          captures: ["activate"],
          source,
        },
      ],
    },
    metricCatalog: {
      schemaVersion: "living.metric-catalog/v1",
      metrics: [
        {
          id: "metric:save-action",
          eventName: "action.activate",
          kind: "workflow",
          targetNodeId: "action:save",
          trigger: "click",
          fields: ["locatorId"],
          provenance: "scanned",
        },
        {
          id: "metric:save-layout",
          eventName: "layout.geometry",
          kind: "layout",
          targetNodeId: "action:save",
          trigger: "geometry",
          fields: ["x", "y"],
          provenance: "scanned",
        },
        {
          id: "metric:delete-action",
          eventName: "action.activate",
          kind: "workflow",
          targetNodeId: "action:delete",
          trigger: "click",
          fields: ["locatorId"],
          provenance: "scanned",
        },
        {
          id: "metric:home-route",
          eventName: "navigation.view",
          kind: "workflow",
          targetNodeId: "route:/",
          trigger: "route",
          fields: ["route"],
          provenance: "scanned",
        },
        {
          id: "metric:presence-action",
          eventName: "action.activate",
          kind: "workflow",
          targetNodeId: "action:presence",
          trigger: "click",
          fields: ["locatorId"],
          provenance: "inferred",
        },
      ],
    },
    diagnostics: [],
    stats: { scannedFiles: 8, scannedBytes: 1024, skippedFiles: 0 },
  });
}

test("builds deterministic validated artifacts without generating a collector", () => {
  const discovery = discoveryFixture();
  const first = buildAutomaticInstallBundle(discovery, {
    synthetic: true,
    environment: "development",
  });
  const second = buildAutomaticInstallBundle(discovery, {
    synthetic: true,
    environment: "development",
  });

  assert.deepEqual(second, first);
  assert.equal(first.manifest, discovery.manifest);
  parseProductManifest(first.manifest);
  parseLivingConfig(first.config);
  observationRuntimeMapSchema.parse(first.observationRuntimeMap);
  metricCatalogSchema.parse(first.metricCatalog);
  assert.equal(first.observationRuntimeMap.application.synthetic, true);
  assert.equal(first.observationRuntimeMap.limits.maxBatchSize, 10);
  assert.equal(first.observationRuntimeMap.limits.flushIntervalMs, 1_000);
  assert.equal(first.config.collector.endpoint, "/api/living/events");
  assert.equal(
    first.observationRuntimeMap.collector.endpoint,
    first.config.collector.endpoint,
  );
  assert.deepEqual(
    first.artifacts.map((entry) => entry.path),
    [
      ".living/config.json",
      ".living/product-manifest.json",
      ".living/observation-runtime.json",
      ".living/metric-catalog.json",
      ".living/.gitignore",
      "src/instrumentation-client.ts",
      "src/living-observer.generated.ts",
    ],
  );
  assert.ok(!first.artifacts.some((entry) => entry.path.includes("api/living")));
});

test("generates distinct node-specific events with unambiguous route scopes", () => {
  const bundle = buildAutomaticInstallBundle(discoveryFixture(), {
    synthetic: false,
  });
  const save = bundle.observationRuntimeMap.targets.find(
    (target) => target.token === "locator:save",
  );
  const remove = bundle.observationRuntimeMap.targets.find(
    (target) => target.token === "locator:delete",
  );
  const ambiguous = bundle.observationRuntimeMap.targets.find(
    (target) => target.token === "locator:ambiguous",
  );
  assert.ok(save?.events.click);
  assert.ok(remove?.events.click);
  assert.notEqual(save.events.click.eventName, remove.events.click.eventName);
  assert.match(save.events.click.eventName, /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/u);
  assert.equal(save.events.click.surfaceId, "route:/");
  assert.equal(remove.events.click.surfaceId, "route:/settings");
  assert.equal(ambiguous?.events.click?.surfaceId, undefined);
  assert.ok(bundle.config.semantics.events[save.events.click.eventName]);
  assert.ok(
    bundle.diagnostics.some(
      (entry) =>
        entry.code === "ambiguous-route-owner" &&
        entry.nodeId === "action:ambiguous",
    ),
  );
  assert.ok(
    bundle.observationRuntimeMap.routes.every(
      (route) =>
        route.start.surfaceId === route.start.nodeId &&
        route.complete.surfaceId === route.complete.nodeId,
    ),
  );
});

test("generated observer events validate against anonymous installed semantics", () => {
  const bundle = buildAutomaticInstallBundle(discoveryFixture(), {
    synthetic: false,
  });
  const binding = bundle.observationRuntimeMap.targets.find(
    (target) => target.token === "locator:save",
  )?.events.click;
  assert.ok(binding);
  const event = parseWorkflowEvent({
    schemaVersion: "living.workflow-event/v1",
    eventId: "evt-validation",
    appId: bundle.config.application.id,
    environment: "development",
    releaseRevision: bundle.manifest.release.revision,
    occurredAt: "2026-07-19T10:01:00.000Z",
    sequence: 0,
    name: binding.eventName,
    kind: binding.kind,
    status: "succeeded",
    sessionId: "session-validation",
    product: {
      manifestHash: bundle.manifest.contentHash,
      nodeId: binding.nodeId,
      ...(binding.surfaceId === undefined ? {} : { surfaceId: binding.surfaceId }),
    },
    metadata: {
      interaction: "click",
      targetGeometry: { x: 12, y: 18, width: 120, height: 40 },
      viewport: {
        width: 1280,
        height: 720,
        scrollX: 0,
        scrollY: 0,
        pixelRatio: 1,
      },
      visibility: { ratio: 1, inViewport: true },
      position: { layout: "flow", documentX: 12, documentY: 18 },
      state: { disabled: false },
    },
    provenance: { source: "technical-telemetry", synthetic: false },
  });
  assert.deepEqual(validateWorkflowEventAgainstConfig(event, bundle.config), {
    ok: true,
  });
  assert.equal(bundle.config.semantics.events[binding.eventName]?.subjectType, undefined);
});

test("serializes only normalized locator descriptors and omits unsupported matches", () => {
  const bundle = buildAutomaticInstallBundle(discoveryFixture(), {
    synthetic: true,
  });
  const serialized = JSON.stringify(bundle);
  assert.ok(!serialized.includes("RAW-SELECTOR-SENTINEL"));
  assert.ok(!serialized.includes('[data-testid^="delete-"]'));
  assert.ok(
    !bundle.observationRuntimeMap.targets.some(
      (target) =>
        target.token === "locator:presence" ||
        target.token === "locator:combined",
    ),
  );
  assert.equal(
    bundle.diagnostics.filter(
      (entry) => entry.code === "unsupported-locator-match",
    ).length,
    2,
  );
  assert.ok(
    bundle.observationRuntimeMap.targets.some((target) =>
      target.locators.some(
        (locator) =>
          locator.strategy === "living-id" && locator.value === "safe-living-id",
      ),
    ),
  );
});

test("refuses generic wildcard locators that are promoted to action nodes", () => {
  const unsafe = structuredClone(discoveryFixture());
  const presence = unsafe.manifest.nodes.find(
    (node) => node.id === "action:presence",
  );
  assert.ok(presence);
  Object.assign(presence, { kind: "action" as const });

  assert.throws(
    () =>
      buildAutomaticInstallBundle(parseDiscoveryResult(unsafe), {
        synthetic: true,
      }),
    (error) =>
      error instanceof AutomaticBundleError &&
      error.code === "generic-action-family",
  );
});

test("normalizes installed metrics to metadata the observer really emits", () => {
  const bundle = buildAutomaticInstallBundle(discoveryFixture(), {
    synthetic: false,
  });
  assert.ok(
    bundle.metricCatalog.metrics.every(
      (metric) => !metric.fields.includes("locatorId"),
    ),
  );
  const saveMetric = bundle.metricCatalog.metrics.find(
    (metric) => metric.id === "metric:save-action",
  );
  assert.deepEqual(saveMetric?.fields, [
    "interaction",
    "targetGeometry",
    "viewport",
    "visibility",
    "position",
    "state",
  ]);
  assert.ok(saveMetric?.eventName.startsWith("observed.action."));
  assert.ok(
    !bundle.metricCatalog.metrics.some(
      (metric) => metric.id === "metric:presence-action",
    ),
  );
  assert.ok(
    bundle.diagnostics.some(
      (entry) =>
        entry.code === "unobserved-metric-omitted" &&
        entry.nodeId === "action:presence",
    ),
  );
});

test("deduplicates repeated diagnostics by stable source identity", () => {
  const source = discoveryFixture();
  const omitted = source.metricCatalog.metrics.find(
    (metric) => metric.id === "metric:presence-action",
  );
  assert.ok(omitted);
  const discovery = parseDiscoveryResult({
    ...source,
    metricCatalog: {
      ...source.metricCatalog,
      metrics: [
        ...source.metricCatalog.metrics,
        { ...omitted, id: "metric:presence-action-duplicate" },
      ],
    },
  });

  const first = buildAutomaticInstallBundle(discovery, { synthetic: true });
  const second = buildAutomaticInstallBundle(discovery, { synthetic: true });
  assert.deepEqual(second.diagnostics, first.diagnostics);
  assert.equal(
    first.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code === "unobserved-metric-omitted" &&
        diagnostic.nodeId === "action:presence" &&
        diagnostic.token === undefined,
    ).length,
    1,
  );
  const keys = first.diagnostics.map((diagnostic) =>
    [
      diagnostic.code,
      diagnostic.nodeId ?? "",
      diagnostic.token ?? "",
      diagnostic.severity,
      diagnostic.message,
    ].join("\0"),
  );
  assert.deepEqual(keys, [...keys].sort());
});

test("requires explicit provenance mode and enforces observer safety bounds", () => {
  const discovery = discoveryFixture();
  assert.throws(
    () =>
      buildAutomaticInstallBundle(
        discovery,
        {} as { synthetic: boolean },
      ),
    (error: unknown) =>
      error instanceof AutomaticBundleError &&
      error.code === "synthetic-mode-required",
  );
  assert.throws(
    () =>
      buildAutomaticInstallBundle(discovery, {
        synthetic: false,
        limits: { maxBatchSize: 101 },
      }),
    /maxBatchSize/u,
  );
});

test("uses only strict allowlisted metadata keys and a declared system anchor", () => {
  const bundle = buildAutomaticInstallBundle(discoveryFixture(), {
    synthetic: false,
  });
  const allowlist = new Set([
    "errorCategory",
    "interaction",
    "lifecycle",
    "metric",
    "position",
    "routePhase",
    "sanitized",
    "signal",
    "state",
    "targetGeometry",
    "unit",
    "value",
    "viewport",
    "visibility",
  ]);
  const generated = Object.entries(bundle.config.semantics.events).filter(
    ([name]) => name.startsWith("observed."),
  );
  assert.ok(generated.length > 0);
  for (const [, definition] of generated) {
    assert.equal(definition.metadataSchema.additionalProperties, false);
    assert.ok(
      Object.keys(
        (definition.metadataSchema.properties ?? {}) as Record<string, unknown>,
      ).every((key) => allowlist.has(key)),
    );
  }
  assert.ok(
    bundle.diagnostics.some(
      (entry) =>
        entry.code === "system-event-anchor" &&
        entry.nodeId === "integration:storage",
    ),
  );
  assert.ok(
    Object.values(bundle.observationRuntimeMap.systemEvents).every(
      (binding) => binding.nodeId === "integration:storage",
    ),
  );
});
