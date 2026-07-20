import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  InstallConflictError,
  applyCreateOnlyInstall,
  applySafeUninstall,
  planCreateOnlyInstall,
  planSafeUninstall,
} from "./installer.js";

const HASH = `sha256:${"a".repeat(64)}` as const;

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "living-installer-"));
}

function input(root: string) {
  return {
    root,
    appId: "sample.host",
    adapter: { id: "nextjs-app-router", version: "0.1.0" },
    manifestHash: HASH,
    installId: "install-test",
    clock: () => new Date("2026-07-19T18:00:00.000Z"),
    artifacts: [
      { path: ".living/config.json", content: "{}\n" },
      { path: ".living/.gitignore", content: "data/\n" },
      { path: "src/instrumentation-client.ts", content: "export {}\n" },
    ],
    preservedDataPaths: [".living/data", ".living/.gitignore"],
  } as const;
}

test("applies a create-only installation and is idempotent", async () => {
  const root = await tempRoot();
  const firstPlan = await planCreateOnlyInstall(input(root));
  assert.equal(firstPlan.status, "ready");
  assert.equal((await applyCreateOnlyInstall(firstPlan)).status, "installed");
  assert.equal(await readFile(path.join(root, "src/instrumentation-client.ts"), "utf8"), "export {}\n");

  const secondPlan = await planCreateOnlyInstall(input(root));
  assert.equal(secondPlan.status, "unchanged");
  assert.equal((await applyCreateOnlyInstall(secondPlan)).status, "unchanged");
});

test("refuses to overwrite a host file", async () => {
  const root = await tempRoot();
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/instrumentation-client.ts"), "host code\n");
  const plan = await planCreateOnlyInstall(input(root));
  assert.equal(plan.status, "conflict");
  await assert.rejects(() => applyCreateOnlyInstall(plan), InstallConflictError);
  assert.equal(await readFile(path.join(root, "src/instrumentation-client.ts"), "utf8"), "host code\n");
});

test("uninstall removes exact generated files and preserves evidence", async () => {
  const root = await tempRoot();
  await applyCreateOnlyInstall(await planCreateOnlyInstall(input(root)));
  await mkdir(path.join(root, ".living/data"), { recursive: true });
  await writeFile(path.join(root, ".living/data/events.ndjson"), "evidence\n");
  const plan = await planSafeUninstall(root);
  assert.equal(plan.status, "ready");
  assert.equal(
    plan.files.find((file) => file.path === ".living/.gitignore")?.state,
    "preserve",
  );
  const result = await applySafeUninstall(plan);
  assert.deepEqual(result.preservedDataPaths, [".living/.gitignore", ".living/data"]);
  assert.equal(await readFile(path.join(root, ".living/data/events.ndjson"), "utf8"), "evidence\n");
  assert.equal(await readFile(path.join(root, ".living/.gitignore"), "utf8"), "data/\n");
  await assert.rejects(readFile(path.join(root, ".living/config.json"), "utf8"), /ENOENT/);
  await assert.rejects(readFile(path.join(root, "src/instrumentation-client.ts"), "utf8"), /ENOENT/);
});

test("reinstall reuses an exact preserved ignore artifact without an install record", async () => {
  const root = await tempRoot();
  await applyCreateOnlyInstall(await planCreateOnlyInstall(input(root)));
  await mkdir(path.join(root, ".living/data"), { recursive: true });
  await writeFile(path.join(root, ".living/data/events.ndjson"), "evidence\n");
  await applySafeUninstall(await planSafeUninstall(root));

  const reinstall = await planCreateOnlyInstall(input(root));
  assert.equal(reinstall.status, "ready");
  assert.equal(
    reinstall.artifacts.find((artifact) => artifact.path === ".living/.gitignore")?.state,
    "unchanged",
  );
  assert.equal((await applyCreateOnlyInstall(reinstall)).status, "installed");
  assert.equal(await readFile(path.join(root, ".living/data/events.ndjson"), "utf8"), "evidence\n");
});

test("modified preserved ignore conflicts on reinstall", async () => {
  const root = await tempRoot();
  await applyCreateOnlyInstall(await planCreateOnlyInstall(input(root)));
  await writeFile(path.join(root, ".living/.gitignore"), "data/\ncustom/\n");
  const uninstall = await planSafeUninstall(root);
  assert.equal(uninstall.status, "ready");
  await applySafeUninstall(uninstall);

  const reinstall = await planCreateOnlyInstall(input(root));
  assert.equal(reinstall.status, "conflict");
  assert.equal(
    reinstall.artifacts.find((artifact) => artifact.path === ".living/.gitignore")?.state,
    "conflict",
  );
});

test("preserved path matching requires a path-segment boundary", async () => {
  const root = await tempRoot();
  const boundaryInput = {
    ...input(root),
    artifacts: [
      ...input(root).artifacts,
      { path: ".living/data-other/generated.json", content: "{}\n" },
    ],
  } as const;
  await applyCreateOnlyInstall(await planCreateOnlyInstall(boundaryInput));
  const uninstall = await planSafeUninstall(root);
  assert.equal(
    uninstall.files.find((file) => file.path === ".living/data-other/generated.json")?.state,
    "remove",
  );
  await applySafeUninstall(uninstall);
  await assert.rejects(
    readFile(path.join(root, ".living/data-other/generated.json"), "utf8"),
    /ENOENT/,
  );
});

test("uninstall refuses all mutation if an installed file changed", async () => {
  const root = await tempRoot();
  await applyCreateOnlyInstall(await planCreateOnlyInstall(input(root)));
  await writeFile(path.join(root, "src/instrumentation-client.ts"), "developer edit\n");
  const plan = await planSafeUninstall(root);
  assert.equal(plan.status, "conflict");
  await assert.rejects(() => applySafeUninstall(plan), InstallConflictError);
  assert.equal(await readFile(path.join(root, ".living/config.json"), "utf8"), "{}\n");
});

test("rejects path traversal and symlink escape", async () => {
  const root = await tempRoot();
  await assert.rejects(
    () => planCreateOnlyInstall({ ...input(root), artifacts: [{ path: "../escape", content: "x" }] }),
    /Unsafe/,
  );

  const outside = await tempRoot();
  await symlink(outside, path.join(root, "linked"), "junction");
  await assert.rejects(
    () => planCreateOnlyInstall({ ...input(root), artifacts: [{ path: "linked/escape.ts", content: "x" }] }),
    /symlink outside/,
  );
});
