import assert from "node:assert/strict";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import "./register-test-hooks.mjs";

import type { CollectorDefinition } from "@living-software/collector";
import { canonicalStringify, sha256 } from "@living-software/core";

const {
  LiveEvidenceIntegrityError,
  ReleaseEvidenceTailer,
} = await import("../src/lib/evidence-tailer");

const HASH = `sha256:${"a".repeat(64)}` as const;

const definition: CollectorDefinition = {
  schemaVersion: "living.collector-definition/v1",
  application: {
    appId: "app.tail-test",
    environment: "development",
    releaseRevision: "release-one",
    manifestHash: HASH,
    synthetic: true,
  },
  eventBindings: [{
    eventName: "lead.viewed",
    kind: "navigation",
    nodeId: "route.leads",
  }],
};

function record(sequence: number, previousRecordHash: string | null) {
  const batch = {
    schemaVersion: "living.event-batch/v1" as const,
    sequence,
    events: [{
      schemaVersion: "living.workflow-event/v1" as const,
      eventId: `event.tail.${sequence}`,
      appId: definition.application.appId,
      environment: definition.application.environment,
      releaseRevision: definition.application.releaseRevision,
      occurredAt: `2026-07-21T12:00:0${sequence}.000Z`,
      sequence,
      name: "lead.viewed",
      kind: "navigation" as const,
      status: "succeeded" as const,
      sessionId: "session.tail",
      product: {
        manifestHash: HASH,
        nodeId: "route.leads",
      },
      metadata: { routePhase: "complete" },
      provenance: { source: "technical-telemetry" as const, synthetic: true },
    }],
  };
  const batchHash = sha256(batch);
  const payload = {
    schemaVersion: "living.evidence-batch/v1" as const,
    acceptedAt: `2026-07-21T12:00:1${sequence}.000Z`,
    previousRecordHash,
    batchHash,
    batch,
  };
  return { ...payload, recordHash: sha256(payload) };
}

async function fixture() {
  const root = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(tmpdir(), "living-tail-test-")),
  );
  const directory = path.join(root, ".living", "data", "releases", "a".repeat(64));
  await mkdir(directory, { recursive: true });
  return { root, evidencePath: path.join(directory, "events.ndjson") };
}

function line(value: unknown): string {
  return `${canonicalStringify(value as never)}\n`;
}

test("tailer holds partial final lines and suppresses repeated notifications", async () => {
  const { root, evidencePath } = await fixture();
  try {
    const first = record(0, null);
    await writeFile(evidencePath, `${line(first)}{"partial":`, "utf8");
    const tailer = new ReleaseEvidenceTailer(root, evidencePath, definition);
    const partial = await tailer.read();
    assert.equal(partial.status, "partial");
    assert.equal(partial.records.length, 1);
    assert.equal(partial.newRecords.length, 1);
    assert.ok(partial.partialBytes > 0);

    const repeated = await tailer.read();
    assert.equal(repeated.status, "partial");
    assert.equal(repeated.newRecords.length, 0);

    const second = record(1, first.recordHash);
    await writeFile(evidencePath, line(first) + line(second), "utf8");
    const completed = await tailer.read();
    assert.equal(completed.status, "ready");
    assert.deepEqual(completed.newRecords.map((item) => item.recordHash), [second.recordHash]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tailer validates only the committed prefix during an in-flight UTF-8 append", async () => {
  const { root, evidencePath } = await fixture();
  try {
    const first = record(0, null);
    const partialCodePoint = Buffer.from([0xf0, 0x9f]);
    await writeFile(
      evidencePath,
      Buffer.concat([Buffer.from(line(first), "utf8"), partialCodePoint]),
    );
    const tailer = new ReleaseEvidenceTailer(root, evidencePath, definition);
    const snapshot = await tailer.read();

    assert.equal(snapshot.status, "partial");
    assert.deepEqual(snapshot.records.map((item) => item.recordHash), [first.recordHash]);
    assert.equal(snapshot.partialBytes, partialCodePoint.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent notifications are serialized and expose each record once", async () => {
  const { root, evidencePath } = await fixture();
  try {
    const first = record(0, null);
    await writeFile(evidencePath, line(first), "utf8");
    const tailer = new ReleaseEvidenceTailer(root, evidencePath, definition);
    const snapshots = await Promise.all([tailer.read(), tailer.read()]);

    assert.deepEqual(
      snapshots.map((snapshot) => snapshot.newRecords.length).sort(),
      [0, 1],
    );
    assert.deepEqual(tailer.anchor(), {
      recordCount: 1,
      chainHead: first.recordHash,
      totalBytes: Buffer.byteLength(line(first), "utf8"),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tailer rejects truncation, replacement, deletion, and symlinks", async (context) => {
  await context.test("truncation", async () => {
    const { root, evidencePath } = await fixture();
    try {
      const first = record(0, null);
      const second = record(1, first.recordHash);
      await writeFile(evidencePath, line(first) + line(second), "utf8");
      const tailer = new ReleaseEvidenceTailer(root, evidencePath, definition);
      await tailer.read();
      await writeFile(evidencePath, line(first), "utf8");
      await assert.rejects(() => tailer.read(), (error) =>
        error instanceof LiveEvidenceIntegrityError && error.code === "evidence-truncated");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await context.test("replacement", async () => {
    const { root, evidencePath } = await fixture();
    try {
      const first = record(0, null);
      await writeFile(evidencePath, line(first), "utf8");
      const tailer = new ReleaseEvidenceTailer(root, evidencePath, definition);
      await tailer.read();
      await rm(evidencePath);
      await writeFile(evidencePath, line(first), "utf8");
      await assert.rejects(() => tailer.read(), (error) =>
        error instanceof LiveEvidenceIntegrityError && error.code === "evidence-replaced");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await context.test("deletion", async () => {
    const { root, evidencePath } = await fixture();
    try {
      await writeFile(evidencePath, line(record(0, null)), "utf8");
      const tailer = new ReleaseEvidenceTailer(root, evidencePath, definition);
      await tailer.read();
      await rm(evidencePath);
      await assert.rejects(() => tailer.read(), (error) =>
        error instanceof LiveEvidenceIntegrityError && error.code === "evidence-deleted");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  if (process.platform !== "win32") {
    await context.test("symlink", async () => {
      const { root, evidencePath } = await fixture();
      const outside = path.join(root, "outside.ndjson");
      try {
        await writeFile(outside, line(record(0, null)), "utf8");
        await symlink(outside, evidencePath, "file");
        const tailer = new ReleaseEvidenceTailer(root, evidencePath, definition);
        await assert.rejects(() => tailer.read(), (error) =>
          error instanceof LiveEvidenceIntegrityError && error.code === "evidence-symlink");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    await context.test("symlinked parent", async () => {
      const { root } = await fixture();
      const outside = await import("node:fs/promises").then(({ mkdtemp }) =>
        mkdtemp(path.join(tmpdir(), "living-tail-outside-")),
      );
      const linkedParent = path.join(root, "linked");
      const evidencePath = path.join(linkedParent, "events.ndjson");
      try {
        await writeFile(path.join(outside, "events.ndjson"), line(record(0, null)), "utf8");
        await symlink(outside, linkedParent, "dir");
        const tailer = new ReleaseEvidenceTailer(root, evidencePath, definition);
        await assert.rejects(() => tailer.read(), (error) =>
          error instanceof LiveEvidenceIntegrityError && error.code === "evidence-symlink");
      } finally {
        await rm(root, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
      }
    });
  }
});
