import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildGpt56ProofRecord,
  parseGpt56DemoOptions,
  postflightGpt56Proof,
  preflightGpt56Proof,
  runGpt56Demo,
  writeGpt56Proof,
} from "./run-gpt56-demo.mjs";

test("defaults the executable demo to the authenticated Codex CLI", () => {
  assert.deepEqual(parseGpt56DemoOptions([], {}), {
    provider: "codex",
    out: null,
    help: false,
  });
});

test("accepts one explicit proof output path", () => {
  assert.deepEqual(
    parseGpt56DemoOptions([
      "--provider=codex",
      "--out",
      "docs/proof/gpt56-live-codex-cli.json",
    ], {}),
    {
      provider: "codex",
      out: "docs/proof/gpt56-live-codex-cli.json",
      help: false,
    },
  );
  assert.throws(
    () => parseGpt56DemoOptions([
      "--out=docs/proof/a.json",
      "--out=docs/proof/b.json",
    ], {}),
    /only be supplied once/,
  );
});

test("toggles explicitly between Codex CLI and the Responses API", () => {
  assert.equal(
    parseGpt56DemoOptions(["--provider", "api"], {}).provider,
    "api",
  );
  assert.equal(
    parseGpt56DemoOptions(["--provider=codex"], {
      LIVING_GPT56_PROVIDER: "api",
    }).provider,
    "codex",
  );
  assert.equal(
    parseGpt56DemoOptions([], {
      LIVING_GPT56_PROVIDER: "api",
    }).provider,
    "api",
  );
});

test("rejects ambiguous or unknown provider options", () => {
  assert.throws(
    () => parseGpt56DemoOptions(["--provider", "codex", "--provider", "api"], {}),
    /only be supplied once/,
  );
  assert.throws(
    () => parseGpt56DemoOptions(["--provider", "other"], {}),
    /codex or api/,
  );
  assert.throws(
    () => parseGpt56DemoOptions(["--fallback"], {}),
    /Unknown option/,
  );
});

test("passes the detector's exact evidence bundle to the intelligence boundary", async () => {
  let received;
  const result = await runGpt56Demo({
    async draftEvolutionBrief(input) {
      received = input;
      return {
        draft: { schemaVersion: "living.evolution-brief/v1" },
        provenance: {
          provider: "openai",
          transport: "responses-api",
          requestedModel: "gpt-5.6",
          actualResponseModel: "gpt-5.6-test",
          responseId: "offline-test",
          codexThreadId: null,
          responseStoreRequested: false,
          localSessionPersisted: null,
          tokenUsage: null,
          evidenceAliases: [],
        },
      };
    },
  });

  assert.equal(received.manifest.appId, "sample.operations-console");
  assert.equal(received.opportunity.evidence.dataOrigin, "synthetic");
  assert.equal(received.evidenceEvents.length, 24);
  assert.equal(new Set(received.evidenceEvents.map((event) => event.sessionId)).size, 3);
  assert.equal(result.provenance.responseId, "offline-test");
});

test("proof recorder binds one clean source/request snapshot and writes create-only", async () => {
  const root = await mkdtemp(join(tmpdir(), "living-proof-test-"));
  const proofDirectory = join(root, "docs", "proof");
  await mkdir(proofDirectory, { recursive: true });
  await writeFile(join(proofDirectory, "README.md"), "proof root\n", "utf8");
  await writeFile(join(proofDirectory, "existing.json"), "{}\n", "utf8");
  let source = {
    commit: "a".repeat(40),
    dirty: false,
  };
  const dependencies = {
    getGitSource: async () => source,
  };
  try {
    await assert.rejects(
      () => preflightGpt56Proof(
        "docs/proof/existing.json",
        root,
        dependencies,
      ),
      /overwrite an existing/,
    );
    await assert.rejects(
      () => preflightGpt56Proof("../escape.json", root, dependencies),
      /under docs\/proof/,
    );

    const prepared = await preflightGpt56Proof(
      "docs/proof/live-codex.json",
      root,
      dependencies,
    );
    const result = {
      draft: { schemaVersion: "living.evolution-brief/v1" },
      provenance: {
        provider: "openai",
        transport: "codex-cli",
        requestedModel: "gpt-5.6",
        actualResponseModel: null,
        responseId: null,
        codexThreadId: "thread-proof",
        responseStoreRequested: null,
        localSessionPersisted: false,
        tokenUsage: {
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 20,
          reasoningOutputTokens: 5,
        },
        evidenceAliases: [],
      },
    };
    const record = buildGpt56ProofRecord("codex", result, prepared, {
      now: () => new Date("2026-07-20T12:00:00.000Z"),
    });
    assert.equal(record.source.commit, prepared.source.commit);
    assert.equal(record.source.dirty, false);
    assert.match(record.request.boundaryRequestSha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(record.evidence.eventSetHash, prepared.input.opportunity.evidence.eventSetHash);
    assert.throws(
      () => buildGpt56ProofRecord("api", result, prepared),
      /does not match the selected provider/,
    );

    await postflightGpt56Proof(prepared, dependencies);
    const saved = await writeGpt56Proof(
      "docs/proof/live-codex.json",
      record,
      root,
    );
    assert.equal(
      JSON.parse(await readFile(saved, "utf8")).source.commit,
      prepared.source.commit,
    );
    await assert.rejects(
      () => writeGpt56Proof("docs/proof/live-codex.json", record, root),
      (error) => error?.code === "EEXIST",
    );

    await rm(saved);
    const driftPrepared = await preflightGpt56Proof(
      "docs/proof/drift.json",
      root,
      dependencies,
    );
    source = {
      commit: "b".repeat(40),
      dirty: false,
    };
    await assert.rejects(
      () => postflightGpt56Proof(driftPrepared, dependencies),
      /source or output changed during the run/,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
