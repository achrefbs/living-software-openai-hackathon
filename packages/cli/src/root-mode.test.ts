import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LEGACY_EVIDENCE_RELATIVE_PATH,
  createEvidenceCollector,
  evidenceRelativePathForManifestHash,
  type CollectorDefinition,
} from "@living-software/collector";
import type {
  Opportunity,
  WorkflowEvent,
  WorkflowEventBatch,
} from "@living-software/contracts";
import { parseStudioSnapshot } from "@living-software/contracts";
import {
  createIntelligenceClient,
  IntelligenceResponseError,
  type IntelligenceTransport,
} from "@living-software/intelligence";
import {
  InstallConflictError,
  type InstallPlan,
} from "@living-software/installer";

import {
  REQUIRED_PRESERVED_PATHS,
  loadAutomaticEvolutionInput,
  loadLiveHostState,
  runRootCommand,
  validateRuntimeBindings,
} from "./root-mode.js";
import { sha256 } from "./canonical.js";

const CLOCK = () => new Date("2026-07-19T12:00:00.000Z");

type InitOutput = Readonly<{
  mode: "dry-run" | "apply";
  synthetic: boolean;
  plan: InstallPlan;
  collectorDefinition: CollectorDefinition;
  result?: { readonly status: string };
}>;

async function createNextHost(t: test.TestContext): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "living-cli-root-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const files = {
    "package.json": JSON.stringify({
      name: "automatic-crm",
      version: "1.0.0",
      dependencies: { next: "^15.3.1", react: "19.0.0" },
    }),
    "src/app/page.tsx": `
      import Link from "next/link";
      export default function Page() {
        return <main data-testid="dashboard">
          <Link href="/deals" data-testid="deals-link">Deals</Link>
          <button data-living-id="create-deal">Create deal</button>
        </main>;
      }
    `,
    "src/app/deals/page.tsx": `
      export default function DealsPage() {
        return <form data-testid="deal-form">
          <input data-testid="deal-name" />
          <button type="submit" data-testid="save-deal">Save</button>
        </form>;
      }
    `,
  } as const;
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, ...relative.split("/"));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  return root;
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function init(
  root: string,
  options: { readonly apply?: boolean; readonly synthetic?: boolean; readonly installId: string },
): Promise<InitOutput> {
  return await runRootCommand("init", {
    root,
    apply: options.apply ?? false,
    synthetic: options.synthetic ?? false,
    clock: CLOCK,
    installId: options.installId,
  }) as unknown as InitOutput;
}

test("init is dry-run by default and applies a complete automatic install only explicitly", async (t) => {
  const root = await createNextHost(t);
  const dry = await init(root, { installId: "install-dry" });
  assert.equal(dry.mode, "dry-run");
  assert.equal(dry.plan.status, "ready");
  assert.equal(await exists(path.join(root, ".living")), false);
  assert.ok(dry.plan.artifacts.some((artifact) => artifact.path === "src/instrumentation-client.ts"));
  assert.ok(dry.plan.artifacts.some((artifact) => artifact.path === "src/app/api/living/events/route.ts"));

  const applied = await init(root, { apply: true, synthetic: true, installId: "install-apply" });
  assert.equal(applied.mode, "apply");
  assert.equal(applied.synthetic, true);
  assert.equal(applied.result?.status, "installed");
  for (const artifact of applied.plan.artifacts) {
    assert.equal(await exists(path.join(root, ...artifact.path.split("/"))), true, artifact.path);
  }
  assert.equal(await exists(path.join(root, ".living", "install-record.json")), true);
});

