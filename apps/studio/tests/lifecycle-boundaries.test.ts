import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256 } from "@living-software/cli";
import {
  parseStudioSnapshot,
  type StudioSnapshot,
} from "@living-software/contracts";

import "./register-test-hooks.mjs";

const HASH = `sha256:${"a".repeat(64)}`;
const CASE_ID = `case:${"b".repeat(64)}`;
const VARIANT_ID = `variant:${"c".repeat(64)}`;

function capturedSnapshot(
  displayName: string,
  generatedAt: string,
): StudioSnapshot {
  return parseStudioSnapshot({
    schemaVersion: "living.studio-snapshot/v1",
    generatedAt,
    application: {
      appId: "captured-app",
      displayName,
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
      nodes: [{
        id: "route.home",
        kind: "route",
        displayName: "Home",
        provenance: {
          origin: "scanned",
          confidence: 1,
          sources: [{
            path: "src/app/page.tsx",
            revision: "revision-1",
            line: 1,
          }],
        },
      }],
      edges: [],
      contentHash: HASH,
    },
    evidence: {
      path: ".living/data/releases/aaaaaaaa/events.ndjson",
      records: 1,
      events: 1,
      chainHead: HASH,
    },
    workflows: {
      cases: [{
        caseId: CASE_ID,
        durationMs: 1_000,
        outcome: "succeeded",
        eventCount: 1,
        journeyNodeIds: ["route.home"],
        sessionCount: 1,
      }],
      variants: [{
        variantId: VARIANT_ID,
        caseIds: [CASE_ID],
        journeyNodeIds: ["route.home"],
        caseCount: 1,
        averageDurationMs: 1_000,
        outcomes: { succeeded: 1, failed: 0, abandoned: 0, unknown: 0 },
      }],
    },
    metricReport: {
      schemaVersion: "living.metric-report/v1",
      appId: "captured-app",
      manifestHash: HASH,
      generatedAt,
      window: {
        from: "2026-07-20T11:59:00.000Z",
        to: generatedAt,
      },
      dataOrigin: "synthetic",
      totals: { events: 1, sessions: 1, cases: 1, variants: 1 },
      values: [],
    },
  });
}

function connectionFor(snapshot: StudioSnapshot, hostRoot: string) {
  return {
    schemaVersion: "living.studio-local-connection/v1",
    hostRoot,
    appId: snapshot.application.appId,
    manifestHash: snapshot.application.manifestHash,
    opportunityId: null,
    eventSetHash: null,
    snapshotHash: sha256(snapshot),
  };
}

test("reloads the visible dataset and rejects a torn connection/snapshot pair", async () => {
  const originalCwd = process.cwd();
  const root = await mkdtemp(path.join(tmpdir(), "living-studio-boundary-"));
  const local = path.join(root, ".local");
  const host = path.join(root, "host");
  await mkdir(local);
  await mkdir(host);

  try {
    const first = capturedSnapshot(
      "First capture",
      "2026-07-20T12:00:00.000Z",
    );
    const second = capturedSnapshot(
      "Second capture",
      "2026-07-20T12:01:00.000Z",
    );
    const snapshotPath = path.join(local, "studio-snapshot.json");
    const connectionPath = path.join(local, "studio-connection.json");
    const resolvedHost = await realpath(host);

    await writeFile(snapshotPath, JSON.stringify(first), "utf8");
    await writeFile(
      connectionPath,
      JSON.stringify(connectionFor(first, resolvedHost)),
      "utf8",
    );

    process.chdir(root);
    const dataUrl = new URL("../src/lib/studio-data.ts", import.meta.url);
    dataUrl.searchParams.set("test", "reload-boundary");
    const connectionUrl = new URL(
      "../src/lib/evolution-connection.ts",
      import.meta.url,
    );
    connectionUrl.searchParams.set("test", "pair-boundary");
    const dataModule = await import(dataUrl.href) as typeof import(
      "../src/lib/studio-data"
    );
    const connectionModule = await import(connectionUrl.href) as typeof import(
      "../src/lib/evolution-connection"
    );

    const firstDataset = await dataModule.getStudioDataset();
    assert.equal(firstDataset.app.name, "First capture");
    assert.equal(
      (await connectionModule.loadStudioEvolutionConnection())?.snapshotHash,
      sha256(first),
    );

    await writeFile(snapshotPath, JSON.stringify(second), "utf8");
    const secondDataset = await dataModule.getStudioDataset();
    assert.equal(secondDataset.app.name, "Second capture");
    assert.notEqual(
      secondDataset.evidenceIdentity.snapshotHash,
      firstDataset.evidenceIdentity.snapshotHash,
    );

    await assert.rejects(
      connectionModule.loadStudioEvolutionConnection(),
      /connection and visible snapshot are not the same exact export/u,
    );

    await writeFile(
      connectionPath,
      JSON.stringify(connectionFor(second, resolvedHost)),
      "utf8",
    );
    assert.equal(
      (await connectionModule.loadStudioEvolutionConnection())?.snapshotHash,
      sha256(second),
    );
  } finally {
    process.chdir(originalCwd);
    await rm(root, { recursive: true, force: true });
  }
});

