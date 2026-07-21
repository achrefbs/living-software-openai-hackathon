import assert from "node:assert/strict";
import test from "node:test";

import { parseLiveState, type LiveState } from "@living-software/contracts";

import { deriveLivePipeline } from "../src/lib/live-pipeline";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;

function sourceState(
  status: "applied" | "rolled-back",
  activeStage: LiveState["activeStage"] = "source-verification",
  stageState: LiveState["stageState"] = "completed",
): LiveState {
  return parseLiveState({
    schemaVersion: "living.live-state/v1",
    sessionId: "live-session.pipeline-test",
    generatedAt: "2026-07-21T12:00:00.000Z",
    connection: "connected",
    headSequence: 1,
    headHash: HASH_A,
    installation: "installed",
    activeStage,
    stageState,
    evidence: {
      acceptedBatchCount: 0,
      eventCount: 0,
      workflowCaseCount: 0,
      sessionCount: 0,
      chainHead: null,
    },
    detectorProgress: [],
    source: {
      evolutionId: "evolution.pipeline-test",
      status,
      targetPath: "src/app/page.tsx",
      preimageHash: HASH_A,
      postimageHash: HASH_B,
      currentHash: status === "applied" ? HASH_B : HASH_A,
    },
    runtime: { status: "not-available" },
    integrity: { status: "valid" },
  });
}

function stage(
  state: LiveState,
  target: LiveState["activeStage"],
) {
  const presentation = deriveLivePipeline(state);
  return [...presentation.main, ...presentation.branches].find(
    (item) => item.stage === target,
  );
}

test("applied source shows application and hash verification complete while rollback waits", () => {
  const state = sourceState("applied");

  assert.equal(stage(state, "application")?.state, "completed");
  assert.equal(stage(state, "source-verification")?.state, "completed");
  assert.equal(stage(state, "runtime-verification")?.state, "waiting");
  assert.equal(stage(state, "rollback")?.state, "waiting");
  assert.equal(stage(state, "rollback")?.branch, "recovery");
});

test("rolled-back source keeps rollback complete after final source verification", () => {
  const state = sourceState("rolled-back");

  assert.equal(stage(state, "application")?.state, "completed");
  assert.equal(stage(state, "source-verification")?.state, "completed");
  assert.equal(stage(state, "source-verification")?.current, true);
  assert.equal(stage(state, "rollback")?.state, "completed");
  assert.equal(stage(state, "rollback")?.current, false);
});

test("rollback in progress is a recovery branch and does not invent runtime verification", () => {
  const state = sourceState("applied", "rollback", "progress");

  assert.equal(stage(state, "application")?.state, "completed");
  assert.equal(stage(state, "source-verification")?.state, "completed");
  assert.equal(stage(state, "runtime-verification")?.state, "waiting");
  assert.equal(stage(state, "rollback")?.state, "progress");
  assert.equal(stage(state, "rollback")?.current, true);
});
