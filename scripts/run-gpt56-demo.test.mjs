import assert from "node:assert/strict";
import test from "node:test";

import { runGpt56Demo } from "./run-gpt56-demo.mjs";

test("passes the detector's exact evidence bundle to the intelligence boundary", async () => {
  let received;
  const result = await runGpt56Demo({
    async draftEvolutionBrief(input) {
      received = input;
      return {
        draft: { schemaVersion: "living.evolution-brief/v1" },
        provenance: {
          provider: "openai",
          requestedModel: "gpt-5.6",
          actualResponseModel: "gpt-5.6-test",
          responseId: "offline-test",
          stored: false,
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
