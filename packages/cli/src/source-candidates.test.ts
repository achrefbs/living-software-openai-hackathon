import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  mkdtemp,
  open,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ProductManifest } from "@living-software/contracts";

import {
  SOURCE_CANDIDATE_LIMITS,
  SourceCandidateError,
  collectSourceCandidates,
} from "./source-candidates.js";

const HASH = `sha256:${"a".repeat(64)}` as const;
const REVISION = "sha256:" + "b".repeat(64);

async function repository(t: test.TestContext): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "living-source-candidates-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  return root;
}

async function write(
  root: string,
  relative: string,
  content: string | Uint8Array,
): Promise<void> {
  const target = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

function manifest(
  sourcesByNode: Readonly<Record<string, readonly string[]>>,
): ProductManifest {
  return {
    schemaVersion: "living.product-manifest/v1",
    appId: "candidate-test-app",
    release: { revision: REVISION },
    generatedAt: "2026-07-20T00:00:00.000Z",
    generators: [{ adapterId: "candidate-test", adapterVersion: "1.0.0" }],
    nodes: Object.entries(sourcesByNode).map(([id, sources]) => ({
      id,
      kind: "surface",
      displayName: id,
      provenance: {
        origin: "scanned",
        confidence: 1,
        sources: sources.map((sourcePath) => ({
          path: sourcePath,
          revision: REVISION,
        })),
      },
    })),
    edges: [],
    contentHash: HASH,
  };
}

function expectedHash(content: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function hasCode(code: SourceCandidateError["code"]) {
  return (error: unknown): boolean =>
    error instanceof SourceCandidateError && error.code === code;
}

test("collects exact, hash-bound UI sources from affected manifest nodes only", async (t) => {
  const root = await repository(t);
  const files = {
    "src/app/accounts/page.tsx": "\uFEFFexport default function Accounts() { return null; }\n",
    "src/app/accounts/styles.css": ".account { display: grid; }\n",
    "src/components/AccountCard.jsx": "export function AccountCard() { return null; }\n",
    "src/app/api/accounts/route.ts": "export async function GET() {}\n",
    "src/app/api/dashboard/page.tsx": "export default function ApiPage() { return null; }\n",
    "src/app/config/settings.ts": "export const setting = true;\n",
    "src/components/AccountCard.test.tsx": "throw new Error('not source context');\n",
    "src/app/config.ts": "export const secret = true;\n",
    "src/app/env.ts": "export const token = true;\n",
    "src/app/session-lock.ts": "export const lock = true;\n",
    "src/lib/private.ts": "export const privateValue = true;\n",
    "src/app/accounts/readme.md": "# ignored\n",
  } as const;
  for (const [relative, content] of Object.entries(files)) {
    await write(root, relative, content);
  }

  const candidates = await collectSourceCandidates({
    repositoryRoot: root,
    manifest: manifest({
      "surface.accounts": Object.keys(files),
      "surface.unaffected": ["src/app/unaffected/page.tsx"],
    }),
    brief: { affectedProductNodeIds: ["surface.accounts"] },
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.path),
    [
      "src/app/accounts/page.tsx",
      "src/app/accounts/styles.css",
      "src/components/AccountCard.jsx",
    ],
  );
  for (const candidate of candidates) {
    const exact = files[candidate.path as keyof typeof files];
    assert.equal(candidate.content, exact);
    assert.equal(candidate.preimageHash, expectedHash(exact));
    assert.equal(Object.isFrozen(candidate), true);
  }
  assert.equal(Object.isFrozen(candidates), true);
});

test("deduplicates paths and enforces deterministic file and total-byte budgets", async (t) => {
  const root = await repository(t);
  const largeA = "a".repeat(60 * 1024);
  const skippedB = "b".repeat(40 * 1024);
  const fittingC = "c".repeat(30 * 1024);
  await write(root, "src/app/a.ts", largeA);
  await write(root, "src/app/b.ts", skippedB);
  await write(root, "src/app/c.ts", fittingC);
  await write(root, "src/app/d.ts", "d");

  const candidates = await collectSourceCandidates({
    repositoryRoot: root,
    manifest: manifest({
      "surface.one": ["src/app/a.ts", "src/app/b.ts", "src/app/c.ts", "src/app/d.ts"],
      "surface.two": ["src\\app\\a.ts"],
    }),
    brief: { affectedProductNodeIds: ["surface.one", "surface.two", "surface.one"] },
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.path),
    ["src/app/a.ts", "src/app/c.ts", "src/app/d.ts"],
  );
  assert.ok(candidates.length <= SOURCE_CANDIDATE_LIMITS.maxFiles);
  assert.ok(
    candidates.reduce(
      (total, candidate) => total + Buffer.byteLength(candidate.content, "utf8"),
      0,
    ) <= SOURCE_CANDIDATE_LIMITS.maxTotalBytes,
  );
});

test("fails closed for unknown nodes, missing files, unsafe paths, and oversized files", async (t) => {
  const root = await repository(t);
  await write(
    root,
    "src/app/huge.tsx",
    "x".repeat(SOURCE_CANDIDATE_LIMITS.maxFileBytes + 1),
  );

  await assert.rejects(
    collectSourceCandidates({
      repositoryRoot: root,
      manifest: manifest({ "surface.known": ["src/app/huge.tsx"] }),
      brief: { affectedProductNodeIds: ["surface.missing"] },
    }),
    hasCode("AFFECTED_NODE_MISSING"),
  );
  await assert.rejects(
    collectSourceCandidates({
      repositoryRoot: root,
      manifest: manifest({ "surface.known": ["src/app/missing.tsx"] }),
      brief: { affectedProductNodeIds: ["surface.known"] },
    }),
    hasCode("SOURCE_MISSING"),
  );
  await assert.rejects(
    collectSourceCandidates({
      repositoryRoot: root,
      manifest: manifest({ "surface.known": ["src/app/huge.tsx"] }),
      brief: { affectedProductNodeIds: ["surface.known"] },
    }),
    hasCode("FILE_TOO_LARGE"),
  );
  await assert.rejects(
    collectSourceCandidates({
      repositoryRoot: root,
      manifest: manifest({ "surface.known": ["../outside.tsx"] }),
      brief: { affectedProductNodeIds: ["surface.known"] },
    }),
  );
  await assert.rejects(
    collectSourceCandidates({
      repositoryRoot: root,
      manifest: manifest({ "surface.known": ["src/app/api/route.ts"] }),
      brief: { affectedProductNodeIds: ["surface.known"] },
    }),
    hasCode("NO_ELIGIBLE_SOURCE"),
  );
});

test("rejects binary control bytes and malformed UTF-8", async (t) => {
  const root = await repository(t);
  await write(root, "src/app/binary.ts", Uint8Array.from([0x61, 0x01, 0x62]));
  await write(root, "src/app/invalid.ts", Uint8Array.from([0xc3, 0x28]));

  await assert.rejects(
    collectSourceCandidates({
      repositoryRoot: root,
      manifest: manifest({ "surface.binary": ["src/app/binary.ts"] }),
      brief: { affectedProductNodeIds: ["surface.binary"] },
    }),
    hasCode("BINARY_CONTENT"),
  );
  await assert.rejects(
    collectSourceCandidates({
      repositoryRoot: root,
      manifest: manifest({ "surface.invalid": ["src/app/invalid.ts"] }),
      brief: { affectedProductNodeIds: ["surface.invalid"] },
    }),
    hasCode("INVALID_UTF8"),
  );
});

test("binds reads to the validated handle when the pathname is swapped", async (t) => {
  const root = await repository(t);
  const relative = "src/app/raced.tsx";
  const target = path.join(root, ...relative.split("/"));
  const displaced = path.join(root, "original-raced.tsx");
  const trusted = "export default function Trusted() { return null; }\n";
  const attacker = "const stolen = 'outside secret';\n";
  await write(root, relative, trusted);

  const probe = await open(target, "r");
  const handlePrototype = Object.getPrototypeOf(probe) as {
    read: typeof probe.read;
    stat: typeof probe.stat;
  };
  await probe.close();
  const originalRead = handlePrototype.read;
  const originalStat = handlePrototype.stat;
  let swapped = false;
  let restored = false;
  let observed = "";
  let handleStatCalls = 0;
  let furthestRequestedByte = 0;

  t.mock.method(handlePrototype, "stat", function (...args: unknown[]) {
    handleStatCalls += 1;
    return Reflect.apply(originalStat, this, args);
  });
  t.mock.method(
    handlePrototype,
    "read",
    async function (
      buffer: Buffer,
      offset: number,
      length: number,
      position: number,
    ) {
      assert.equal(buffer.length, SOURCE_CANDIDATE_LIMITS.maxFileBytes + 1);
      furthestRequestedByte = Math.max(
        furthestRequestedByte,
        offset + length,
      );
      if (!swapped) {
        swapped = true;
        await rename(target, displaced);
        await writeFile(target, attacker);
        try {
          const result = await Reflect.apply(originalRead, this, [
            buffer,
            offset,
            length,
            position,
          ]);
          if (result.bytesRead > 0) {
            observed = buffer
              .subarray(offset, offset + result.bytesRead)
              .toString("utf8");
          }
          return result;
        } finally {
          await rm(target, { force: true });
          await rename(displaced, target);
          restored = true;
        }
      }
      return Reflect.apply(originalRead, this, [
        buffer,
        offset,
        length,
        position,
      ]);
    },
  );

  await assert.rejects(
    collectSourceCandidates({
      repositoryRoot: root,
      manifest: manifest({ "surface.raced": [relative] }),
      brief: { affectedProductNodeIds: ["surface.raced"] },
    }),
    hasCode("SOURCE_CHANGED"),
  );

  assert.equal(swapped, true);
  assert.equal(restored, true);
  assert.equal(observed, trusted);
  assert.notEqual(observed, attacker);
  assert.equal(handleStatCalls, 2);
  assert.equal(
    furthestRequestedByte,
    SOURCE_CANDIDATE_LIMITS.maxFileBytes + 1,
  );
});

test("caps descriptor reads when an opened source grows concurrently", async (t) => {
  const root = await repository(t);
  const relative = "src/app/growing.ts";
  const target = path.join(root, ...relative.split("/"));
  await write(root, relative, "export const value = 1;\n");

  const probe = await open(target, "r");
  const handlePrototype = Object.getPrototypeOf(probe) as {
    read: typeof probe.read;
  };
  await probe.close();
  const originalRead = handlePrototype.read;
  let grew = false;
  const requestedRanges: Array<Readonly<{ offset: number; length: number }>> = [];

  t.mock.method(
    handlePrototype,
    "read",
    async function (
      buffer: Buffer,
      offset: number,
      length: number,
      position: number,
    ) {
      requestedRanges.push({ offset, length });
      assert.equal(buffer.length, SOURCE_CANDIDATE_LIMITS.maxFileBytes + 1);
      if (!grew) {
        grew = true;
        await appendFile(
          target,
          "x".repeat(SOURCE_CANDIDATE_LIMITS.maxFileBytes * 4),
        );
      }
      return Reflect.apply(originalRead, this, [
        buffer,
        offset,
        length,
        position,
      ]);
    },
  );

  await assert.rejects(
    collectSourceCandidates({
      repositoryRoot: root,
      manifest: manifest({ "surface.growing": [relative] }),
      brief: { affectedProductNodeIds: ["surface.growing"] },
    }),
    hasCode("SOURCE_CHANGED"),
  );

  assert.equal(grew, true);
  assert.ok(requestedRanges.length >= 1);
  assert.ok(
    requestedRanges.every(
      ({ offset, length }) =>
        offset + length <= SOURCE_CANDIDATE_LIMITS.maxFileBytes + 1,
    ),
  );
});

test("rejects source files reached through symbolic links", async (t) => {
  const root = await repository(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), "living-source-outside-"));
  t.after(async () => rm(outside, { recursive: true, force: true }));
  await write(outside, "page.tsx", "export default function Outside() { return null; }\n");
  await mkdir(path.join(root, "src", "app"), { recursive: true });
  try {
    await symlink(
      outside,
      path.join(root, "src", "app", "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES") {
      t.skip("The host does not permit creation of test symlinks");
      return;
    }
    throw error;
  }

  await assert.rejects(
    collectSourceCandidates({
      repositoryRoot: root,
      manifest: manifest({ "surface.linked": ["src/app/linked/page.tsx"] }),
      brief: { affectedProductNodeIds: ["surface.linked"] },
    }),
    hasCode("SYMLINK_REJECTED"),
  );
});
