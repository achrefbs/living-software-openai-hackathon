import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeTrackedPath,
  assertStableTrackedSnapshot,
  parseTrackedFileOutput,
  parseHostPreviewArgs,
  renderPreviewIdentityRoute,
} from "./create-host-preview.mjs";

test("generic preview arguments keep immutable before output explicit", () => {
  assert.deepEqual(
    parseHostPreviewArgs([
      "--root",
      "C:/host",
      "--out",
      "C:/preview-after",
      "--before-out",
      "C:/preview-before",
      "--evolution",
      "evolution.source.v2.test",
    ]),
    {
      help: false,
      root: "C:/host",
      out: "C:/preview-after",
      beforeOut: "C:/preview-before",
      evolutionId: "evolution.source.v2.test",
    },
  );
  assert.throws(
    () => parseHostPreviewArgs(["--root", "C:/host", "--out"]),
    /display-only views/u,
  );
});

test("tracked preview paths are relative and traversal-free", () => {
  assert.equal(assertSafeTrackedPath("src/app/page.tsx"), "src/app/page.tsx");
  for (const unsafe of [
    "../page.tsx",
    "/src/page.tsx",
    "src//page.tsx",
    "src\\app\\page.tsx",
    "src/app\npage.tsx",
    "C:/host/page.tsx",
    `src/${"a".repeat(509)}`,
  ]) {
    assert.throws(() => assertSafeTrackedPath(unsafe), /Unsafe tracked path/u);
  }
});

test("tracked-file discovery is bounded to canonical NUL-terminated UTF-8 paths", () => {
  assert.deepEqual(
    parseTrackedFileOutput(Buffer.from("package.json\0src/app/page.tsx\0", "utf8")),
    ["package.json", "src/app/page.tsx"],
  );
  assert.deepEqual(parseTrackedFileOutput(Buffer.alloc(0)), []);
  for (const unsafe of [
    Buffer.from("src/app/page.tsx", "utf8"),
    Buffer.from("src/app/page.tsx\0\0", "utf8"),
    Buffer.from([0xff, 0x00]),
  ]) {
    assert.throws(() => parseTrackedFileOutput(unsafe), /tracked-file output/u);
  }
});

test("preview capture permits an existing stable tracked worktree change", () => {
  const revision = "a".repeat(40);
  const dirtyStatus = Buffer.from(" M src/app/page.tsx\0", "utf8");
  assert.doesNotThrow(() => assertStableTrackedSnapshot(
    revision,
    dirtyStatus,
    revision,
    Buffer.from(dirtyStatus),
  ));
  assert.throws(
    () => assertStableTrackedSnapshot(
      revision,
      dirtyStatus,
      revision,
      Buffer.from(" M src/app/work/page.tsx\0", "utf8"),
    ),
    /changed while preview was captured/u,
  );
});

test("identity route seals evolution, target, view, and exact source hash", () => {
  const route = renderPreviewIdentityRoute({
    evolutionId: "evolution.source.v2.test",
    expectedHash: `sha256:${"a".repeat(64)}`,
    targetPath: "src/app/page.tsx",
    view: "postimage",
  });
  assert.match(route, /living\.preview-identity\/v1/u);
  assert.match(route, /evolution\.source\.v2\.test/u);
  assert.match(route, /src\/app\/page\.tsx/u);
  assert.match(route, /postimage/u);
  assert.doesNotMatch(route, /customer|pipeline|crm/iu);
});
