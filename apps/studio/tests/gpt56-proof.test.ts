import assert from "node:assert/strict";
import test from "node:test";

import {
  getCommittedGpt56Run,
  recordedRunLinkageNote,
  relateGpt56RunToDataset,
} from "../src/lib/gpt56-proof";
import { fixtureStudioDataset } from "../src/lib/studio-snapshot";
import type {
  StudioDataset,
  StudioEvidenceIdentity,
} from "../src/lib/studio-types";

function datasetWithIdentity(
  identity: StudioEvidenceIdentity,
  appId = identity.appId,
): StudioDataset {
  const fixture = fixtureStudioDataset();
  return {
    ...fixture,
    app: { ...fixture.app, id: appId },
    evidenceIdentity: { ...identity },
  };
}

test("projects the committed Codex proof without raw evidence identifiers", async () => {
  const run = await getCommittedGpt56Run();

  assert.equal(run.request.boundaryRequestedModel, "gpt-5.6");
  assert.equal(run.request.transportRequestedModel, "gpt-5.6-terra");
  assert.equal(run.provenance.provider, "openai");
  assert.equal(run.provenance.transport, "codex-cli");
  assert.equal(run.provenance.actualResponseModel, null);
  assert.equal(run.evidence.dataOrigin, "synthetic");
  assert.deepEqual(run.localValidation, {
    schema: "passed",
    references: "passed",
    governance: "passed",
  });
  assert.equal(run.draft.evidenceScope.productionGeneralizationAllowed, false);
  assert.equal(run.draft.governance.humanApprovalRequired, true);
  assert.equal(run.draft.governance.activationAllowed, false);
  assert.ok(run.draft.evidenceCitations.sampleEventCount > 0);
  assert.equal(
    Object.hasOwn(run.draft.evidenceCitations, "sampleEventIds"),
    false,
  );
  assert.equal(Object.hasOwn(run.provenance, "evidenceAliases"), false);
});

test("returns fresh projection arrays instead of aliases to committed JSON", async () => {
  const first = await getCommittedGpt56Run();
  const second = await getCommittedGpt56Run();

  assert.notEqual(first, second);
  assert.notEqual(first.draft.risks, second.draft.risks);
  assert.notEqual(
    first.draft.proposedChange.affectedProductNodeIds,
    second.draft.proposedChange.affectedProductNodeIds,
  );
  assert.notEqual(
    first.draft.evidenceCitations.metrics,
    second.draft.evidenceCitations.metrics,
  );
  assert.deepEqual(first, second);
});

test("relates a run only when app, manifest, opportunity, and event set all match", async () => {
  const run = await getCommittedGpt56Run();
  const dataset = datasetWithIdentity({
    appId: run.evidence.appId,
    snapshotHash: null,
    manifestHash: run.evidence.manifestHash,
    opportunityId: run.evidence.opportunityId,
    eventSetHash: run.evidence.eventSetHash,
  });

  assert.deepEqual(relateGpt56RunToDataset(run, dataset), {
    kind: "exact",
    mismatches: [],
  });
});

test("keeps the committed neutral run separate from the Studio fixture", async () => {
  const relation = relateGpt56RunToDataset(
    await getCommittedGpt56Run(),
    fixtureStudioDataset(),
  );

  assert.deepEqual(relation, {
    kind: "separate",
    mismatches: ["appId", "manifestHash", "opportunityId", "eventSetHash"],
  });
});

test("treats every missing or mismatched identity component as separate", async () => {
  const run = await getCommittedGpt56Run();
  const exact: StudioEvidenceIdentity = {
    appId: run.evidence.appId,
    snapshotHash: null,
    manifestHash: run.evidence.manifestHash,
    opportunityId: run.evidence.opportunityId,
    eventSetHash: run.evidence.eventSetHash,
  };
  const cases: Array<{
    name: string;
    dataset: StudioDataset;
    mismatch: "appId" | "manifestHash" | "opportunityId" | "eventSetHash";
  }> = [
    {
      name: "route app identity conflicts with evidence identity",
      dataset: datasetWithIdentity(exact, "spoofed-route-app"),
      mismatch: "appId",
    },
    {
      name: "evidence app differs",
      dataset: datasetWithIdentity({ ...exact, appId: "spoofed-evidence-app" }),
      mismatch: "appId",
    },
    {
      name: "manifest is absent",
      dataset: datasetWithIdentity({ ...exact, manifestHash: null }),
      mismatch: "manifestHash",
    },
    {
      name: "manifest differs",
      dataset: datasetWithIdentity({
        ...exact,
        manifestHash: `sha256:${"f".repeat(64)}`,
      }),
      mismatch: "manifestHash",
    },
    {
      name: "opportunity is absent",
      dataset: datasetWithIdentity({ ...exact, opportunityId: null }),
      mismatch: "opportunityId",
    },
    {
      name: "opportunity differs",
      dataset: datasetWithIdentity({
        ...exact,
        opportunityId: "opportunity.unrelated",
      }),
      mismatch: "opportunityId",
    },
    {
      name: "event set is absent",
      dataset: datasetWithIdentity({ ...exact, eventSetHash: null }),
      mismatch: "eventSetHash",
    },
    {
      name: "event set differs",
      dataset: datasetWithIdentity({
        ...exact,
        eventSetHash: `sha256:${"e".repeat(64)}`,
      }),
      mismatch: "eventSetHash",
    },
  ];

  for (const candidate of cases) {
    const relation = relateGpt56RunToDataset(run, candidate.dataset);
    assert.equal(relation.kind, "separate", candidate.name);
    assert.ok(
      relation.mismatches.includes(candidate.mismatch),
      candidate.name,
    );
  }
});

test("relation-aware page copy never grants lifecycle authority", async () => {
  const run = await getCommittedGpt56Run();
  const exact = relateGpt56RunToDataset(
    run,
    datasetWithIdentity({
      appId: run.evidence.appId,
      snapshotHash: null,
      manifestHash: run.evidence.manifestHash,
      opportunityId: run.evidence.opportunityId,
      eventSetHash: run.evidence.eventSetHash,
    }),
  );
  const separate = relateGpt56RunToDataset(run, fixtureStudioDataset());

  assert.match(recordedRunLinkageNote(exact), /matches this snapshot/);
  assert.match(recordedRunLinkageNote(separate), /independent from this snapshot/);
  for (const relation of [exact, separate]) {
    const note = recordedRunLinkageNote(relation);
    assert.match(note, /does not populate lifecycle state/);
    assert.match(note, /does not|display-only/);
    assert.doesNotMatch(note, /activation allowed/i);
  }
});