test("applied init keeps the browser bootstrap, binding graph, and collector route synchronized", async (t) => {
  const root = await createNextHost(t);
  const applied = await init(root, {
    apply: true,
    synthetic: true,
    installId: "install-wiring",
  });
  const artifacts = new Map(
    applied.plan.artifacts.map((artifact) => [artifact.path, artifact.content]),
  );
  const required = [
    ".living/observation-runtime.json",
    "src/instrumentation-client.ts",
    "src/living-observer.generated.ts",
    "src/living-collector.generated.ts",
    "src/app/api/living/events/route.ts",
  ];
  for (const relative of required) {
    const planned = artifacts.get(relative);
    assert.ok(planned, relative);
    assert.equal(
      await readFile(path.join(root, ...relative.split("/")), "utf8"),
      planned,
      relative,
    );
  }

  const instrumentation = artifacts.get("src/instrumentation-client.ts") as string;
  assert.match(instrumentation, /import\("\.\/living-observer\.generated"\)/u);
  assert.match(instrumentation, /startLivingObserver\(\)/u);
  assert.match(instrumentation, /recordLivingRouterTransitionStart/u);

  const runtime = JSON.parse(
    artifacts.get(".living/observation-runtime.json") as string,
  ) as {
    collector: { endpoint: string };
    targets: Array<{
      events: {
        click?: {
          eventName: string;
          kind: string;
          nodeId: string;
          surfaceId?: string;
        };
      };
    }>;
  };
  assert.equal(runtime.collector.endpoint, "/api/living/events");
  const browserBinding = runtime.targets
    .map((target) => target.events.click)
    .find((binding) => binding !== undefined);
  assert.ok(browserBinding);
  assert.ok(
    applied.collectorDefinition.eventBindings.some(
      (binding) =>
        binding.eventName === browserBinding.eventName &&
        binding.kind === browserBinding.kind &&
        binding.nodeId === browserBinding.nodeId &&
        binding.surfaceId === browserBinding.surfaceId,
    ),
  );

  const observer = artifacts.get("src/living-observer.generated.ts") as string;
  const collector = artifacts.get("src/living-collector.generated.ts") as string;
  assert.ok(observer.includes(JSON.stringify(browserBinding.eventName)));
  assert.ok(observer.includes(JSON.stringify(browserBinding.nodeId)));
  assert.ok(collector.includes(JSON.stringify(browserBinding.eventName)));
  assert.ok(collector.includes(JSON.stringify(browserBinding.nodeId)));

  const route = artifacts.get("src/app/api/living/events/route.ts") as string;
  assert.ok(route.includes("living-collector.generated"));
  assert.match(route, /\bPOST\b/u);
});

test("create-only installation reports conflicts and never overwrites host files", async (t) => {
  const root = await createNextHost(t);
  const protectedPath = path.join(root, "src", "instrumentation-client.ts");
  const hostContent = "// host-owned instrumentation\n";
  await writeFile(protectedPath, hostContent, "utf8");

  const dry = await init(root, { installId: "install-conflict" });
  assert.equal(dry.plan.status, "conflict");
  assert.ok(dry.plan.diagnostics.some((message) => message.includes("instrumentation-client.ts")));
  await assert.rejects(
    () => init(root, { apply: true, installId: "install-conflict-apply" }),
    InstallConflictError,
  );
  assert.equal(await readFile(protectedPath, "utf8"), hostContent);
  assert.equal(await exists(path.join(root, ".living", "install-record.json")), false);
});

test("runtime bindings fail closed when a generated event points outside the manifest", async (t) => {
  const root = await createNextHost(t);
  await init(root, { apply: true, installId: "install-bindings" });
  const readJson = async (relative: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(path.join(root, ...relative.split("/")), "utf8")) as Record<string, unknown>;
  const runtime = await readJson(".living/observation-runtime.json");
  const manifest = await readJson(".living/product-manifest.json");
  const config = await readJson(".living/config.json");
  const routes = runtime.routes as Array<{ complete: { nodeId: string } }>;
  assert.ok(routes[0]);
  routes[0].complete.nodeId = "node.unknown";
  assert.throws(
    () => validateRuntimeBindings(runtime, manifest, config),
    /unknown node/u,
  );
});

