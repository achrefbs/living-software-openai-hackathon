import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { LiveEvent } from "@living-software/contracts";

import {
  DurableLiveEventStore,
  LiveEventStoreError,
  parseLastEventId,
  type LiveEventDraft,
} from "../src/lib/live-event-store";

const sessionId = "live-session.test";

function statusDraft(
  eventId: string,
  state: "started" | "progress" | "completed" | "failed" | "waiting",
  emittedAt = "2026-07-21T10:00:00.000Z",
): LiveEventDraft {
  return {
    eventId,
    emittedAt,
    origin: "system",
    kind: "status",
    stage: "mapping",
    state,
    actor: "system",
    summary: state === "completed" ? "Product map validated" : "Product mapping started",
    refs: {},
    facts: {
      code: state === "completed" ? "map-complete" : "map-started",
      ...(state === "failed" ? { errorCode: "map-failed" } : {}),
    },
  };
}

async function withDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "living-live-events-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("durable event store suppresses duplicate notifications and preserves its hash chain", async () => {
  await withDirectory(async (directory) => {
    const store = new DurableLiveEventStore({ directory, sessionId });
    const first = await store.append(statusDraft("map-started", "started"));
    const duplicate = await store.append(
      statusDraft("map-started", "started", "2026-07-21T10:00:01.000Z"),
    );
    const second = await store.append(statusDraft("map-complete", "completed"));

    assert.equal(first.sequence, 0);
    assert.equal(duplicate.eventHash, first.eventHash);
    assert.equal(second.sequence, 1);
    assert.equal(second.previousEventHash, first.eventHash);

    const restarted = new DurableLiveEventStore({ directory, sessionId });
    const pages = await restarted.replay(null);
    assert.deepEqual(
      pages.flatMap((page) => page.events.map((event) => event.sequence)),
      [0, 1],
    );
  });
});

test("duplicate IDs are idempotent only when every semantic fact matches", async () => {
  await withDirectory(async (directory) => {
    const store = new DurableLiveEventStore({ directory, sessionId });
    await store.append(statusDraft("map-started", "started"));

    await assert.rejects(
      store.append({
        ...statusDraft("map-started", "started", "2026-07-21T10:00:01.000Z"),
        summary: "A conflicting mapping fact",
      }),
      (error: unknown) =>
        error instanceof LiveEventStoreError && error.code === "EVENT_ID_CONFLICT",
    );
    await assert.rejects(
      store.append({
        ...statusDraft("map-started", "started"),
        emittedAt: "not-a-timestamp",
      }),
    );
    assert.equal((await store.replay(null)).flatMap((page) => page.events).length, 1);
  });
});

test("replay cursor and subscription provide reconnect without fabricated catch-up events", async () => {
  await withDirectory(async (directory) => {
    const store = new DurableLiveEventStore({ directory, sessionId });
    await store.append(statusDraft("map-started", "started"));
    const second = await store.append(statusDraft("map-complete", "completed"));
    const delivered: LiveEvent[] = [];
    const subscription = await store.subscribe(0, (event) => delivered.push(event));

    assert.deepEqual(subscription.replays.flatMap((page) => page.events), [second]);
    const third = await store.append({
      ...statusDraft("install-waiting", "waiting"),
      stage: "installation",
      summary: "Host found, Living not installed",
      facts: { code: "living-not-installed" },
    });
    assert.deepEqual(delivered, [third]);
    subscription.close();

    const exactHead = await store.replay(third.sequence);
    assert.equal(exactHead.length, 1);
    assert.deepEqual(exactHead[0]?.events, []);
  });
});

test("subscription registration is an append barrier and subscriber failures stay display-only", async () => {
  await withDirectory(async (directory) => {
    const store = new DurableLiveEventStore({ directory, sessionId });
    const delivered: LiveEvent[] = [];
    const subscriptionPromise = store.subscribe(null, (event) => {
      delivered.push(event);
      throw new Error("display listener failed");
    });
    const appendPromise = store.append(statusDraft("map-started", "started"));
    const [subscription, event] = await Promise.all([subscriptionPromise, appendPromise]);

    const replayed = subscription.replays.flatMap((page) => page.events);
    assert.deepEqual([...replayed, ...delivered], [event]);
    subscription.close();

    const restarted = new DurableLiveEventStore({ directory, sessionId });
    assert.deepEqual(
      (await restarted.replay(null)).flatMap((page) => page.events),
      [event],
    );
  });
});

test("Last-Event-ID accepts only canonical bounded decimal sequences", () => {
  assert.equal(parseLastEventId(null), null);
  assert.equal(parseLastEventId("0"), 0);
  assert.equal(parseLastEventId("42"), 42);
  for (const invalid of ["-1", "+1", "01", "1.0", "abc", "9999999999999999"]) {
    assert.throws(() => parseLastEventId(invalid), LiveEventStoreError);
  }
});

test("replay rejects cursors beyond the durable head", async () => {
  await withDirectory(async (directory) => {
    const store = new DurableLiveEventStore({ directory, sessionId });
    await store.append(statusDraft("map-started", "started"));
    await assert.rejects(
      store.replay(1),
      (error: unknown) =>
        error instanceof LiveEventStoreError && error.code === "CURSOR_AHEAD",
    );
  });
});

test("restart rejects a modified durable event instead of trusting display state", async () => {
  await withDirectory(async (directory) => {
    const store = new DurableLiveEventStore({ directory, sessionId });
    await store.append(statusDraft("map-started", "started"));
    const [name] = await (await import("node:fs/promises")).readdir(directory);
    assert.ok(name);
    const target = path.join(directory, name);
    const parsed = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
    parsed.summary = "tampered";
    await writeFile(target, JSON.stringify(parsed), "utf8");

    const restarted = new DurableLiveEventStore({ directory, sessionId });
    await assert.rejects(restarted.ready(), (error: unknown) => {
      assert.ok(error instanceof LiveEventStoreError);
      assert.equal(error.code, "EVENT_CHAIN_INVALID");
      return true;
    });
  });
});
