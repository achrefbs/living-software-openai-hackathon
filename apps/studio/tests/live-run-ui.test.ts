import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const liveDirectory = fileURLToPath(
  new URL("../src/app/live/", import.meta.url),
);

async function sources() {
  const [client, css, page] = await Promise.all([
    readFile(path.join(liveDirectory, "live-run-client.tsx"), "utf8"),
    readFile(path.join(liveDirectory, "live-run.module.css"), "utf8"),
    readFile(path.join(liveDirectory, "page.tsx"), "utf8"),
  ]);
  return { client, css, page };
}

test("live run uses one validated SSE-driven state refresh path and no polling", async () => {
  const { client, page } = await sources();
  assert.match(page, /<LiveRunClient \/>/u);
  assert.match(client, /new EventSource\("\/api\/live\/events"\)/u);
  assert.match(
    client,
    /addEventListener\("live-event", onLiveEvent\)/u,
  );
  assert.equal(client.match(/"\/api\/live\/state"/gu)?.length, 1);
  assert.equal(client.match(/"\/api\/live\/command"/gu)?.length, 1);
  assert.doesNotMatch(client, /setInterval|setTimeout|polling|router\.refresh/u);

  const eventHandler = client.slice(
    client.indexOf("const onLiveEvent"),
    client.indexOf('source.addEventListener("open"'),
  );
  assert.ok(eventHandler.indexOf("parseLiveEvent") >= 0);
  assert.ok(
    eventHandler.indexOf("parseLiveEvent") <
      eventHandler.indexOf("void refreshState()"),
  );
  assert.equal(eventHandler.match(/void refreshState\(\)/gu)?.length, 1);
  assert.match(
    eventHandler,
    /parsed\.kind === "source-transition"[\s\S]*parsed\.facts\.transition === "apply"[\s\S]*parsed\.sequence > initialHeadSequence[\s\S]*setAppliedSequence/u,
  );
  assert.match(
    client,
    /const initialView = await refreshState\(\)[\s\S]*const initialHeadSequence = initialView\.state\.headSequence \?\? -1[\s\S]*new EventSource/u,
  );

  const commandHandler = client.slice(
    client.indexOf("const sendCommand"),
    client.indexOf("return (", client.indexOf("const sendCommand")),
  );
  assert.doesNotMatch(commandHandler, /refreshState/u);
  assert.match(commandHandler, /parseLiveCommandResult/u);
  assert.match(
    commandHandler,
    /Waiting for the authoritative live event before changing the view/u,
  );
});

test("live run command and presentation boundaries remain explicit and host-neutral", async () => {
  const { client } = await sources();
  for (const field of [
    "schemaVersion",
    "commandId",
    "sessionId",
    "appId",
    "manifestHash",
    "snapshotHash",
    "expectedRevision",
  ]) {
    assert.match(client, new RegExp(`${field}:`, "u"));
  }
  assert.match(client, /parseLiveCommandEnvelope/u);
  assert.match(client, /reviewConfirmed: true/u);
  assert.match(client, /Human receipt label/u);
  assert.match(client, /approval does not apply source/u);
  assert.match(client, /Living learned/u);
  assert.match(client, /GPT invented/u);
  assert.match(client, /Living proved/u);
  assert.match(client, /Source versus runtime/u);
  assert.match(client, /An HTTP response does not prove/u);
  assert.match(client, /Normalized source diff/u);
  assert.match(client, /Receipt chain/u);
  assert.match(client, /modelRuns\.interpretation/u);
  assert.match(client, /modelRuns\.patch/u);
  assert.match(client, /Frames appear only when a validated URL exists/u);
  assert.match(client, /application\?\.displayName \?\? view\.mappedHost\.displayName/u);
  assert.match(client, /application\?\.appId \?\? view\.mappedHost\.appId/u);
  assert.match(
    client,
    /application\?\.releaseRevision \?\? view\.mappedHost\.releaseRevision/u,
  );
  assert.match(client, /view\.mappedHost\.framework/u);
  assert.match(client, /headerHost\.environment === undefined[\s\S]*"Not available"/u);
  assert.match(client, /onLoad=\{\(\) => \{/u);
  assert.match(
    client,
    /Host responded after source apply — visually inspect the change\./u,
  );
  assert.equal(
    client.match(/kind: "(?:rework-loop|failure-cluster|backtracking|repeated-sequence)"/gu)?.length,
    4,
  );
  assert.match(client, /recurrence alone does not prove friction or intent/iu);
  assert.doesNotMatch(client, /CRM|lead review|customer record/iu);
});

test("live run exposes semantic status, keyboard focus, and reduced-motion safeguards", async () => {
  const { client, css } = await sources();
  assert.match(client, /role="status" aria-live="polite"/u);
  assert.match(
    client,
    /aria-live="polite"[\s\S]{0,80}aria-atomic="true"/u,
  );
  assert.match(client, /role="alert"/u);
  assert.match(client, /aria-labelledby="pipeline-title"/u);
  assert.match(client, /aria-labelledby="next-action-title"/u);
  assert.match(client, /aria-describedby="live-actor-help"/u);
  assert.equal(client.includes('title={`${frame.label}:'), true);
  assert.match(client, /<details>/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /min-height: 48px/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /\.applyPulse[\s\S]*animation: none/u);
  assert.match(css, /\.reconnecting[\s\S]*animation: none/u);
  assert.match(css, /@media \(max-width: 760px\)/u);
});