test("analyze verifies the evidence chain and produces deterministic workflow evidence", async (t) => {
  const root = await createNextHost(t);
  const applied = await init(root, {
    apply: true,
    synthetic: true,
    installId: "install-analysis",
  });
  const definition = applied.collectorDefinition;
  const binding = definition.eventBindings.find(
    (candidate) => candidate.kind === "navigation" && candidate.eventName.endsWith(".complete"),
  );
  assert.ok(binding);
  const event: WorkflowEvent = {
    schemaVersion: "living.workflow-event/v1",
    eventId: "event-navigation-complete",
    appId: definition.application.appId,
    environment: definition.application.environment,
    releaseRevision: definition.application.releaseRevision,
    occurredAt: "2026-07-19T12:01:00.000Z",
    sequence: 0,
    name: binding.eventName,
    kind: binding.kind,
    status: "succeeded",
    sessionId: "session-analysis",
    product: {
      manifestHash: definition.application.manifestHash,
      nodeId: binding.nodeId,
      ...(binding.surfaceId === undefined ? {} : { surfaceId: binding.surfaceId }),
    },
    metadata: { routePhase: "complete" },
    provenance: { source: "technical-telemetry", synthetic: true },
  };
  const batch: WorkflowEventBatch = {
    schemaVersion: "living.event-batch/v1",
    sequence: 0,
    events: [event],
  };
  const collector = createEvidenceCollector({ rootPath: root, definition, clock: CLOCK });
  const response = await collector.handle(new Request("http://localhost:3000/api/living/events", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(batch),
  }));
  assert.equal(response.status, 202, JSON.stringify(await response.clone().json()));

  const first = await runRootCommand("analyze", { root });
  const second = await runRootCommand("analyze", { root });
  assert.equal((first.evidence as { records: number }).records, 1);
  assert.equal((first.evidence as { events: number }).events, 1);
  assert.equal(
    (first.evidence as { path: string }).path,
    evidenceRelativePathForManifestHash(definition.application.manifestHash),
  );
  assert.equal(
    (first.manifest as { contentHash: string }).contentHash,
    definition.application.manifestHash,
  );
  assert.deepEqual(first, second);
  assert.ok(Array.isArray(first.detectorProgress));
  assert.deepEqual(first.opportunityEvidence, {
    eventCount: 0,
    explicitSignalEventCount: 0,
    cohortExplicitSignalEventCount: 0,
    steps: [],
  });
  const liveWithEvidence = await loadLiveHostState(root);
  if (liveWithEvidence.installation.status !== "installed") {
    assert.fail("Expected installed live host with active evidence");
  }
  assert.equal("analysis" in liveWithEvidence.installation, false);

  const evidencePath = path.join(
    root,
    ...evidenceRelativePathForManifestHash(definition.application.manifestHash).split("/"),
  );
  const evidence = await readFile(evidencePath, "utf8");
  await writeFile(evidencePath, `${evidence}{"partial"`, "utf8");
  const liveDuringPartialAppend = await loadLiveHostState(root);
  if (liveDuringPartialAppend.installation.status !== "installed") {
    assert.fail("Expected installed live host during a partial evidence append");
  }
  assert.equal("analysis" in liveDuringPartialAppend.installation, false);
  await writeFile(
    evidencePath,
    evidence.replace('"succeeded"', '"failed"'),
    "utf8",
  );
  const liveDuringCorruptEvidence = await loadLiveHostState(root);
  if (liveDuringCorruptEvidence.installation.status !== "installed") {
    assert.fail("Expected host loading to remain independent from evidence parsing");
  }
  assert.equal("analysis" in liveDuringCorruptEvidence.installation, false);
  await writeFile(evidencePath, evidence, "utf8");
  const firstSnapshot = parseStudioSnapshot(
    await runRootCommand("snapshot", { root }),
  );
  const secondSnapshot = parseStudioSnapshot(
    await runRootCommand("snapshot", { root }),
  );
  assert.deepEqual(firstSnapshot, secondSnapshot);
  assert.equal("root" in firstSnapshot, false);
  assert.equal(firstSnapshot.application.dataOrigin, "synthetic");
  assert.deepEqual(firstSnapshot.productManifest, first.manifest);
  assert.equal(firstSnapshot.evidence.events, 1);
  assert.equal(firstSnapshot.workflows.cases.length, 1);
  assert.equal(firstSnapshot.workflows.variants.length, 1);
  assert.equal(firstSnapshot.workflows.cases[0]?.eventCount, 1);
  assert.equal(firstSnapshot.workflows.cases[0]?.sessionCount, 1);
  assert.deepEqual(firstSnapshot.workflows.cases[0]?.journeyNodeIds, [binding.nodeId]);
  assert.match(firstSnapshot.workflows.cases[0]?.caseId ?? "", /^case:[a-f0-9]{64}$/u);
  assert.equal(firstSnapshot.opportunity, undefined);
  await assert.rejects(
    loadAutomaticEvolutionInput(root),
    /No deterministic opportunity crossed its threshold/u,
  );
  const serializedSnapshot = JSON.stringify(firstSnapshot);
  assert.equal(serializedSnapshot.includes(root), false);
  assert.equal(serializedSnapshot.includes(event.eventId), false);
  assert.equal(serializedSnapshot.includes(event.sessionId), false);
  assert.equal(serializedSnapshot.includes(binding.eventName), false);
  assert.equal(serializedSnapshot.includes('"eventNames"'), false);
  assert.equal(serializedSnapshot.includes('"sessionIds"'), false);
  assert.equal(await readFile(evidencePath, "utf8"), evidence);

  const legacyPath = path.join(root, ...LEGACY_EVIDENCE_RELATIVE_PATH.split("/"));
  await rm(evidencePath);
  await writeFile(legacyPath, evidence, "utf8");
  const legacy = await runRootCommand("analyze", { root });
  assert.equal(
    (legacy.evidence as { path: string }).path,
    LEGACY_EVIDENCE_RELATIVE_PATH,
  );
  const liveWithoutActiveEvidence = await loadLiveHostState(root);
  if (liveWithoutActiveEvidence.installation.status !== "installed") {
    assert.fail("Expected installed live host after legacy evidence move");
  }
  assert.equal("analysis" in liveWithoutActiveEvidence.installation, false);
  assert.equal(await readFile(legacyPath, "utf8"), evidence);

  await writeFile(legacyPath, evidence.replace('"succeeded"', '"failed"'), "utf8");
  await assert.rejects(() => runRootCommand("analyze", { root }), /hash|integrity|record/u);
});