test("broker gates reject remote, cross-origin, and unknown-field commands before any model run", async () => {
  const originalCwd = process.cwd();
  const previousEnablement = process.env.LIVING_STUDIO_EVOLUTION_ENABLED;
  const root = await mkdtemp(path.join(tmpdir(), "living-studio-route-"));
  await mkdir(path.join(root, ".local"));
  process.chdir(root);
  process.env.LIVING_STUDIO_EVOLUTION_ENABLED = "1";

  try {
    const routeUrl = new URL(
      "../src/app/api/evolution/route.ts",
      import.meta.url,
    );
    routeUrl.searchParams.set("test", "route-gates");
    const route = await import(routeUrl.href) as typeof import(
      "../src/app/api/evolution/route"
    );

    const currentIdentity = {
      appId: "captured-app",
      manifestHash: HASH,
      opportunityId: "opportunity.backtracking",
      eventSetHash: HASH,
      snapshotHash: `sha256:${"b".repeat(64)}`,
    };
    assert.throws(
      () => route.assertCurrentAnalysisIdentityMatches(currentIdentity, {
        ...currentIdentity,
        snapshotHash: HASH,
      }),
      /evidence identity changed; sync Studio again/u,
    );

    const remote = await route.GET(
      new Request("https://studio.example/api/evolution"),
    );
    assert.equal(remote.status, 500);
    assert.match(
      String((await remote.json() as { error?: string }).error),
      /only on loopback/u,
    );

    const crossOrigin = await route.POST(new Request(
      "http://127.0.0.1:3001/api/evolution",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: "{}",
      },
    ));
    assert.equal(crossOrigin.status, 400);
    assert.match(
      String((await crossOrigin.json() as { error?: string }).error),
      /Cross-origin evolution commands are not allowed/u,
    );

    const unknownField = await route.POST(new Request(
      "http://127.0.0.1:3001/api/evolution",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          appId: "captured-app",
          snapshotHash: HASH,
          opportunityId: "opportunity.backtracking",
          eventSetHash: HASH,
          provider: "codex",
          bypassApproval: true,
        }),
      },
    ));
    assert.equal(unknownField.status, 400);
    assert.match(
      String((await unknownField.json() as { error?: string }).error),
      /unknown fields/u,
    );

    const rollbackWithoutNewOpportunity = await route.POST(new Request(
      "http://127.0.0.1:3001/api/evolution",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "rollback",
          appId: "captured-app",
          snapshotHash: HASH,
          opportunityId: null,
          eventSetHash: null,
          evolutionId: "evolution.one",
          expectedRevision: 1,
          approver: "human.operator",
        }),
      },
    ));
    assert.equal(rollbackWithoutNewOpportunity.status, 503);
    assert.match(
      String((await rollbackWithoutNewOpportunity.json() as { error?: string }).error),
      /not connected to an instrumented host/u,
    );
  } finally {
    process.chdir(originalCwd);
    if (previousEnablement === undefined) {
      delete process.env.LIVING_STUDIO_EVOLUTION_ENABLED;
    } else {
      process.env.LIVING_STUDIO_EVOLUTION_ENABLED = previousEnablement;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("no-opportunity UI keeps rollback reachable and describes bounded-diff recovery truthfully", async () => {
  const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
  const pageSource = await readFile(
    path.join(sourceRoot, "app", "apps", "[appId]", "evolutions", "page.tsx"),
    "utf8",
  );
  const consoleSource = await readFile(
    path.join(sourceRoot, "components", "live-evolution-console.tsx"),
    "utf8",
  );
  const routeSource = await readFile(
    path.join(sourceRoot, "app", "api", "evolution", "route.ts"),
    "utf8",
  );

  assert.match(
    pageSource,
    /dataset\.app\.connection === "captured_snapshot" && \(\s*<LiveEvolutionConsole/u,
  );
  assert.match(
    pageSource,
    /previously applied change stays visible below for\s+exact rollback/u,
  );
  assert.match(
    consoleSource,
    /This prepared patch cannot be rendered within Studio&?apos;s bounded\s+diff limits\. Approval is disabled; inspect or recover it through the\s+local CLI/u,
  );
  assert.match(
    consoleSource,
    /Newer evidence is synced than this installed change\. Activation is\s+locked, but exact-hash rollback remains available/u,
  );

  const activeSelection = routeSource.indexOf(
    'states.find((state) => state.status === "applied")',
  );
  const exactSelection = routeSource.indexOf(
    "states.find((state) => stateMatchesEvidence(state, connection))",
  );
  assert.ok(activeSelection >= 0 && exactSelection > activeSelection);
  const prepareInput = routeSource.indexOf(
    "const input = await loadAutomaticEvolutionInput",
  );
  const liveIdentityGuard = routeSource.indexOf(
    "assertCurrentAnalysisIdentityMatches(",
    prepareInput,
  );
  const providerConstruction = routeSource.indexOf(
    "const intelligence = createIntelligenceClient",
    prepareInput,
  );
  assert.ok(
    prepareInput >= 0 &&
      liveIdentityGuard > prepareInput &&
      providerConstruction > liveIdentityGuard,
    "current snapshot identity must be rejected before a model transport is constructed",
  );
  assert.ok(routeSource.includes("snapshotHash: input.snapshotHash"));
  const briefDraft = routeSource.indexOf(
    "intelligence.draftEvolutionBrief",
    providerConstruction,
  );
  const candidateCollection = routeSource.indexOf(
    "collectSourceCandidates",
    briefDraft,
  );
  const patchDraft = routeSource.indexOf(
    "intelligence.draftSourcePatch",
    candidateCollection,
  );
  const genericPreparation = routeSource.indexOf(
    "prepareSourceEvolution",
    patchDraft,
  );
  assert.ok(
    briefDraft > providerConstruction &&
      candidateCollection > briefDraft &&
      patchDraft > candidateCollection &&
      genericPreparation > patchDraft,
    "Studio must interpret evidence, collect bounded source, draft edits, then prepare the governed evolution",
  );
  assert.doesNotMatch(routeSource, /compileLeadReviewNavigation/u);
  assert.doesNotMatch(routeSource, /SOURCE_EVOLUTION_TARGET_PATH/u);
  assert.match(routeSource, /sourcePatchProposalSchema\.parse\(patchRun\.proposal\)/u);
  assert.match(routeSource, /intelligenceProvenanceSchema\.parse\(/u);
  assert.match(routeSource, /sourcePatchModelProvenanceSchema\.parse\(/u);
  assert.match(routeSource, /briefModelProvenance,/u);
  assert.match(routeSource, /patchModelProvenance,/u);
  assert.match(
    routeSource,
    /action !== "rollback" && body\.opportunityId === null/u,
  );
});
