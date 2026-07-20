import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  describeComparison,
  parsePreviewIdentity,
  previewIdentityMatches,
  PREVIEW_IDENTITY_SCHEMA,
  type ComparisonStatus,
} from "../src/lib/evolution-comparison";
import {
  assertLocalPreviewRequest,
  fetchPreviewIdentity,
  parseConfiguredPreviewUrl,
} from "../src/app/api/preview-identity/route";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const postHash = `sha256:${"a".repeat(64)}`;
const preHash = `sha256:${"b".repeat(64)}`;

function status(
  phase: ComparisonStatus["phase"],
): ComparisonStatus {
  return {
    connected: true,
    phase,
    evolutionId: phase === "ready" ? null : "evolution.source.demo",
    title: "Preserve list context",
    preHash,
    postHash,
    hostSourceHash: preHash,
    artifactHash: `sha256:${"c".repeat(64)}`,
    proofHash: `sha256:${"d".repeat(64)}`,
    proofPassed: phase !== "ready",
    approvalActor: phase === "approved" ? "entrant" : null,
  };
}

const identity = {
  schemaVersion: PREVIEW_IDENTITY_SCHEMA,
  evolutionId: "evolution.source.demo",
  postHash,
  targetPath: "src/app/leads/[id]/page.tsx",
} as const;

test("comparison route accepts only loopback displays and delegates verified rendering", async () => {
  const page = await readFile(
    path.join(sourceRoot, "app", "apps", "[appId]", "compare", "page.tsx"),
    "utf8",
  );
  const component = await readFile(
    path.join(sourceRoot, "components", "evolution-comparison-status.tsx"),
    "utf8",
  );

  assert.match(page, /safeLoopbackHttpUrl/u);
  assert.match(page, /expectedPort: "3000" \| "3002"/u);
  assert.match(page, /LIVING_STUDIO_HOST_URL/u);
  assert.match(page, /LIVING_STUDIO_PREVIEW_URL/u);
  assert.match(component, /previewIdentityMatches/u);
  assert.match(component, /showComparison &&/u);
  assert.match(component, /title="Current CRM"/u);
  assert.match(component, /title="Verified isolated proposed CRM preview"/u);
  assert.doesNotMatch(component, /allow-forms/u);
  assert.doesNotMatch(component, /method:\s*"POST"|Approve exact patch|Apply to CRM source/u);
});

test("comparison frames are restricted by response policy", async () => {
  const config = await readFile(
    fileURLToPath(new URL("../next.config.mjs", import.meta.url)),
    "utf8",
  );
  assert.match(config, /source: "\/apps\/:appId\/compare"/u);
  assert.match(config, /Content-Security-Policy/u);
  assert.match(config, /frame-src http:\/\/127\.0\.0\.1:3000 http:\/\/127\.0\.0\.1:3002/u);
  assert.match(config, /object-src 'none'/u);
});

test("preview broker rejects remote, cross-origin, unsafe-port, and IPv6 inputs", () => {
  assert.throws(
    () =>
      assertLocalPreviewRequest(
        new Request("https://studio.example/api/preview-identity"),
        "development",
      ),
    /only on loopback/u,
  );
  assert.throws(
    () =>
      assertLocalPreviewRequest(
        new Request("http://127.0.0.1:3001/api/preview-identity", {
          headers: { origin: "http://evil.example" },
        }),
        "development",
      ),
    /Cross-origin/u,
  );
  assert.throws(
    () => parseConfiguredPreviewUrl("http://127.0.0.1:3001/leads/lead-01"),
    /port 3002/u,
  );
  assert.throws(
    () => parseConfiguredPreviewUrl("http://[::1]:3002/leads/lead-01"),
    /loopback HTTP URL/u,
  );
});