test("snapshot regroups journeys and minimizes detected Opportunity evidence", async (t) => {
  const root = await createNextHost(t);
  const applied = await init(root, {
    apply: true,
    synthetic: true,
    installId: "install-snapshot-opportunity",
  });
  const definition = applied.collectorDefinition;
  const routeBindings = definition.eventBindings.filter(
    (candidate) =>
      candidate.kind === "navigation" && candidate.eventName.endsWith(".complete"),
  );
  assert.ok(routeBindings.length >= 2);
  const firstRoute = routeBindings[0];
  const secondRoute = routeBindings[1];
  assert.ok(firstRoute);
  assert.ok(secondRoute);

  const collector = createEvidenceCollector({ rootPath: root, definition, clock: CLOCK });
  const rawIdentifiers: string[] = [];
  const allEvents: WorkflowEvent[] = [];
  for (let caseIndex = 0; caseIndex < 3; caseIndex += 1) {
    const sessionId = `private-session-${caseIndex}`;
    const journey = [firstRoute, secondRoute, firstRoute, secondRoute, firstRoute];
    const journeyEvents: WorkflowEvent[] = journey.map((binding, sequence) => {
      const eventId = `private-event-${caseIndex}-${sequence}`;
      rawIdentifiers.push(eventId, sessionId, binding.eventName);
      return {
        schemaVersion: "living.workflow-event/v1",
        eventId,
        appId: definition.application.appId,
        environment: definition.application.environment,
        releaseRevision: definition.application.releaseRevision,
        occurredAt: new Date(
          Date.parse("2026-07-19T12:01:00.000Z") + caseIndex * 10_000 + sequence * 100,
        ).toISOString(),
        sequence,
        name: binding.eventName,
        kind: binding.kind,
        status: "succeeded",
        sessionId,
        product: {
          manifestHash: definition.application.manifestHash,
          nodeId: binding.nodeId,
          ...(binding.surfaceId === undefined ? {} : { surfaceId: binding.surfaceId }),
        },
        metadata: { routePhase: "complete" },
        provenance: { source: "technical-telemetry", synthetic: true },
      };
    });
    const corroborationEventId = `private-event-${caseIndex}-corroboration`;
    rawIdentifiers.push(corroborationEventId);
    const events: WorkflowEvent[] = [
      ...journeyEvents,
      {
        ...journeyEvents[0]!,
        eventId: corroborationEventId,
        occurredAt: new Date(
          Date.parse("2026-07-19T12:01:00.000Z") + caseIndex * 10_000 + journey.length * 100,
        ).toISOString(),
        sequence: journey.length,
        status: "failed",
      },
    ];
    const batch: WorkflowEventBatch = {
      schemaVersion: "living.event-batch/v1",
      sequence: 0,
      events,
    };
    allEvents.push(...events);
    const response = await collector.handle(
      new Request("http://localhost:3000/api/living/events", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify(batch),
      }),
    );
    assert.equal(response.status, 202, JSON.stringify(await response.clone().json()));
  }

  const controlSessionId = "private-session-control";
  const controlEvents: WorkflowEvent[] = [firstRoute, secondRoute].map(
    (binding, sequence) => {
      const eventId = `private-control-event-${sequence}`;
      rawIdentifiers.push(eventId, controlSessionId, binding.eventName);
      return {
        schemaVersion: "living.workflow-event/v1",
        eventId,
        appId: definition.application.appId,
        environment: definition.application.environment,
        releaseRevision: definition.application.releaseRevision,
        occurredAt: new Date(
          Date.parse("2026-07-19T12:01:05.000Z") + sequence * 100,
        ).toISOString(),
        sequence,
        name: binding.eventName,
        kind: binding.kind,
        status: "succeeded",
        sessionId: controlSessionId,
        product: {
          manifestHash: definition.application.manifestHash,
          nodeId: binding.nodeId,
          ...(binding.surfaceId === undefined ? {} : { surfaceId: binding.surfaceId }),
        },
        metadata: { routePhase: "complete" },
        provenance: { source: "technical-telemetry", synthetic: true },
      };
    },
  );
  allEvents.push(...controlEvents);
  const controlResponse = await collector.handle(
    new Request("http://localhost:3000/api/living/events", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({
        schemaVersion: "living.event-batch/v1",
        sequence: 0,
        events: controlEvents,
      } satisfies WorkflowEventBatch),
    }),
  );
  assert.equal(controlResponse.status, 202, JSON.stringify(await controlResponse.clone().json()));

  const analyzed = await runRootCommand("analyze", { root });
  const analyzedOpportunity = analyzed.opportunity as {
    signal: { sequence?: readonly string[] };
  };
  const analyzedEvidence = analyzed.opportunityEvidence as {
    eventCount: number;
    explicitSignalEventCount: number;
    cohortExplicitSignalEventCount: number;
    steps: readonly { displayName: string; nodeId: string; name: string; kind: string }[];
  };
  assert.equal(analyzedEvidence.eventCount > 0, true);
  assert.equal(analyzedEvidence.explicitSignalEventCount, 0);
  assert.equal(analyzedEvidence.cohortExplicitSignalEventCount, 0);
  assert.equal(
    analyzedEvidence.steps.length,
    analyzedOpportunity.signal.sequence?.length ?? 0,
  );
  assert.ok(
    analyzedEvidence.steps.every((step) => step.displayName.length > 0),
  );

  const snapshot = parseStudioSnapshot(await runRootCommand("snapshot", { root }));
  assert.equal(snapshot.evidence.events, 20);
  assert.equal(snapshot.workflows.cases.length, 4);
  assert.equal(snapshot.workflows.variants.length, 2);
  assert.equal(snapshot.workflows.variants[0]?.caseCount, 3);
  assert.deepEqual(
    snapshot.workflows.variants[0]?.journeyNodeIds,
    [firstRoute.nodeId, secondRoute.nodeId, firstRoute.nodeId, secondRoute.nodeId, firstRoute.nodeId],
  );
  assert.ok(snapshot.opportunity);
  assert.equal(snapshot.opportunity.signal.kind, "backtracking");
  assert.equal("sequence" in snapshot.opportunity.signal, false);
  assert.equal("sampleEventIds" in snapshot.opportunity.evidence, false);

  const serialized = JSON.stringify(snapshot);
  for (const rawIdentifier of rawIdentifiers) {
    assert.equal(serialized.includes(rawIdentifier), false, rawIdentifier);
  }

  const evolutionInput = await loadAutomaticEvolutionInput(root);
  assert.equal(evolutionInput.snapshotHash, sha256(snapshot));
  assert.equal(allEvents.length, 20);
  assert.equal(evolutionInput.evidenceEvents.length, 18);
  assert.ok(
    evolutionInput.evidenceEvents.every(
      (candidate) => candidate.sessionId !== controlSessionId,
    ),
  );
  assert.equal(
    new Set(evolutionInput.evidenceEvents.map((candidate) => candidate.sessionId)).size,
    evolutionInput.opportunity.evidence.sessionCount,
  );

  let transportCalls = 0;
  const transport: IntelligenceTransport = {
    kind: "responses-api",
    async send() {
      transportCalls += 1;
      return { status: 503, body: { error: "test-stop-after-validation" } };
    },
  };
  const intelligence = createIntelligenceClient(transport);
  await assert.rejects(
    intelligence.draftEvolutionBrief({
      opportunity: evolutionInput.opportunity,
      manifest: evolutionInput.manifest,
      evidenceEvents: allEvents,
    }),
    /eventSetHash/u,
  );
  const wrongSessionCount: Opportunity = {
    ...evolutionInput.opportunity,
    evidence: {
      ...evolutionInput.opportunity.evidence,
      sessionCount: evolutionInput.opportunity.evidence.sessionCount + 1,
    },
  };
  await assert.rejects(
    intelligence.draftEvolutionBrief({
      opportunity: wrongSessionCount,
      manifest: evolutionInput.manifest,
      evidenceEvents: evolutionInput.evidenceEvents,
    }),
    /sessionCount/u,
  );
  const wrongSubjectCount: Opportunity = {
    ...evolutionInput.opportunity,
    evidence: {
      ...evolutionInput.opportunity.evidence,
      subjectCount: evolutionInput.opportunity.evidence.subjectCount + 1,
    },
  };
  await assert.rejects(
    intelligence.draftEvolutionBrief({
      opportunity: wrongSubjectCount,
      manifest: evolutionInput.manifest,
      evidenceEvents: evolutionInput.evidenceEvents,
    }),
    /subjectCount/u,
  );
  assert.equal(transportCalls, 0);
  await assert.rejects(
    intelligence.draftEvolutionBrief({
      opportunity: evolutionInput.opportunity,
      manifest: evolutionInput.manifest,
      evidenceEvents: evolutionInput.evidenceEvents,
    }),
    (error: unknown) =>
      error instanceof IntelligenceResponseError && error.code === "http_error",
  );
  assert.equal(transportCalls, 1);

  const lateControlSessionId = "private-session-control-late";
  const lateControlEvents: WorkflowEvent[] = [firstRoute, secondRoute].map(
    (binding, sequence) => ({
      schemaVersion: "living.workflow-event/v1",
      eventId: `private-control-late-event-${sequence}`,
      appId: definition.application.appId,
      environment: definition.application.environment,
      releaseRevision: definition.application.releaseRevision,
      occurredAt: new Date(
        Date.parse("2026-07-19T12:01:15.000Z") + sequence * 100,
      ).toISOString(),
      sequence,
      name: binding.eventName,
      kind: binding.kind,
      status: "succeeded",
      sessionId: lateControlSessionId,
      product: {
        manifestHash: definition.application.manifestHash,
        nodeId: binding.nodeId,
        ...(binding.surfaceId === undefined ? {} : { surfaceId: binding.surfaceId }),
      },
      metadata: { routePhase: "complete" },
      provenance: { source: "technical-telemetry", synthetic: true },
    }),
  );
  const lateControlResponse = await collector.handle(
    new Request("http://localhost:3000/api/living/events", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({
        schemaVersion: "living.event-batch/v1",
        sequence: 0,
        events: lateControlEvents,
      } satisfies WorkflowEventBatch),
    }),
  );
  assert.equal(
    lateControlResponse.status,
    202,
    JSON.stringify(await lateControlResponse.clone().json()),
  );

  const driftedInput = await loadAutomaticEvolutionInput(root);
  assert.equal(
    driftedInput.opportunity.opportunityId,
    evolutionInput.opportunity.opportunityId,
  );
  assert.equal(
    driftedInput.opportunity.evidence.eventSetHash,
    evolutionInput.opportunity.evidence.eventSetHash,
  );
  assert.deepEqual(driftedInput.evidenceEvents, evolutionInput.evidenceEvents);
  assert.notEqual(driftedInput.snapshotHash, evolutionInput.snapshotHash);
  assert.notDeepEqual(
    driftedInput.opportunity,
    evolutionInput.opportunity,
    "source-cohort drift must produce a different full Opportunity contract",
  );
  assert.equal(transportCalls, 1, "loading the drifted analysis does not itself call a model");
});

