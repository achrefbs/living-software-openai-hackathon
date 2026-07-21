import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import "./register-test-hooks.mjs";

const {
  normalizedUnifiedDiff,
  readCurrentTargetHash,
} = await import("../src/lib/live-evolution-projection");

test("current target hashes only a canonical bounded non-symlink source path", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "living-source-hash-"));
  try {
    await mkdir(path.join(root, "src", "app"), { recursive: true });
    const source = Buffer.from("export default function Page() { return null; }\n", "utf8");
    await writeFile(path.join(root, "src", "app", "page.tsx"), source);
    assert.equal(
      await readCurrentTargetHash(root, "src/app/page.tsx"),
      `sha256:${createHash("sha256").update(source).digest("hex")}`,
    );
    await assert.rejects(
      readCurrentTargetHash(root, "src\\app\\page.tsx"),
      /canonical repository-relative path/u,
    );

    if (process.platform !== "win32") {
      await context.test("rejects a symlinked target", async () => {
        await symlink(
          path.join(root, "src", "app", "page.tsx"),
          path.join(root, "src", "app", "linked.tsx"),
        );
        await assert.rejects(
          readCurrentTargetHash(root, "src/app/linked.tsx"),
          /unsafe path/u,
        );
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("normalized diff is canonical and fails closed at source and path bounds", () => {
  const diff = normalizedUnifiedDiff(
    "alpha\r\nbeta\r\n",
    "alpha\r\ngamma\r\n",
    "src/app/page.tsx",
  );
  assert.ok(diff);
  assert.match(diff, /^--- a\/src\/app\/page\.tsx\n\+\+\+ b\/src\/app\/page\.tsx/mu);
  assert.match(diff, /^-beta$/mu);
  assert.match(diff, /^\+gamma$/mu);
  assert.equal(
    normalizedUnifiedDiff("same\n", "same\n", "src/app/page.tsx"),
    null,
  );
  assert.equal(
    normalizedUnifiedDiff("x".repeat(2_000_001), "changed", "src/app/page.tsx"),
    null,
  );
  assert.throws(
    () => normalizedUnifiedDiff("a", "b", "src/app/page.tsx\nforged"),
    /canonical repository-relative path/u,
  );
});
