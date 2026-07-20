import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "./canonical.js";
import { executeCommand, parseArguments, usage } from "./main.js";
import { planCommand } from "./planners.js";

const LEGACY_FIXTURE = {
  schemaVersion: "living.next-host-fixture/v1",
  application: { id: "legacy-crm", displayName: "Legacy CRM" },
  framework: { name: "nextjs", version: "15.3.1", adapterVersion: "0.1.0" },
  release: { revision: "fixture:legacy" },
  generatedAt: "2026-07-19T00:00:00.000Z",
  nodes: [],
  edges: [],
  events: [],
} as const;

const ARTIFACT_HASH = `sha256:${"a".repeat(64)}`;
const PROOF_HASH = `sha256:${"b".repeat(64)}`;

test("parses mutually exclusive legacy fixture and automatic root modes", () => {
  assert.deepEqual(parseArguments(["map", "--fixture", "fixture.json"]), {
    mode: "fixture",
    command: "map",
    fixturePath: "fixture.json",
  });
  assert.deepEqual(parseArguments(["init", "--root", "repo", "--apply", "--synthetic"]), {
    mode: "root",
    command: "init",
    rootPath: "repo",
    apply: true,
    synthetic: true,
    syntheticSpecified: true,
  });
  assert.deepEqual(parseArguments(["analyze", "--root", "repo"]), {
    mode: "root",
    command: "analyze",
    rootPath: "repo",
    apply: false,
    synthetic: false,
    syntheticSpecified: false,
  });
  assert.deepEqual(parseArguments(["snapshot", "--root", "repo"]), {
    mode: "root",
    command: "snapshot",
    rootPath: "repo",
    apply: false,
    synthetic: false,
    syntheticSpecified: false,
  });
});

test("parses the terminal-first install, improve, status, and lifecycle commands", () => {
  assert.deepEqual(
    parseArguments([
      "install",
      "--root",
      "repo",
      "--synthetic",
      "--json",
    ]),
    {
      mode: "terminal",
      command: "install",
      rootPath: "repo",
      synthetic: true,
      json: true,
    },
  );
  assert.deepEqual(
    parseArguments([
      "improve",
      "--root",
      "repo",
      "--provider",
      "codex",
    ]),
    {
      mode: "terminal",
      command: "improve",
      rootPath: "repo",
      provider: "codex",
      json: false,
    },
  );
  assert.deepEqual(parseArguments(["status", "--root", "repo"]), {
    mode: "terminal",
    command: "status",
    rootPath: "repo",
    json: false,
  });
  assert.deepEqual(
    parseArguments([
      "approve",
      "--root",
      "repo",
      "--evolution",
      "evolution.source.123",
      "--actor",
      "operator.demo",
      "--artifact-hash",
      ARTIFACT_HASH,
      "--proof-hash",
      PROOF_HASH,
    ]),
    {
      mode: "terminal",
      command: "approve",
      rootPath: "repo",
      evolutionId: "evolution.source.123",
      actor: "operator.demo",
      expectedArtifactHash: ARTIFACT_HASH,
      expectedProofHash: PROOF_HASH,
      applyAfterApproval: false,
      json: false,
    },
  );
  assert.deepEqual(
    parseArguments([
      "approve",
      "--root",
      "repo",
      "--evolution",
      "evolution.source.123",
      "--actor",
      "operator.demo",
      "--artifact-hash",
      ARTIFACT_HASH,
      "--proof-hash",
      PROOF_HASH,
      "--apply",
    ]),
    {
      mode: "terminal",
      command: "approve",
      rootPath: "repo",
      evolutionId: "evolution.source.123",
      actor: "operator.demo",
      expectedArtifactHash: ARTIFACT_HASH,
      expectedProofHash: PROOF_HASH,
      applyAfterApproval: true,
      json: false,
    },
  );
  assert.deepEqual(
    parseArguments([
      "apply",
      "--root",
      "repo",
      "--evolution",
      "evolution.source.123",
    ]),
    {
      mode: "terminal",
      command: "apply",
      rootPath: "repo",
      evolutionId: "evolution.source.123",
      json: false,
    },
  );
  assert.deepEqual(
    parseArguments([
      "rollback",
      "--root",
      "repo",
      "--evolution",
      "evolution.source.123",
      "--actor",
      "operator.demo",
    ]),
    {
      mode: "terminal",
      command: "rollback",
      rootPath: "repo",
      evolutionId: "evolution.source.123",
      actor: "operator.demo",
      json: false,
    },
  );
});