test("uninstall preserves evidence policy files and permits a clean reinstall", async (t) => {
  const root = await createNextHost(t);
  await init(root, { apply: true, installId: "install-uninstall" });
  const marker = path.join(root, ".living", "data", "keep.txt");
  await mkdir(path.dirname(marker), { recursive: true });
  await writeFile(marker, "preserve me\n", "utf8");

  const dry = await runRootCommand("uninstall", { root });
  assert.equal(dry.mode, "dry-run");
  assert.equal(await exists(path.join(root, "src", "instrumentation-client.ts")), true);
  const applied = await runRootCommand("uninstall", { root, apply: true });
  assert.deepEqual(applied.preservedPaths, REQUIRED_PRESERVED_PATHS);
  assert.equal(await exists(path.join(root, "src", "instrumentation-client.ts")), false);
  assert.equal(await readFile(marker, "utf8"), "preserve me\n");
  assert.equal(await exists(path.join(root, ".living", ".gitignore")), true);
  assert.equal(await exists(path.join(root, ".living", "install-record.json")), false);

  const reinstall = await init(root, { apply: true, installId: "install-reinstall" });
  assert.equal(reinstall.result?.status, "installed");
  assert.equal(await readFile(marker, "utf8"), "preserve me\n");
});

test("doctor is read-only and reports an uninstalled host without creating state", async (t) => {
  const root = await createNextHost(t);
  const result = await runRootCommand("doctor", { root });
  const diagnostics = result.diagnostics as Array<{ code: string }>;
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "NOT_INSTALLED"));
  assert.equal(await exists(path.join(root, ".living")), false);
});

