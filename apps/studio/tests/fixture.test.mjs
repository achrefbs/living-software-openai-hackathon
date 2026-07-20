import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(root, "src", "data", "studio-fixture.json");
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

test("fixture is explicitly synthetic and offline", () => {
  assert.match(fixture.fixtureNotice, /synthetic/i);
  assert.equal(fixture.app.connection, "offline_fixture");
  assert.equal(fixture.app.environment, "fixture");
});

test("fixture stays neutral and contains no reference-host vocabulary", () => {
  const serialized = JSON.stringify(fixture);
  const forbidden = [/\bcrm\b/i, /\bleads?\b/i, /\bdeals?\b/i];
  for (const term of forbidden) {
    assert.doesNotMatch(serialized, term);
  }
});

test("every product edge references a known node", () => {
  const ids = new Set(fixture.productMap.nodes.map((node) => node.id));
  for (const edge of fixture.productMap.edges) {
    assert.ok(ids.has(edge.from), "Unknown edge source: " + edge.from);
    assert.ok(ids.has(edge.to), "Unknown edge target: " + edge.to);
  }
});

test("every opportunity evidence reference resolves to a case", () => {
  const cases = new Set(
    fixture.workflows.evidenceCases.map((item) => item.id),
  );
  for (const opportunity of fixture.opportunities) {
    for (const reference of opportunity.evidenceRefs) {
      assert.ok(cases.has(reference), "Unknown evidence reference: " + reference);
    }
  }
});

test("receipt reference order is internally consistent", () => {
  fixture.receipts.forEach((receipt, index) => {
    const expected = index === 0 ? null : fixture.receipts[index - 1].id;
    assert.equal(receipt.previousReceipt, expected);
    assert.equal(receipt.integrity, "unverified_fixture");
  });
});

test("all five Studio surfaces have route files", async () => {
  const surfaces = [
    "map",
    "workflows",
    "opportunities",
    "evolutions",
    "receipts",
  ];
  for (const surface of surfaces) {
    const route = join(
      root,
      "src",
      "app",
      "apps",
      "[appId]",
      surface,
      "page.tsx",
    );
    const source = await readFile(route, "utf8");
    assert.match(source, /PageHeader|SurfaceState/);
  }
});
