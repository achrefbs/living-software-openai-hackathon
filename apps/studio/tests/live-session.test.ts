import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadLiveHostState, runRootCommand } from "@living-software/cli";
import { parseLiveCommandEnvelope } from "@living-software/contracts";

import "./register-test-hooks.mjs";

const { LiveSession } = await import("../src/lib/live-session");

async function createSupportedHost(context: test.TestContext): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "living-live-session-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const files = {
    "package.json": JSON.stringify({
      name: "generic-live-host",
      version: "1.0.0",
      dependencies: { next: "16.2.10", react: "19.2.7" },
    }),
    "src/app/page.tsx": `
      import Link from "next/link";
      export default function Page() {
        return <main data-testid="home"><Link href="/work">Open work</Link></main>;
      }
    `,
    "src/app/work/page.tsx": `
      export default function Work() {
        return <main><button data-testid="complete-work">Complete</button></main>;
      }
    `,
  } as const;
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return root;
}

test("live session starts before install and reconstructs installed zero-threshold state", async (context) => {
  const root = await createSupportedHost(context);
  const mapped = await loadLiveHostState(root);
  assert.equal(mapped.installation.status, "not-installed");
  const eventDirectory = path.join(root, ".studio-live-events");
  const config = {
    sessionId: "live-session.integration",
    hostRoot: root,
    hostUrl: "http://127.0.0.1:3000/",
    previewUrl: null,
    beforeUrl: null,
    startupAppId: mapped.application.appId,
    startupManifestHash: mapped.application.manifestHash,
    eventDirectory,
  } as const;

  const before = new LiveSession(config);
  await before.start();
  const beforeView = await before.view();
  assert.equal(beforeView.mappedHost.appId, mapped.application.appId);
  assert.equal(beforeView.state.application, undefined);
  assert.equal(beforeView.state.installation, "not-installed");
  assert.equal(beforeView.nextAction.type, "install");
  assert.deepEqual(
    beforeView.state.detectorProgress.map((progress) => [
      progress.signalKind,
      progress.affectedCases,
      progress.minimumAffectedCases,
    ]),
    [
      ["rework-loop", 0, 3],
      ["failure-cluster", 0, 3],
      ["repeated-sequence", 0, 3],
      ["backtracking", 0, 3],
    ],
  );
  before.close();

  await runRootCommand("init", {
    root,
    apply: true,
    synthetic: true,
    clock: () => new Date("2026-07-21T12:00:00.000Z"),
    installId: "install-live-session-test",
  });

  const restarted = new LiveSession(config);
  await restarted.start();
  const installedView = await restarted.view();
  assert.equal(installedView.state.installation, "installed");
  assert.equal(installedView.state.application?.dataOrigin, "synthetic");
  assert.equal(installedView.state.evidence.acceptedBatchCount, 0);
  assert.equal(installedView.nextAction.type, "capture-evidence");
  assert.equal(installedView.state.detectorProgress.length, 4);

  const rejectedEnvelope = parseLiveCommandEnvelope({
    schemaVersion: "living.live-command/v1",
    commandId: "command.live-session.rejected",
    sessionId: config.sessionId,
    appId: mapped.application.appId,
    manifestHash: mapped.application.manifestHash,
    snapshotHash: `sha256:${"b".repeat(64)}`,
    expectedRevision: 0,
    command: {
      type: "evolution.prepare",
      provider: "codex",
      opportunityId: "opportunity.not-ready",
      eventSetHash: `sha256:${"c".repeat(64)}`,
    },
  });
  const [rejected, inFlight] = await Promise.all([
    restarted.command(rejectedEnvelope),
    restarted.command(parseLiveCommandEnvelope({
      ...rejectedEnvelope,
      commandId: "command.live-session.concurrent",
    })),
  ]);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.error?.code, "command-rejected");
  assert.equal(rejected.error?.message, "The governed backend rejected this command");
  assert.equal(inFlight.accepted, false);
  assert.equal(inFlight.error?.code, "command-in-flight");

  const replayed = await restarted.subscribe(null, () => undefined);
  const events = replayed.replays.flatMap((page) => page.events);
  const summaries = events.map((event) => event.summary);
  replayed.close();
  assert.ok(summaries.includes("Host found, Living not installed"));
  assert.ok(summaries.includes("Validated install record; observer ready"));
  assert.ok(events.some((event) =>
    event.kind === "status" &&
    event.state === "failed" &&
    event.facts.code === "command-failed" &&
    event.facts.errorCode === "command-rejected"));
  for (const event of events.filter((candidate) => candidate.kind === "status")) {
    assert.equal(event.appId, mapped.application.appId);
    assert.equal(event.manifestHash, mapped.application.manifestHash);
  }
  restarted.close();
  await assert.rejects(() => restarted.view(), /Live session is closed/u);
});