test("live host loading maps an uninstalled host without creating state", async (t) => {
  const root = await createNextHost(t);
  const loaded = await loadLiveHostState(root);

  assert.equal(loaded.root, await realpath(root));
  assert.equal(loaded.application.appId, "automatic-crm");
  assert.ok(loaded.application.nodes > 0);
  assert.equal(loaded.installation.status, "not-installed");
  assert.equal(await exists(path.join(root, ".living")), false);
});

test("live host loading returns exact installed artifacts without reading evidence", async (t) => {
  const root = await createNextHost(t);
  await init(root, {
    apply: true,
    synthetic: true,
    installId: "install-live-host",
  });
  const loaded = await loadLiveHostState(root);
  if (loaded.installation.status !== "installed") {
    assert.fail(`Expected installed state, received ${loaded.installation.status}`);
  }

  assert.equal(loaded.installation.record.installId, "install-live-host");
  assert.equal(loaded.installation.record.appId, loaded.application.appId);
  assert.equal(
    loaded.installation.record.manifestHash,
    loaded.installation.manifest.contentHash,
  );
  assert.equal(
    loaded.installation.collectorDefinition.application.manifestHash,
    loaded.installation.manifest.contentHash,
  );
  assert.equal(
    loaded.installation.evidenceRelativePath,
    evidenceRelativePathForManifestHash(
      loaded.installation.manifest.contentHash,
    ),
  );
  assert.equal("analysis" in loaded.installation, false);
  assert.equal(
    await exists(
      path.join(
        root,
        ...loaded.installation.evidenceRelativePath.split("/"),
      ),
    ),
    false,
  );
});

