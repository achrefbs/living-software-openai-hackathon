import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MapExplorer } from "../src/components/map-explorer";
import { RecordedGpt56Brief } from "../src/components/recorded-gpt56-brief";
import {
  buildWorkflowJourney,
  WorkflowExplorer,
} from "../src/components/workflow-explorer";
import {
  getCommittedGpt56Run,
  relateGpt56RunToDataset,
} from "../src/lib/gpt56-proof";
import { fixtureStudioDataset } from "../src/lib/studio-snapshot";
import type {
  OpportunitySignalKind,
  ProductNode,
  WorkflowVariant,
} from "../src/lib/studio-types";

const nodes: ProductNode[] = [
  {
    id: "surface.one",
    kind: "surface",
    label: "One",
    description: "First surface.",
    provenance: "scanned",
    confidence: 1,
    source: "src/one.tsx:1",
  },
  {
    id: "action.two",
    kind: "action",
    label: "Two",
    description: "Second capability.",
    provenance: "scanned",
    confidence: 1,
    source: "src/two.tsx:1",
  },
];

test("workflow revisit detection uses node identity, not display labels", () => {
  const journey = buildWorkflowJourney([
    { id: "surface.first", label: "Shared label" },
    { id: "surface.second", label: "Shared label" },
    { id: "surface.first", label: "Shared label" },
  ]);

  assert.equal(journey[0]?.revisitOf, undefined);
  assert.equal(journey[1]?.revisitOf, undefined);
  assert.equal(journey[2]?.revisitOf, 0);
});

test("workflow explorer names correction and failure signals without inventing backtracking", () => {
  const variant: WorkflowVariant = {
    id: "variant.signal",
    name: "Lead form journey",
    description: "One captured journey.",
    cases: 1,
    share: 1,
    durationSeconds: 12,
    durationLabel: "Average time",
    stepCount: 3,
    stepLabel: "Journey steps",
    outcomeRate: 0,
    tone: "friction",
    steps: [
      { id: "route.lead", label: "Lead" },
      { id: "action.save", label: "Save" },
      { id: "route.lead", label: "Lead" },
    ],
  };
  const expectations: Array<[OpportunitySignalKind, string]> = [
    ["failure-cluster", "Interaction failures"],
    ["rework-loop", "Correction pattern"],
  ];

  for (const [signalKind, label] of expectations) {
    const html = renderToStaticMarkup(
      createElement(WorkflowExplorer, {
        defaultVariantId: variant.id,
        evidenceCases: [],
        signalKind,
        variants: [variant],
      }),
    );

    assert.match(html, new RegExp(label));
    assert.match(html, /1 repeated journey step/);
    assert.doesNotMatch(html, /backtracking/i);
  }
});

test("product map reports manifest and explorable node counts separately", () => {
  const html = renderToStaticMarkup(
    createElement(MapExplorer, {
      edges: [
        { from: "surface.one", to: "action.two", relation: "renders" },
      ],
      nodes,
      omittedNodes: 1,
      totalEdges: 2,
      totalNodes: 3,
    }),
  );

  assert.match(html, /Showing all 2 explorable product capabilities/);
  assert.match(html, /3 manifest nodes total/);
  assert.match(html, /1 non-product test node excluded from the lanes/);
  assert.doesNotMatch(html, /Showing all 3 mapped capabilities/);
});

test("recorded GPT-5.6 proof stays visibly separate from unrelated Studio data", async () => {
  const dataset = fixtureStudioDataset();
  const run = await getCommittedGpt56Run();
  const relation = relateGpt56RunToDataset(run, dataset);
  const html = renderToStaticMarkup(
    createElement(RecordedGpt56Brief, {
      currentAppId: dataset.app.id,
      currentAppName: dataset.app.name,
      relation,
      run,
    }),
  );

  assert.equal(relation.kind, "separate");
  assert.deepEqual(relation.mismatches, [
    "appId",
    "manifestHash",
    "opportunityId",
    "eventSetHash",
  ]);
  assert.match(html, /GPT-5.6 Terra requested/);
  assert.match(html, /Separate neutral evidence run/);
  assert.match(html, /sample.operations-console/);
  assert.match(html, /sample-operations/);
  assert.match(html, /Activation blocked/);
  assert.match(html, /Not reported by Codex CLI/);
  assert.doesNotMatch(html, /event.case-friction/);
});

test("an exact proof relation remains a blocked draft with no lifecycle authority", async () => {
  const fixture = fixtureStudioDataset();
  const run = await getCommittedGpt56Run();
  const dataset = {
    ...fixture,
    app: { ...fixture.app, id: run.evidence.appId },
    evidenceIdentity: {
      appId: run.evidence.appId,
      snapshotHash: null,
      manifestHash: run.evidence.manifestHash,
      opportunityId: run.evidence.opportunityId,
      eventSetHash: run.evidence.eventSetHash,
    },
  };
  const relation = relateGpt56RunToDataset(run, dataset);
  const html = renderToStaticMarkup(
    createElement(RecordedGpt56Brief, {
      currentAppId: dataset.app.id,
      currentAppName: dataset.app.name,
      relation,
      run,
    }),
  );

  assert.deepEqual(relation, { kind: "exact", mismatches: [] });
  assert.match(html, /Evidence identity matches the active snapshot/);
  assert.match(html, /Activation blocked/);
  assert.match(html, /grants no lifecycle authority/);
  assert.doesNotMatch(html, /activation allowed/i);
});
