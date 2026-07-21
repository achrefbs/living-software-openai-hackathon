import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  WorkflowEvent,
  WorkflowEventBatch,
} from "@living-software/contracts";
import ts from "typescript";

import { analyzeEvidenceRecords } from "./analyzer.js";
import { createEvidenceCollector } from "./collector.js";
import { generateNextCollectorFiles } from "./generator.js";
import {
  LEGACY_EVIDENCE_RELATIVE_PATH,
  evidenceRelativePathForManifestHash,
  parseEvidenceNdjson,
} from "./store.js";
import type { CollectorDefinition } from "./types.js";

const MANIFEST_HASH = `sha256:${"a".repeat(64)}` as const;

function definition(overrides: CollectorDefinition["limits"] = {}): CollectorDefinition {
  return {
    schemaVersion: "living.collector-definition/v1",
    application: {
      appId: "surus-crm",
      environment: "development",
      releaseRevision: "source:surus-test",
      manifestHash: MANIFEST_HASH,
      synthetic: true,
    },
    eventBindings: [
      {
        eventName: "navigation.leads",
        kind: "navigation",
        nodeId: "route.leads",
        surfaceId: "surface.leads",
      },
      {
        eventName: "navigation.tasks",
        kind: "navigation",
        nodeId: "route.tasks",
        surfaceId: "surface.tasks",
      },
      {
        eventName: "interaction.filter-stage",
        kind: "action",
        nodeId: "action.filter-stage",
        surfaceId: "surface.leads",
      },
      {
        eventName: "signal.filter-stage.correction",
        kind: "outcome",
        nodeId: "action.filter-stage",
        surfaceId: "surface.leads",
      },
      {
        eventName: "signal.filter-stage.dead-click",
        kind: "outcome",
        nodeId: "action.filter-stage",
        surfaceId: "surface.leads",
      },
      {
        eventName: "signal.filter-stage.rage-click",
        kind: "outcome",
        nodeId: "action.filter-stage",
        surfaceId: "surface.leads",
      },
    ],
    limits: {
      maxPayloadBytes: 64_000,
      maxEventsPerBatch: 100,
      maxRequestsPerMinute: 100,
      maxEventsPerMinute: 1_000,
      ...overrides,
    },
  };
}

function routeEvent(
  sessionId: string,
  sequence: number,
  surface: "leads" | "tasks",
): WorkflowEvent {
  const second = String(sequence).padStart(2, "0");
  return {
    schemaVersion: "living.workflow-event/v1",
    eventId: `evt-${sessionId}-${sequence}`,
    appId: "surus-crm",
    environment: "development",
    releaseRevision: "source:surus-test",
    occurredAt: `2026-07-20T09:00:${second}.000Z`,
    sequence,
    name: `navigation.${surface}`,
    kind: "navigation",
    status: "succeeded",
    sessionId,
    product: {
      manifestHash: MANIFEST_HASH,
      nodeId: `route.${surface}`,
      surfaceId: `surface.${surface}`,
    },
    metadata: { routePhase: "complete" },
    provenance: { source: "technical-telemetry", synthetic: true },
  };
}

function interactionEvent(sessionId: string, sequence: number): WorkflowEvent {
  const second = String(sequence).padStart(2, "0");
  return {
    schemaVersion: "living.workflow-event/v1",
    eventId: `evt-${sessionId}-${sequence}`,
    appId: "surus-crm",
    environment: "development",
    releaseRevision: "source:surus-test",
    occurredAt: `2026-07-20T09:00:${second}.000Z`,
    sequence,
    name: "interaction.filter-stage",
    kind: "action",
    status: "succeeded",
    sessionId,
    product: {
      manifestHash: MANIFEST_HASH,
      nodeId: "action.filter-stage",
      surfaceId: "surface.leads",
    },
    metadata: {
      interaction: "change",
      targetGeometry: { x: 100, y: 80, width: 160, height: 36 },
      viewport: {
        width: 1440,
        height: 900,
        scrollX: 0,
        scrollY: 120,
        pixelRatio: 1,
      },
      visibility: { ratio: 1, inViewport: true },
      position: { layout: "flow", documentX: 100, documentY: 200 },
      state: { disabled: false },
    },
    provenance: { source: "technical-telemetry", synthetic: true },
  };
}

function technicalSignalEvent(
  sessionId: string,
  sequence: number,
  signal: "correction" | "dead-click" | "rage-click",
): WorkflowEvent {
  const candidate = routeEvent(sessionId, sequence, "leads");
  const interaction = interactionEvent(sessionId, sequence);
  const { interaction: _interaction, ...geometry } = interaction.metadata;
  return {
    ...candidate,
    name: `signal.filter-stage.${signal}`,
    kind: "outcome",
    product: {
      ...candidate.product,
      nodeId: "action.filter-stage",
      surfaceId: "surface.leads",
    },
    metadata: { signal, ...geometry },
  };
}

