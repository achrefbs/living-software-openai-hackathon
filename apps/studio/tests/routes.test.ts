import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex";

import {
  isCurrentStudioSurface,
  studioAppHref,
} from "../src/lib/studio-routes";

const cases = [
  ["sample-app", "sample-app"],
  ["org/product", "org%2Fproduct"],
  ["org/./product", "org%2F.%2Fproduct"],
  ["org/../product", "org%2F..%2Fproduct"],
  ["org//product", "org%2F%2Fproduct"],
  ["scope:app.v1_test-prod", "scope%3Aapp.v1_test-prod"],
] as const;

const matchStudioMap = getRouteMatcher(getRouteRegex("/apps/[appId]/map"));

test("keeps every contract-valid app ID inside one reversible route segment", () => {
  for (const [appId, encoded] of cases) {
    const href = studioAppHref(appId, "map");
    const pathname = new URL(href, "https://studio.test").pathname;

    assert.equal(href, "/apps/" + encoded + "/map");
    assert.equal(pathname, href);
    assert.deepEqual(pathname.split("/"), ["", "apps", encoded, "map"]);
    assert.equal(decodeURIComponent(encoded), appId);
    assert.deepEqual(matchStudioMap(href), { appId });
  }
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(candidate);
      return /\.[cm]?[jt]sx?$/u.test(entry.name) ? [candidate] : [];
    }),
  );
  return files.flat();
}

test("centralizes every Studio application URL in the route helper", async () => {
  const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
  const routeHelper = path.join(sourceRoot, "lib", "studio-routes.ts");

  for (const file of await sourceFiles(sourceRoot)) {
    if (file === routeHelper) continue;
    const source = await readFile(file, "utf8");
    assert.equal(
      source.includes('"/apps/"') || source.includes("'/apps/'"),
      false,
      "Raw Studio app route in " + path.relative(sourceRoot, file),
    );
  }
});

test("recognizes the current focus so the shell never renders a self-link", () => {
  assert.equal(
    isCurrentStudioSurface(
      "/apps/org%2Fproduct/opportunities",
      "org/product",
      "opportunities",
    ),
    true,
  );
  assert.equal(
    isCurrentStudioSurface(
      "/apps/org%2Fproduct/evolutions",
      "org/product",
      "opportunities",
    ),
    false,
  );
});

test("model-proof pages use relation-aware surrounding copy", async () => {
  const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
  const pageRoot = path.join(sourceRoot, "app", "apps", "[appId]");

  for (const surface of ["opportunities", "evolutions"]) {
    const source = await readFile(path.join(pageRoot, surface, "page.tsx"), "utf8");
    assert.match(
      source,
      /recordedRunLinkageNote\(recordedRunRelation\)/u,
      surface + " must not hardcode a separate or exact relation",
    );
  }
});