test("live host loading reports a valid-schema install identity mismatch as invalid", async (t) => {
  const root = await createNextHost(t);
  await init(root, {
    apply: true,
    synthetic: true,
    installId: "install-live-mismatch",
  });
  const recordPath = path.join(root, ".living", "install-record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8")) as {
    appId: string;
  };
  record.appId = "other.application";
  await writeFile(recordPath, `${JSON.stringify(record)}\n`, "utf8");

  const loaded = await loadLiveHostState(root);
  assert.equal(loaded.installation.status, "invalid");
  if (loaded.installation.status !== "invalid") assert.fail("Expected invalid state");
  assert.equal(loaded.installation.reason, "install-record-mismatch");
});

test("live host loading keeps governed source drift separate from installation identity", async (t) => {
  const root = await createNextHost(t);
  await init(root, {
    apply: true,
    synthetic: true,
    installId: "install-live-source-drift",
  });
  const pagePath = path.join(root, "src", "app", "page.tsx");
  await writeFile(
    pagePath,
    `${await readFile(pagePath, "utf8")}\n// governed source transition\n`,
    "utf8",
  );

  const loaded = await loadLiveHostState(root);
  if (loaded.installation.status !== "installed") {
    assert.fail(`Source drift must remain installed, received ${loaded.installation.status}`);
  }
  assert.notEqual(
    loaded.application.releaseRevision,
    loaded.installation.manifest.release.revision,
  );
  assert.equal(loaded.installation.record.appId, loaded.application.appId);
});

