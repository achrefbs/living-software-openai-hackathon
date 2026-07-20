import assert from "node:assert/strict";
import test from "node:test";

import type { StudioSnapshot } from "@living-software/contracts";

import {
  fixtureStudioDataset,
  studioDatasetFromSnapshot,
} from "../src/lib/studio-snapshot";

const HASH = `sha256:${"a".repeat(64)}`;
const CASE_ID = `case:${"b".repeat(64)}`;
const VARIANT_ID = `variant:${"c".repeat(64)}`;

function snapshot(withOpportunity = true): StudioSnapshot {
  const candidate = {
    schemaVersion: "living.studio-snapshot/v1",
    generatedAt: "2026-07-20T12:00:00.000Z",
    application: {
      appId: "captured-app",
      displayName: "Captured App",
      environment: "development",
      releaseRevision: "revision-1",
      manifestHash: HASH,
      dataOrigin: "synthetic",
    },
    productManifest: {
      schemaVersion: "living.product-manifest/v1",
      appId: "captured-app",
      release: { revision: "revision-1" },
      generatedAt: "2026-07-20T11:55:00.000Z",
      generators: [{ adapterId: "test-adapter", adapterVersion: "1.0.0" }],
      nodes: [
        {
          id: "route.home",
          kind: "route",
          displayName: "Home",
          provenance: {
            origin: "scanned",
            confidence: 1,
            sources: [{ path: "src/app/page.tsx", revision: "revision-1", line: 1 }],
          },
        },
        {
          id: "action.save",
          kind: "action",
          displayName: "Save",
          provenance: {
            origin: "scanned",
            confidence: 0.98,
            sources: [{ path: "src/app/page.tsx", revision: "revision-1", line: 20 }],
          },
        },
        {
          id: "test.home",
          kind: "test",
          displayName: "Home test",
          provenance: {
            origin: "scanned",
            confidence: 0.9,
            sources: [{ path: "src/app/page.test.tsx", revision: "revision-1", line: 1 }],
          },
        },
      ],
      edges: [
        {
          from: "route.home",
          to: "action.save",
          relation: "renders",
          provenance: {
            origin: "scanned",
            confidence: 1,
            sources: [{ path: "src/app/page.tsx", revision: "revision-1", line: 20 }],
          },
        },
        {
          from: "test.home",
          to: "route.home",
          relation: "tests",
          provenance: {
            origin: "scanned",
            confidence: 0.9,
            sources: [{ path: "src/app/page.test.tsx", revision: "revision-1", line: 1 }],
          },
        },
      ],
      contentHash: HASH,
    },
    evidence: {
      path: ".living/data/releases/aaaaaaaa/events.ndjson",
      records: 1,
      events: 3,
      chainHead: HASH,
    },
    workflows: {
      cases: [{
        caseId: CASE_ID,
        durationMs: 3_000,
        outcome: "succeeded",
        eventCount: 3,
        journeyNodeIds: ["route.home", "action.save", "route.home"],
        sessionCount: 1,
      }],
      variants: [{
        variantId: VARIANT_ID,
        caseIds: [CASE_ID],
        journeyNodeIds: ["route.home", "action.save", "route.home"],
        caseCount: 1,
        averageDurationMs: 3_000,
        outcomes: { succeeded: 1, failed: 0, abandoned: 0, unknown: 0 },
      }],
    },
    metricReport: {
      schemaVersion: "living.metric-report/v1",
      appId: "captured-app",
      manifestHash: HASH,
      generatedAt: "2026-07-20T12:00:00.000Z",
      window: {
        from: "2026-07-20T11:59:00.000Z",
        to: "2026-07-20T12:00:00.000Z",
      },
      dataOrigin: "synthetic",
      totals: { events: 3, sessions: 1, cases: 1, variants: 1 },
      values: [],
    },
    ...(withOpportunity
      ? {
          opportunity: {
            opportunityId: "opportunity.backtracking",
            appId: "captured-app",
            manifestHash: HASH,
            detectedAt: "2026-07-20T12:00:00.000Z",
            detector: { id: "detector.backtracking", version: "1.1.0", configHash: HASH },
            window: {
              from: "2026-07-20T11:59:00.000Z",
              to: "2026-07-20T12:00:00.000Z",
            },
            signal: {
              kind: "backtracking",
              metrics: [{ name: "affected_cases", unit: "count", observed: 1 }],
            },
            evidence: {
              bundle: {
                uri: `living://evidence/${"d".repeat(64)}`,
                mediaType: "application/x-ndjson",
                sha256: HASH,
              },
              eventSetHash: HASH,
              subjectCount: 1,
              sessionCount: 1,
              occurrenceCount: 1,
              dataOrigin: "synthetic",
            },
            confidence: { score: 0.8, reasonCodes: ["deterministic-evidence"] },
          },
        }
      : {}),
  };
  return candidate as unknown as StudioSnapshot;
}

test("maps a minimized captured snapshot without inventing lifecycle state", () => {
  const dataset = studioDatasetFromSnapshot(snapshot());

  assert.equal(dataset.app.connection, "captured_snapshot");
  assert.equal(dataset.app.source.label, "Synthetic capture");
  assert.deepEqual(dataset.evidenceIdentity, {
    appId: "captured-app",
    manifestHash: HASH,
    opportunityId: "opportunity.backtracking",
    eventSetHash: HASH,
  });
  assert.equal(dataset.productMap.totalNodes, 3);
  assert.equal(dataset.productMap.nodes.length, 2);
  assert.equal(dataset.productMap.omittedNodes, 1);
  assert.equal(dataset.productMap.edges.length, 1);
  assert.equal(dataset.workflows.observedCases, 1);
  assert.equal(dataset.workflows.variants[0]?.tone, "friction");
  assert.deepEqual(dataset.workflows.variants[0]?.steps, [
    { id: "route.home", label: "Home" },
    { id: "action.save", label: "Save" },
    { id: "route.home", label: "Home" },
  ]);
  assert.equal(dataset.workflows.evidenceCases[0]?.sessionCount, 1);
  assert.equal(dataset.opportunities[0]?.affectedCases, 1);
  assert.equal(dataset.evolution, null);
  assert.equal(dataset.receipts, null);
});

test("renders valid analysis honestly when no opportunity crossed threshold", () => {
  const dataset = studioDatasetFromSnapshot(snapshot(false));

  assert.deepEqual(dataset.opportunities, []);
  assert.equal(dataset.workflows.variants[0]?.tone, "healthy");
});

test("keeps the neutral fixture available as the fallback dataset", () => {
  const dataset = fixtureStudioDataset();

  assert.equal(dataset.app.connection, "offline_fixture");
  assert.equal(dataset.app.source.dataOrigin, "fixture");
  assert.deepEqual(dataset.evidenceIdentity, {
    appId: "sample-operations",
    manifestHash: null,
    opportunityId: null,
    eventSetHash: null,
  });
  assert.ok(dataset.evolution);
  assert.ok(dataset.receipts);
  assert.equal(dataset.productMap.totalNodes, dataset.productMap.nodes.length);
});