test("preview broker strictly validates bounded endpoint responses", async () => {
  const previewUrl = parseConfiguredPreviewUrl(
    "http://127.0.0.1:3002/leads/lead-01",
  );
  const exact = await fetchPreviewIdentity(
    previewUrl,
    async (input, init) => {
      assert.equal(String(input), "http://127.0.0.1:3002/api/living-preview");
      assert.equal(init?.redirect, "error");
      assert.equal(init?.credentials, "omit");
      return Response.json(identity);
    },
  );
  assert.deepEqual(exact, identity);

  await assert.rejects(
    fetchPreviewIdentity(
      previewUrl,
      async () =>
        new Response(JSON.stringify(identity), {
          headers: {
            "content-length": String(5 * 1024),
            "content-type": "application/json",
          },
        }),
    ),
    /invalid response/u,
  );
  await assert.rejects(
    fetchPreviewIdentity(
      previewUrl,
      async () =>
        new Response("{", {
          headers: { "content-type": "application/json" },
        }),
    ),
    SyntaxError,
  );
  await assert.rejects(
    fetchPreviewIdentity(
      previewUrl,
      async () => {
        throw new DOMException("Timed out", "TimeoutError");
      },
    ),
    /Timed out/u,
  );
});

test("preview identity is strict and must match the governed evolution", () => {
  assert.deepEqual(parsePreviewIdentity(identity), identity);
  assert.equal(previewIdentityMatches(status("draft_ready"), identity), true);
  assert.equal(
    previewIdentityMatches(status("draft_ready"), {
      ...identity,
      postHash: `sha256:${"e".repeat(64)}`,
    }),
    false,
  );
  assert.equal(previewIdentityMatches(status("active"), identity), false);
  assert.equal(
    previewIdentityMatches(
      { ...status("draft_ready"), hostSourceHash: `sha256:${"f".repeat(64)}` },
      identity,
    ),
    false,
  );
  assert.throws(
    () => parsePreviewIdentity({ ...identity, extra: true }),
    /unknown or missing fields/u,
  );
});

test("comparison copy remains truthful through every lifecycle phase", () => {
  assert.equal(describeComparison(status("draft_ready")).canCompare, true);
  assert.match(describeComparison(status("draft_ready")).notice, /no human approval/u);
  assert.equal(describeComparison(status("approved")).canCompare, true);
  assert.match(describeComparison(status("approved")).notice, /not yet been applied/u);
  assert.equal(describeComparison(status("active")).canCompare, false);
  assert.match(describeComparison(status("active")).notice, /no longer.*old CRM/u);
  assert.equal(describeComparison(status("rolled_back")).canCompare, false);
  assert.match(describeComparison(status("rolled_back")).notice, /preimage was restored/u);
  assert.equal(describeComparison(status("ready")).canCompare, false);
});

test("comparison explains the authority boundary and reads lifecycle status only", async () => {
  const page = await readFile(
    path.join(sourceRoot, "app", "apps", "[appId]", "compare", "page.tsx"),
    "utf8",
  );
  const statusComponent = await readFile(
    path.join(sourceRoot, "components", "evolution-comparison-status.tsx"),
    "utf8",
  );

  for (const label of [
    "Install",
    "Observe",
    "Analyze",
    "Detect",
    "Prepare",
    "Approve and apply",
  ]) {
    assert.match(page, new RegExp(label, "u"));
  }
  assert.match(page, /Automatic boundary/u);
  assert.match(page, /Human boundary/u);
  assert.match(page, /The real CRM is still unchanged/u);
  assert.match(page, /#approve-change/u);
  assert.match(statusComponent, /The proposal adds one navigation row/u);
  assert.match(statusComponent, /Previous lead · 1 of 36 · Next lead/u);
  assert.match(statusComponent, /Technical proof and exact hashes/u);
  assert.match(statusComponent, /fetch\("\/api\/evolution"/u);
  assert.match(statusComponent, /fetch\("\/api\/preview-identity"/u);
  assert.doesNotMatch(statusComponent, /method:\s*"POST"|onClick|<button/u);
});

test("evolution console links to comparison only before source application", async () => {
  const source = await readFile(
    path.join(sourceRoot, "components", "live-evolution-console.tsx"),
    "utf8",
  );

  assert.match(source, /status\?\.phase === "draft_ready"/u);
  assert.match(source, /status\?\.phase === "approved"/u);
  assert.match(source, /hasPreparedDraft \? \(\s*<Link/u);
  assert.match(source, /studioAppHref\(appId, "compare"\)/u);
  assert.match(source, /Open before \/ after comparison/u);
  assert.match(source, /Approve change/u);
  assert.match(source, /Apply approved change to real CRM/u);
  assert.match(source, /canRollback = status\?\.phase === "active" && approverValid/u);
  assert.match(source, /Rollback receipt label/u);
});
