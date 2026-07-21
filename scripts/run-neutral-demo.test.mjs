import assert from "node:assert/strict";
import test from "node:test";

import { buildNeutralDemo } from "./run-neutral-demo.mjs";

test("maps and replays the neutral host through public contracts", async () => {
  const result = await buildNeutralDemo();

  assert.equal(result.manifest.appId, "sample.operations-console");
  assert.equal(result.report.integrationPlan.mode, "dry-run");
  assert.equal(result.report.integrationPlan.changes.length > 0, true);
  assert.equal(result.events.length, 31);
  assert.equal(result.evidenceEvents.length, 27);
  assert.equal(new Set(result.evidenceEvents.map((event) => event.sessionId)).size, 3);
  assert.equal(result.report.replay.cases, 4);
  assert.equal(result.report.replay.variants.length, 2);
  assert.equal(result.opportunity.signal.kind, "backtracking");
  assert.equal(
    result.opportunity.confidence.reasonCodes.includes("friction-corroborated"),
    true,
  );
  assert.equal(result.opportunity.evidence.subjectCount, 3);
  assert.equal(result.opportunity.evidence.dataOrigin, "synthetic");
});
