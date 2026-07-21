import assert from "node:assert/strict";
import test from "node:test";

import { parseLiveEvent } from "@living-software/contracts";

import "./register-test-hooks.mjs";

const { GET: getLiveEvents, encodeLiveSseEvent } = await import(
  "../src/app/api/live/events/route"
);
const { GET: getLiveState } = await import("../src/app/api/live/state/route");
const { POST: postLiveCommand } = await import("../src/app/api/live/command/route");

test("SSE frames use the durable monotonic sequence as id and carry one strict event", () => {
  const event = parseLiveEvent({
    schemaVersion: "living.live-event/v1",
    sessionId: "live-session.sse",
    eventId: "event.sse.7",
    sequence: 7,
    emittedAt: "2026-07-21T12:00:00.000Z",
    origin: "system",
    kind: "status",
    stage: "connection",
    state: "completed",
    actor: "system",
    summary: "Live stream connected",
    refs: {},
    facts: { code: "stream-connected" },
    previousEventHash: `sha256:${"a".repeat(64)}`,
    eventHash: `sha256:${"b".repeat(64)}`,
  });
  const frame = new TextDecoder().decode(encodeLiveSseEvent(event));
  assert.match(frame, /^id: 7\nevent: live-event\ndata: /u);
  assert.ok(frame.endsWith("\n\n"));
  const data = frame.split("\ndata: ")[1]?.slice(0, -2);
  assert.ok(data);
  assert.deepEqual(parseLiveEvent(JSON.parse(data) as unknown), event);
  assert.doesNotMatch(frame, /reasoning|prompt|sourceContent|metadata/u);
});

test("live route failures expose only stable generic browser messages", async () => {
  const remote = "http://example.test/api/live";
  const eventsResponse = await getLiveEvents(new Request(`${remote}/events`));
  assert.equal(eventsResponse.status, 400);
  assert.deepEqual(await eventsResponse.json(), {
    error: "Live stream request was rejected",
  });

  const stateResponse = await getLiveState(new Request(`${remote}/state`));
  assert.equal(stateResponse.status, 500);
  assert.deepEqual(await stateResponse.json(), {
    error: "Live state is unavailable",
  });

  const commandResponse = await postLiveCommand(new Request(`${remote}/command`, {
    method: "POST",
  }));
  assert.equal(commandResponse.status, 400);
  assert.deepEqual(await commandResponse.json(), {
    schemaVersion: "living.live-command-result/v1",
    commandId: "invalid-command",
    accepted: false,
    revision: 0,
    error: {
      code: "invalid-command",
      message: "Live command request was rejected",
    },
  });
});