test("rejects ambiguous, duplicated, unknown, or mutating-invalid flags", () => {
  assert.throws(
    () => parseArguments(["init", "--root", "repo", "--fixture", "fixture.json"]),
    /mutually exclusive/u,
  );
  assert.throws(
    () => parseArguments(["init", "--root", "repo", "--root", "other"]),
    /only be provided once/u,
  );
  assert.throws(
    () => parseArguments(["init", "--root", "repo", "--unknown"]),
    /Unknown option/u,
  );
  assert.throws(
    () => parseArguments(["doctor", "--root", "repo", "--apply"]),
    /read-only/u,
  );
  assert.throws(
    () => parseArguments(["init", "--root", "repo", "--apply", "--dry-run"]),
    /mutually exclusive/u,
  );
  assert.throws(
    () => parseArguments(["init", "--fixture", "fixture.json", "--apply"]),
    /unavailable for --fixture/u,
  );
  assert.throws(
    () => parseArguments(["map", "--root", "repo", "--synthetic"]),
    /unavailable for map/u,
  );
  assert.throws(
    () => parseArguments(["snapshot", "--fixture", "fixture.json"]),
    /only available with --root/u,
  );
  assert.throws(
    () => parseArguments(["snapshot", "--root", "repo", "--apply"]),
    /read-only/u,
  );
  assert.throws(
    () => parseArguments(["snapshot", "--root", "repo", "--synthetic"]),
    /unavailable for snapshot/u,
  );
});

test("rejects incomplete or ambiguous terminal-first command authority", () => {
  assert.throws(
    () => parseArguments(["install", "--root", "repo", "--apply"]),
    /Unknown option for install/u,
  );
  assert.throws(
    () => parseArguments(["improve", "--root", "repo"]),
    /requires --provider/u,
  );
  assert.throws(
    () =>
      parseArguments([
        "improve",
        "--root",
        "repo",
        "--provider",
        "claude",
      ]),
    /codex or --provider api/u,
  );
  assert.throws(
    () => parseArguments(["approve", "--root", "repo"]),
    /--evolution/u,
  );
  assert.throws(
    () =>
      parseArguments([
        "approve",
        "--root",
        "repo",
        "--evolution",
        "evolution.source.123",
      ]),
    /--actor/u,
  );
  assert.throws(
    () =>
      parseArguments([
        "approve",
        "--root",
        "repo",
        "--evolution",
        "evolution.source.123",
        "--actor",
        "operator.demo",
      ]),
    /--artifact-hash/u,
  );
  assert.throws(
    () =>
      parseArguments([
        "approve",
        "--root",
        "repo",
        "--evolution",
        "evolution.source.123",
        "--actor",
        "operator.demo",
        "--artifact-hash",
        ARTIFACT_HASH,
        "--proof-hash",
        "sha256:NOT-A-DIGEST",
      ]),
    /--proof-hash/u,
  );
  assert.throws(
    () =>
      parseArguments([
        "apply",
        "--root",
        "repo",
        "--evolution",
        "evolution.source.123",
        "--actor",
        "not-accepted",
      ]),
    /Unknown option for apply/u,
  );
  assert.throws(
    () =>
      parseArguments([
        "rollback",
        "--root",
        "repo",
        "--root",
        "other",
      ]),
    /only be provided once/u,
  );
});

test("usage exposes the exact hashes required for human approval", () => {
  assert.match(usage(), /--artifact-hash <sha256>/u);
  assert.match(usage(), /--proof-hash <sha256>/u);
});

test("legacy fixture mode retains byte-for-byte canonical planner output", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "living-cli-legacy-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const fixturePath = path.join(root, "fixture.json");
  await writeFile(fixturePath, JSON.stringify(LEGACY_FIXTURE), "utf8");

  const executed = await executeCommand(["init", "--fixture", fixturePath]);
  const direct = planCommand("init", LEGACY_FIXTURE);
  assert.equal(canonicalJson(executed, true), canonicalJson(direct, true));
});
