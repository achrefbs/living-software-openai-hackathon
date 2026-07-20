import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MapExplorer } from "../src/components/map-explorer";
import { buildWorkflowJourney } from "../src/components/workflow-explorer";
import type { ProductNode } from "../src/lib/studio-types";

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