function eventForDefinition(
  collectorDefinition: CollectorDefinition,
  sessionId: string,
  sequence: number,
  surface: "leads" | "tasks",
): WorkflowEvent {
  const event = routeEvent(sessionId, sequence, surface);
  return {
    ...event,
    appId: collectorDefinition.application.appId,
    environment: collectorDefinition.application.environment,
    releaseRevision: collectorDefinition.application.releaseRevision,
    product: {
      ...event.product,
      manifestHash: collectorDefinition.application.manifestHash,
    },
    provenance: {
      source: "technical-telemetry",
      synthetic: collectorDefinition.application.synthetic,
    },
  };
}

function batch(
  sessionId: string,
  events: WorkflowEvent[],
  sequence = 0,
): WorkflowEventBatch {
  return {
    schemaVersion: "living.event-batch/v1",
    sequence,
    events,
  };
}

function request(candidate: unknown, origin = "http://localhost:3210"): Request {
  return new Request(`${origin}/api/living/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=UTF-8",
      origin,
    },
    body: JSON.stringify(candidate),
  });
}

async function temporaryRoot(t: test.TestContext): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "living-collector-test-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test("stores a hash-linked chain and deterministically analyzes workflows", async (t) => {
  const root = await temporaryRoot(t);
  let acceptedAt = 0;
  const collector = createEvidenceCollector({
    rootPath: root,
    definition: definition(),
    clock: () => new Date(`2026-07-20T10:00:0${acceptedAt++}.000Z`),
  });

  for (let caseIndex = 0; caseIndex < 3; caseIndex += 1) {
    const sessionId = `session-${caseIndex}`;
    const corroboration = ["correction", "dead-click", "rage-click"] as const;
    const events = [
      routeEvent(sessionId, 0, "leads"),
      routeEvent(sessionId, 1, "tasks"),
      routeEvent(sessionId, 2, "leads"),
      routeEvent(sessionId, 3, "tasks"),
      routeEvent(sessionId, 4, "leads"),
      technicalSignalEvent(sessionId, 5, corroboration[caseIndex]!),
    ];
    const response = await collector.handle(request(batch(sessionId, events)));
    assert.equal(response.status, 202);
  }

  const controlSessionId = "session-control";
  const controlResponse = await collector.handle(request(batch(controlSessionId, [
    routeEvent(controlSessionId, 0, "leads"),
    routeEvent(controlSessionId, 1, "tasks"),
  ])));
  assert.equal(controlResponse.status, 202);

  const records = await collector.readVerified();
  assert.equal(records.length, 4);
  assert.equal(records[0]?.previousRecordHash, null);
  assert.equal(records[1]?.previousRecordHash, records[0]?.recordHash);
  assert.equal(records[2]?.previousRecordHash, records[1]?.recordHash);

  const first = await collector.analyze();
  const second = analyzeEvidenceRecords(records, definition());
  assert.equal(first.events.length, 20);
  assert.equal(first.workflowCases.length, 4);
  assert.equal(first.workflowVariants.length, 4);
  assert.equal(first.metricReport.schemaVersion, "living.metric-report/v1");
  assert.equal(first.metricReport.dataOrigin, "synthetic");
  assert.ok(first.opportunity);
  assert.equal(first.opportunity.signal.kind, "backtracking");
  assert.equal(first.opportunityEvidenceEvents.length, 18);
  assert.ok(
    first.opportunityEvidenceEvents.every(
      (candidate) => candidate.sessionId !== controlSessionId,
    ),
  );
  assert.deepEqual(
    first.opportunityEvidenceEvents,
    second.opportunityEvidenceEvents,
  );
  assert.equal(JSON.stringify(first.metricReport), JSON.stringify(second.metricReport));
  assert.equal(first.chainHead, records.at(-1)?.recordHash);
});

test("promotes repeated correction signals using only their exact evidence events", async (t) => {
  const root = await temporaryRoot(t);
  const collector = createEvidenceCollector({
    rootPath: root,
    definition: definition(),
  });

  for (let caseIndex = 0; caseIndex < 3; caseIndex += 1) {
    const sessionId = `correction-session-${caseIndex}`;
    const response = await collector.handle(request(batch(sessionId, [
      routeEvent(sessionId, 0, "leads"),
      interactionEvent(sessionId, 1),
      technicalSignalEvent(sessionId, 2, "correction"),
    ])));
    assert.equal(response.status, 202, await response.text());
    const partial = await collector.analyze();
    const correction = partial.detectorEvaluations.find(
      ({ progress }) => progress.signalKind === "rework-loop",
    );
    assert.ok(correction);
    assert.equal(partial.detectorProgress.length, 4);
    assert.equal(correction.progress.affectedCases, caseIndex + 1);
    assert.equal(correction.progress.minimumAffectedCases, 3);
    assert.equal(correction.progress.thresholdMet, caseIndex === 2);
    assert.equal(correction.detection === null, caseIndex < 2);
    assert.equal(partial.opportunity === null, caseIndex < 2);
  }

  const analysis = await collector.analyze();
  assert.ok(analysis.opportunity);
  assert.equal(analysis.opportunity.signal.kind, "rework-loop");
  assert.equal(analysis.opportunity.evidence.subjectCount, 3);
  assert.equal(analysis.opportunity.evidence.occurrenceCount, 3);
  assert.equal(analysis.opportunityEvidenceEvents.length, 3);
  assert.ok(
    analysis.opportunityEvidenceEvents.every(
      (candidate) =>
        candidate.kind === "outcome" && candidate.metadata.signal === "correction",
    ),
  );
  assert.equal(
    analysis.metricReport.values.find(
      (candidate) => candidate.id === "friction.correction-count",
    )?.value,
    3,
  );
});

test("keeps manifest releases in independent append-only evidence segments", async (t) => {
  const root = await temporaryRoot(t);
  const firstDefinition = definition();
  const secondDefinition: CollectorDefinition = {
    ...definition(),
    application: {
      ...definition().application,
      releaseRevision: "source:surus-test-v2",
      manifestHash: `sha256:${"b".repeat(64)}`,
    },
  };
  const first = createEvidenceCollector({ rootPath: root, definition: firstDefinition });
  const second = createEvidenceCollector({ rootPath: root, definition: secondDefinition });

  assert.equal(
    first.evidencePath,
    path.join(root, ...evidenceRelativePathForManifestHash(MANIFEST_HASH).split("/")),
  );
  assert.notEqual(first.evidencePath, second.evidencePath);
  assert.equal(
    (await first.handle(request(batch(
      "release-one",
      [eventForDefinition(firstDefinition, "release-one", 0, "leads")],
    )))).status,
    202,
  );
  const firstBytes = await readFile(first.evidencePath);

  assert.equal(
    (await second.handle(request(batch(
      "release-two",
      [eventForDefinition(secondDefinition, "release-two", 0, "tasks")],
    )))).status,
    202,
  );
  assert.deepEqual(await readFile(first.evidencePath), firstBytes);
  assert.equal((await first.readVerified()).length, 1);
  assert.equal((await second.readVerified()).length, 1);
  assert.equal((await second.analyze()).events.length, 1);
});

test("uses compatible legacy evidence read-only and never mixes another manifest", async (t) => {
  const sourceRoot = await temporaryRoot(t);
  const firstDefinition = definition();
  const source = createEvidenceCollector({ rootPath: sourceRoot, definition: firstDefinition });
  assert.equal(
    (await source.handle(request(batch(
      "legacy-release",
      [eventForDefinition(firstDefinition, "legacy-release", 0, "leads")],
    )))).status,
    202,
  );
  const legacyBytes = await readFile(source.evidencePath);

  const root = await temporaryRoot(t);
  const legacyPath = path.join(root, ...LEGACY_EVIDENCE_RELATIVE_PATH.split("/"));
  await mkdir(path.dirname(legacyPath), { recursive: true });
  await writeFile(legacyPath, legacyBytes);
  const compatible = createEvidenceCollector({ rootPath: root, definition: firstDefinition });
  assert.equal((await compatible.readVerified()).length, 1);

  const secondDefinition: CollectorDefinition = {
    ...definition(),
    application: {
      ...definition().application,
      releaseRevision: "source:surus-test-v2",
      manifestHash: `sha256:${"b".repeat(64)}`,
    },
  };
  const second = createEvidenceCollector({ rootPath: root, definition: secondDefinition });
  assert.deepEqual(await second.readVerified(), []);
  assert.equal(
    (await second.handle(request(batch(
      "new-release",
      [eventForDefinition(secondDefinition, "new-release", 0, "tasks")],
    )))).status,
    202,
  );
  assert.equal((await second.analyze()).events.length, 1);
  assert.deepEqual(await readFile(legacyPath), legacyBytes);
  assert.equal((await compatible.readVerified()).length, 1);
});

test("rejects hostile symlinks in the release evidence path", async (t) => {
  const root = await temporaryRoot(t);
  const outside = await temporaryRoot(t);
  const dataPath = path.join(root, ".living", "data");
  await mkdir(dataPath, { recursive: true });
  await symlink(outside, path.join(dataPath, "releases"), "junction");
  const collector = createEvidenceCollector({ rootPath: root, definition: definition() });
  await assert.rejects(collector.readVerified(), /symlink|unsafe/u);
});

test("derives evidence paths only from strict lowercase manifest hashes", () => {
  assert.equal(
    evidenceRelativePathForManifestHash(MANIFEST_HASH),
    `.living/data/releases/${"a".repeat(64)}/events.ndjson`,
  );
  assert.throws(
    () => evidenceRelativePathForManifestHash("sha256:../../escape"),
    /lowercase SHA-256/u,
  );
  assert.throws(
    () => evidenceRelativePathForManifestHash(`sha256:${"A".repeat(64)}`),
    /lowercase SHA-256/u,
  );
});

test("deduplicates exact retries and rejects conflicting session sequences", async (t) => {
  const root = await temporaryRoot(t);
  const collector = createEvidenceCollector({ rootPath: root, definition: definition() });
  const original = batch("session-a", [routeEvent("session-a", 0, "leads")]);

  assert.equal((await collector.handle(request(original))).status, 202);
  const duplicate = await collector.handle(request(original));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json() as { duplicate: boolean }).duplicate, true);
  assert.equal((await collector.readVerified()).length, 1);

  const conflict = batch("session-a", [routeEvent("session-a", 1, "tasks")], 0);
  const conflictResponse = await collector.handle(request(conflict));
  assert.equal(conflictResponse.status, 409);
  assert.deepEqual(await conflictResponse.json(), { error: "BATCH_SEQUENCE_CONFLICT" });
});

test("rejects cross-origin, wrong content type, and oversized bodies", async (t) => {
  const root = await temporaryRoot(t);
  const collector = createEvidenceCollector({
    rootPath: root,
    definition: definition({ maxPayloadBytes: 64 }),
  });
  const candidate = batch("session-a", [routeEvent("session-a", 0, "leads")]);

  const crossOrigin = request(candidate);
  crossOrigin.headers.set("origin", "https://attacker.invalid");
  assert.equal((await collector.handle(crossOrigin)).status, 403);

  const textRequest = new Request("http://localhost:3210/api/living/events", {
    method: "POST",
    headers: { "content-type": "text/plain", origin: "http://localhost:3210" },
    body: JSON.stringify(candidate),
  });
  assert.equal((await collector.handle(textRequest)).status, 415);
  assert.equal((await collector.handle(request(candidate))).status, 413);

  const getRequest = new Request("http://localhost:3210/api/living/events", {
    method: "GET",
    headers: { origin: "http://localhost:3210" },
  });
  assert.equal((await collector.handle(getRequest)).status, 405);
});

test("accepts the browser-visible Host when Next normalizes Request.url to localhost", async (t) => {
  const root = await temporaryRoot(t);
  const collector = createEvidenceCollector({
    rootPath: root,
    definition: definition(),
  });
  const candidate = batch("session-loopback", [
    routeEvent("session-loopback", 0, "leads"),
  ]);
  const rewrittenRequest = new Request(
    "http://localhost:3210/api/living/events",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:3210",
        origin: "http://127.0.0.1:3210",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify(candidate),
    },
  );

  assert.equal((await collector.handle(rewrittenRequest)).status, 202);
  assert.equal((await collector.readVerified()).length, 1);
});

test("rejects contradictory Fetch Metadata even when effective Host matches", async (t) => {
  const root = await temporaryRoot(t);
  const collector = createEvidenceCollector({
    rootPath: root,
    definition: definition(),
  });
  const candidate = batch("session-cross-site", [
    routeEvent("session-cross-site", 0, "leads"),
  ]);
  const crossSiteRequest = new Request(
    "http://localhost:3210/api/living/events",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:3210",
        origin: "http://127.0.0.1:3210",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify(candidate),
    },
  );

  assert.equal((await collector.handle(crossSiteRequest)).status, 403);
  assert.equal((await collector.readVerified()).length, 0);
});

test("enforces request and event rate limits", async (t) => {
  const root = await temporaryRoot(t);
  const collector = createEvidenceCollector({
    rootPath: root,
    definition: definition({ maxRequestsPerMinute: 1, maxEventsPerMinute: 1 }),
    clock: () => new Date("2026-07-20T10:00:00.000Z"),
  });
  const first = batch("session-a", [routeEvent("session-a", 0, "leads")]);
  const second = batch("session-b", [routeEvent("session-b", 0, "tasks")]);
  assert.equal((await collector.handle(request(first))).status, 202);
  const limited = await collector.handle(request(second));
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: "REQUEST_RATE_LIMIT" });
});

test("rejects out-of-order events and content-bearing metadata", async (t) => {
  const root = await temporaryRoot(t);
  const collector = createEvidenceCollector({ rootPath: root, definition: definition() });
  const reversed = batch("session-a", [
    routeEvent("session-a", 2, "leads"),
    routeEvent("session-a", 1, "tasks"),
  ]);
  assert.equal((await collector.handle(request(reversed))).status, 422);

  const unsafe = interactionEvent("session-a", 0) as WorkflowEvent & {
    metadata: Record<string, unknown>;
  };
  unsafe.metadata = {
    ...unsafe.metadata,
    message: "a typed customer note must never enter evidence",
  };
  const privacyResponse = await collector.handle(request(batch("session-a", [unsafe])));
  assert.equal(privacyResponse.status, 422);
  assert.deepEqual(await privacyResponse.json(), { error: "METADATA_FIELD" });
});

test("detects evidence tampering before analysis", async (t) => {
  const root = await temporaryRoot(t);
  const collector = createEvidenceCollector({ rootPath: root, definition: definition() });
  const candidate = batch("session-a", [routeEvent("session-a", 0, "leads")]);
  assert.equal((await collector.handle(request(candidate))).status, 202);

  const source = await readFile(collector.evidencePath, "utf8");
  const parsed = JSON.parse(source.trim()) as Record<string, unknown>;
  parsed.acceptedAt = "2026-07-20T11:00:00.000Z";
  await writeFile(collector.evidencePath, `${JSON.stringify(parsed)}\n`, "utf8");

  await assert.rejects(collector.readVerified(), /invalid record hash/);
  assert.throws(() => parseEvidenceNdjson(`${JSON.stringify(parsed)}\n`, definition()), /invalid record hash/);
});

test("generates dependency-free POST-only Next.js collector source", () => {
  const generated = generateNextCollectorFiles(definition());
  assert.equal(generated.route.relativePath, "src/app/api/living/events/route.ts");
  assert.equal(generated.serverModule.relativePath, "src/living-collector.generated.ts");
  assert.match(generated.route.content, /export const runtime = "nodejs"/);
  assert.match(generated.route.content, /export const dynamic = "force-dynamic"/);
  assert.match(generated.route.content, /export \{ POST \}/);
  assert.doesNotMatch(generated.route.content, /\bGET\b/);
  assert.doesNotMatch(generated.serverModule.content, /@living-software/);
  assert.match(generated.serverModule.content, /application\\\/json/);
  assert.match(generated.serverModule.content, /ORIGIN_REJECTED/);
  assert.match(generated.serverModule.content, /request\.headers\.get\("host"\)/);
  assert.match(generated.serverModule.content, /request\.headers\.get\("sec-fetch-site"\)/);
  assert.match(generated.serverModule.content, /EVIDENCE_CHAIN_INVALID/);
  assert.match(generated.serverModule.content, /path\.join\(dataPath, "releases"\)/);
  assert.match(generated.serverModule.content, /manifestHash\.slice\(7\)/);
  assert.match(generated.serverModule.content, /ensureDirectory\(releasePath\)/);
  assert.doesNotMatch(generated.serverModule.content, /"data", "events\.ndjson"/);
  assert.match(generated.serverModule.content, /"surus-crm"/);
  assert.match(
    generated.serverModule.content,
    /^\/\/ eslint-disable-next-line @typescript-eslint\/ban-ts-comment -- generated runtime is validated before emission\n\/\/ @ts-nocheck\n/,
  );
  assert.doesNotMatch(generated.serverModule.content, /^\/\* eslint-disable/u);

  const transpiled = ts.transpileModule(generated.serverModule.content, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(transpiled.diagnostics ?? [], []);
  assert.match(transpiled.outputText, /export async function POST/);
});

test("generated files resolve together in a strict TypeScript host", async (t) => {
  const root = await temporaryRoot(t);
  const generated = generateNextCollectorFiles(definition());
  const routePath = path.join(root, generated.route.relativePath);
  const serverPath = path.join(root, generated.serverModule.relativePath);
  await import("node:fs/promises").then(async ({ mkdir }) => {
    await mkdir(path.dirname(routePath), { recursive: true });
  });
  await writeFile(routePath, generated.route.content, "utf8");
  await writeFile(serverPath, generated.serverModule.content, "utf8");

  const program = ts.createProgram([routePath, serverPath], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  });
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(
    diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
    [],
  );
});