test("an unchanged installed host remains idempotent and healthy across fresh scans", async (t) => {
  const root = await createNextHost(t);
  await init(root, { apply: true, installId: "install-idempotent" });

  const repeat = await runRootCommand("init", { root });
  assert.equal((repeat.plan as InstallPlan).status, "unchanged");
  const doctor = await runRootCommand("doctor", { root });
  const diagnostics = doctor.diagnostics as Array<{ code: string; severity: string }>;
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "INSTALL_HEALTHY"));
  assert.equal(diagnostics.some((diagnostic) => diagnostic.severity === "error"), false);
});

test("doctor detects product-map drift when the source digest is unchanged", async (t) => {
  const root = await createNextHost(t);
  await init(root, { apply: true, installId: "install-map-drift" });
  const manifestPath = path.join(root, ".living", "product-manifest.json");
  const runtimePath = path.join(root, ".living", "observation-runtime.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    contentHash: string;
    release: { revision: string };
  };
  const runtime = JSON.parse(await readFile(runtimePath, "utf8")) as {
    application: { manifestHash: string; releaseRevision: string };
  };
  const installedRevision = manifest.release.revision;
  const driftHash = `sha256:${"c".repeat(64)}`;
  manifest.contentHash = driftHash;
  runtime.application.manifestHash = driftHash;
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
  await writeFile(runtimePath, `${JSON.stringify(runtime)}\n`, "utf8");

  const doctor = await runRootCommand("doctor", { root });
  const diagnostics = doctor.diagnostics as Array<{ code: string; severity: string }>;
  const discovery = doctor.discovery as { sourceDigest: string };
  assert.equal(discovery.sourceDigest, installedRevision);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "PRODUCT_MAP_DRIFT"));
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "SOURCE_MAP_DRIFT"), false);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "INSTALL_HEALTHY"), false);
});
