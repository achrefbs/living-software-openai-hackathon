import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeTrackedPath,
  parsePreviewArgs,
  renderPreviewIdentityRoute,
  sha256,
} from "./create-crm-preview.mjs";

test("preview arguments require explicit source and new output paths", () => {
  assert.deepEqual(
    parsePreviewArgs([
      "--root",
      "../crm",
      "--out",
      "../preview",
      "--evolution",
      "evolution.source.0123456789abcdef01234567",
    ]),
    {
      help: false,
      root: "../crm",
      out: "../preview",
      evolutionId: "evolution.source.0123456789abcdef01234567",
    },
  );
  assert.throws(
    () => parsePreviewArgs(["--root", "../crm"]),
    /requires --root and --out/u,
  );
  assert.throws(
    () => parsePreviewArgs(["--root", "../crm", "--force", "yes"]),
    /Invalid preview argument/u,
  );
});

test("preview copy rejects paths that could escape its output", () => {
  assert.equal(assertSafeTrackedPath("src/app/page.tsx"), "src/app/page.tsx");
  assert.throws(() => assertSafeTrackedPath("../secret"), /Unsafe tracked path/u);
  assert.throws(() => assertSafeTrackedPath("src//secret"), /Unsafe tracked path/u);
  assert.throws(() => assertSafeTrackedPath("C:\\secret"), /Unsafe tracked path/u);
});

test("generated identity endpoint computes and gates the target bytes", () => {
  const route = renderPreviewIdentityRoute({
    evolutionId: "evolution.source.0123456789abcdef01234567",
    postHash: `sha256:${"a".repeat(64)}`,
    targetPath: "src/app/leads/[id]/page.tsx",
  });
  assert.match(route, /createHash\("sha256"\)\.update\(source\)/u);
  assert.match(route, /postHash !== EXPECTED_POST_HASH/u);
  assert.match(route, /status: 409/u);
  assert.match(route, /living\.preview-identity\/v1/u);
  assert.doesNotMatch(route, /C:\\/u);
  assert.equal(
    sha256(Buffer.from("living", "utf8")),
    "sha256:a93fcdf7dbae1c2f165aae3ee372a6cedc28effc66ebdbc08ae6eaa951ef53f6",
  );
});
