import assert from "node:assert/strict";
import test from "node:test";

import { createEventClient, MetadataPrivacyError } from "./index.js";
import type { EventBatch, EventTransport } from "./types.js";

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: "living.workflow-event/v1",
    eventId: "evt-00000001",
    appId: "neutral-next-host",
    environment: "development",
    releaseRevision: "fixture-revision-1",
    occurredAt: "2026-07-19T12:00:00.000Z",
    sequence: 1,
    name: "record.opened",
    kind: "navigation",
    status: "succeeded",
    sessionId: "session-00000001",
    subject: {
      type: "record",
      pseudonymousId: "subject-00000001",
    },
    metadata: {},
    provenance: {
      source: "simulator",
      synthetic: true,
    },
    ...overrides,
  };
}

test("validates events through the public workflow contract", async () => {
  const transport: EventTransport = { send: async () => undefined };
  const client = createEventClient({ transport });

  await assert.rejects(
    client.record({ schemaVersion: "living.workflow-event/v0" }),
    /workflow-event\/v1|Invalid input/i,
  );
  assert.equal(client.queued, 0);
});

test("denies metadata unless its leaf path is explicitly allowed", async () => {
  const transport: EventTransport = { send: async () => undefined };
  const denied = createEventClient({ transport });

  await assert.rejects(
    denied.record(event({ metadata: { attempt: 1 } })),
    MetadataPrivacyError,
  );

  const allowed = createEventClient({
    transport,
    metadata: { allowedKeys: ["attempt"] },
  });
  await allowed.record(event({ metadata: { attempt: 1 } }));
  assert.equal(allowed.queued, 1);
});

test("blocks sensitive-looking keys even when allowlisted", async () => {
  const transport: EventTransport = { send: async () => undefined };
  const client = createEventClient({
    transport,
    metadata: { allowedKeys: ["messageText"] },
  });

  await assert.rejects(
    client.record(event({ metadata: { messageText: "synthetic but disallowed" } })),
    /sensitive content/,
  );
});

test("batches deterministically and closes after flushing", async () => {
  const batches: EventBatch[] = [];
  const transport: EventTransport = {
    async send(batch) {
      batches.push(batch);
      return { accepted: batch.events.length, transportId: "memory" };
    },
  };
  const client = createEventClient({ transport, maxBatchSize: 2 });

  await client.record(event());
  const second = await client.record(event({ eventId: "evt-00000002", sequence: 2 }));
  assert.equal(second.flushed, true);
  assert.equal(batches.length, 1);
  assert.equal(batches[0]?.sequence, 0);
  assert.deepEqual(
    batches[0]?.events.map((item) => item.eventId),
    ["evt-00000001", "evt-00000002"],
  );

  await client.record(event({ eventId: "evt-00000003", sequence: 3 }));
  const result = await client.close();
  assert.deepEqual(result, { batches: 1, events: 1 });
  assert.equal(client.closed, true);
  await assert.rejects(client.record(event()), /closed/);
});

test("requeues a complete batch when transport delivery fails", async () => {
  let attempts = 0;
  const transport: EventTransport = {
    async send(batch) {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return { accepted: batch.events.length };
    },
  };
  const client = createEventClient({ transport, maxBatchSize: 2 });

  await client.record(event());
  await assert.rejects(
    client.record(event({ eventId: "evt-00000002", sequence: 2 })),
    /offline/,
  );
  assert.equal(client.queued, 2);

  const result = await client.flush();
  assert.deepEqual(result, { batches: 1, events: 2 });
  assert.equal(client.queued, 0);
});
