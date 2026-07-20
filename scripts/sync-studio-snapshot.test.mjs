import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSyntheticSnapshot,
  parseRoot,
} from "./sync-studio-snapshot.mjs";

test("Studio sync accepts exactly one explicit host root", () => {
  assert.equal(parseRoot(["--root", "C:\\synthetic-host"]), "C:\\synthetic-host");
  assert.throws(() => parseRoot([]), /Usage:/u);
  assert.throws(() => parseRoot(["--root", "host", "extra"]), /Usage:/u);
  assert.throws(() => parseRoot(["--output", "snapshot.json"]), /Usage:/u);
});

test("Studio sync refuses observed and mixed evidence", () => {
  assert.throws(
    () => assertSyntheticSnapshot({ application: { dataOrigin: "observed" } }),
    /only explicitly synthetic captures/u,
  );
  assert.throws(
    () => assertSyntheticSnapshot({ application: { dataOrigin: "mixed" } }),
    /only explicitly synthetic captures/u,
  );
  const synthetic = { application: { dataOrigin: "synthetic" } };
  assert.equal(assertSyntheticSnapshot(synthetic), synthetic);
});
