import assert from "node:assert/strict";
import test from "node:test";

import { journeyStages, nextAction } from "../src/lib/journey";
import { evolutionPreviewStages } from "../src/lib/lifecycle-preview";
import { fixtureStudioDataset } from "../src/lib/studio-snapshot";

test("locks interpretation when no deterministic opportunity exists", () => {
  const stages = evolutionPreviewStages(false);

  assert.equal(stages[0]?.state, "missing");
  assert.equal(stages[0]?.status, "No threshold crossed");
  assert.equal(stages[1]?.state, "locked");
  assert.match(stages[1]?.status ?? "", /needs detected evidence/i);
});

test("exposes interpretation as the next missing stage when evidence exists", () => {
  const stages = evolutionPreviewStages(true);

  assert.equal(stages[0]?.state, "available");
  assert.equal(stages[1]?.state, "missing");
});

test("journey copy does not claim a model prerequisite without a proposal", () => {
  const fixture = fixtureStudioDataset();
  const dataset = {
    ...fixture,
    opportunities: [],
    evolution: null,
    receipts: null,
  };

  const review = journeyStages(dataset)[3];
  assert.equal(review?.summary, "No proposal exists");
  assert.match(review?.lockReason ?? "", /deterministic opportunity/i);
  assert.equal(nextAction(dataset).stageId, "workflows");
});

test("journey map summary counts only explorable product nodes", () => {
  const fixture = fixtureStudioDataset();
  const dataset = {
    ...fixture,
    productMap: {
      ...fixture.productMap,
      nodes: fixture.productMap.nodes.slice(0, 2),
      totalNodes: 3,
      omittedNodes: 1,
    },
  };

  assert.equal(
    journeyStages(dataset)[0]?.summary,
    "2 explorable capabilities",
  );
});

test("a connected captured opportunity makes Review current without claiming approval", () => {
  const fixture = fixtureStudioDataset();
  const dataset = {
    ...fixture,
    app: {
      ...fixture.app,
      connection: "captured_snapshot" as const,
    },
    evolution: null,
    receipts: null,
  };

  const stages = journeyStages(dataset);
  assert.equal(stages[2]?.status, "complete");
  assert.equal(stages[3]?.status, "current");
  assert.equal(stages[3]?.summary, "Connected review available");
  assert.equal(stages[4]?.status, "locked");
  assert.equal(stages[4]?.summary, "Live receipts appear in Review");
  assert.equal(nextAction(dataset).stageId, "evolutions");
});
