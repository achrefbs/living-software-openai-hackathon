import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLivingConfig,
  buildProductManifest,
  canonicalJson,
  parseNextJsHostFixture,
  planDoctor,
  planInit,
  planMap,
  planUninstall,
} from "./index.js";

function fixture(): Record<string, unknown> {
  return {
    schemaVersion: "living.next-host-fixture/v1",
    application: {
      id: "neutral-next-host",
      displayName: "Neutral Next Host",
    },
    framework: {
      name: "nextjs",
      version: "15.4.0",
      adapterVersion: "0.1.0",
    },
    release: {
      revision: "fixture-revision-1",
      version: "0.1.0",
    },
    generatedAt: "2026-07-19T12:00:00.000Z",
    nodes: [
      {
        id: "surface.record-detail",
        kind: "surface",
        displayName: "Record detail",
        sourcePath: "src/app/records/[id]/page.tsx",
        line: 1,
      },
      {
        id: "route.record-detail",
        kind: "route",
        displayName: "Record detail route",
        sourcePath: "src/app/records/[id]/page.tsx",
        line: 1,
      },
    ],
    edges: [
      {
        from: "route.record-detail",
        to: "surface.record-detail",
        relation: "renders",
        sourcePath: "src/app/records/[id]/page.tsx",
        line: 1,
      },
    ],
    events: [
      {
        name: "record.opened",
        kind: "navigation",
        subjectType: "record",
        metadataSchema: {
          type: "object",
          additionalProperties: false,
        },
      },
    ],
    extensionPoints: [],
    operations: [],
  };
}

test("produces byte-identical init plans for the same fixture", () => {
  const first = canonicalJson(planInit(fixture()), true);
  const second = canonicalJson(planInit(fixture()), true);
  assert.equal(first, second);
});

test("builds config and manifest values accepted by public contracts", () => {
  const config = buildLivingConfig(fixture());
  const manifest = buildProductManifest(fixture());

  assert.equal(config.schemaVersion, "living.config/v1");
  assert.equal(config.privacy.metadataPolicy, "deny-by-default");
  assert.equal(manifest.schemaVersion, "living.product-manifest/v1");
  assert.match(manifest.contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(manifest.nodes.map((node) => node.id), [
    "route.record-detail",
    "surface.record-detail",
  ]);
});

test("init, map, and uninstall remain dry-run plans", () => {
  const plans = [planInit(fixture()), planMap(fixture()), planUninstall(fixture())];
  for (const plan of plans) {
    assert.equal(plan.mode, "dry-run");
    assert.equal(plan.diagnostics.some((item) => item.code === "PLAN_ONLY"), true);
  }
  assert.equal(planInit(fixture()).changes.some((change) => change.action === "create"), true);
  assert.equal(planUninstall(fixture()).changes.some((change) => change.action === "remove"), true);
  assert.equal(
    planUninstall(fixture()).changes.some((change) => change.path === ".living/host-interface.json"),
    true,
  );
  assert.equal(
    planUninstall(fixture()).changes.some((change) => change.path.startsWith("/") || change.path.startsWith("..")),
    false,
  );
});

test("doctor reports contract-invalid installed inputs without throwing", () => {
  const plan = planDoctor(fixture(), {
    config: { schemaVersion: "living.config/v0" },
    manifest: { schemaVersion: "living.product-manifest/v0" },
  });
  assert.equal(plan.changes.length, 0);
  assert.deepEqual(
    plan.diagnostics
      .filter((item) => item.severity === "error")
      .map((item) => item.code),
    ["CONFIG_INVALID", "MANIFEST_INVALID"],
  );
});

test("rejects unsafe paths and unknown edge references", () => {
  const unsafe = fixture();
  unsafe.nodes = [
    {
      id: "route.escape",
      kind: "route",
      displayName: "Escape",
      sourcePath: "../outside.ts",
    },
  ];
  unsafe.edges = [];
  assert.throws(() => parseNextJsHostFixture(unsafe), /inside the host root/);

  const unknownEdge = fixture();
  unknownEdge.edges = [
    {
      from: "route.record-detail",
      to: "surface.missing",
      relation: "renders",
      sourcePath: "src/app/records/[id]/page.tsx",
    },
  ];
  assert.throws(() => parseNextJsHostFixture(unknownEdge), /unknown node/);
});

test("requires an explicit salt environment variable for pseudonymous identifiers", () => {
  const candidate = fixture();
  candidate.identifierMode = "pseudonymous";
  assert.throws(() => buildLivingConfig(candidate), /pseudonymSaltEnv/);
});
