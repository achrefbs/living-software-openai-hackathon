import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseLivingConfig,
  parseProductManifest,
} from "@living-software/contracts";

import { discoveryResultSchema } from "../../contracts/src/discovery.js";
import { discoverNextApp } from "./discover.js";
import { DiscoveryError } from "./types.js";

type FixtureFiles = Readonly<Record<string, string>>;

const BASE_FILES: FixtureFiles = {
  "package.json": JSON.stringify({
    name: "fixture-crm",
    version: "1.2.3",
    scripts: { postinstall: "node scripts/postinstall.js" },
    dependencies: { next: "^15.3.1", react: "19.0.0" },
  }),
  "next.config.ts": 'throw new Error("host config must never execute");\nexport default {};',
  "scripts/postinstall.js": 'throw new Error("host script must never execute");',
  "src/app/layout.tsx": `
    import { SavePanel } from "@/components/save-panel";
    export default function RootLayout({ children }: { children: React.ReactNode }) {
      return <html><body><SavePanel />{children}</body></html>;
    }
  `,
  "src/app/page.tsx": `
    import Link from "next/link";
    import { SavePanel } from "@/components/save-panel";
    import type { Deal } from "@/lib/types";
    export default function HomePage() {
      const id = "sample";
      void fetch("/api/deals");
      return <main data-testid="page-home">
        <Link href="/deals/123" data-testid={\`deal-link-\${id}\`}>Deal</Link>
        <SavePanel />
      </main>;
    }
  `,
  "src/app/deals/[id]/page.tsx": `
    export default function DealPage() {
      return <button data-living-id="save-deal">Save</button>;
    }
  `,
  "src/app/(admin)/settings/page.jsx": `
    export default function SettingsPage() {
      return <select data-testid="theme-select"><option>Dark</option></select>;
    }
  `,
  "src/app/api/deals/route.ts": `
    export async function GET() { return Response.json([]); }
    export const POST = async () => Response.json({}, { status: 201 });
  `,
  "src/components/save-panel.tsx": `
    export function SavePanel() {
      return <form data-testid="save-form"><button type="submit" data-testid="save-button">Save</button></form>;
    }
  `,
  "src/lib/types.ts": `
    export interface Deal { id: string; name: string; stage: Stage; value: number; }
    export type Stage = "new" | "qualified" | "won";
    export interface WidgetProps { label: string; value: string; }
  `,
  "src/lib/storage.ts": `
    export const STORAGE_KEY = "fixture-crm:v1";
    export function load() { return localStorage.getItem(STORAGE_KEY); }
    export function save(value: string) { localStorage.setItem(STORAGE_KEY, value); }
  `,
  "src/app/globals.css": ".toolbar { display: grid; grid-template-columns: 1fr auto; }",
  ".env": "OPENAI_API_KEY=never-read",
  ".env.local": "DATABASE_URL=never-read",
  "credentials.pem": "never-read",
  "node_modules/evil/index.js": 'throw new Error("dependency must never scan");',
  ".next/server/app.js": 'throw new Error("build output must never scan");',
};

async function createFixture(
  files: FixtureFiles = BASE_FILES,
): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "living-discovery-test-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
  }
  return {
    root,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

function nodeNames(
  result: Awaited<ReturnType<typeof discoverNextApp>>,
  kind: string,
): string[] {
  return result.manifest.nodes
    .filter((node) => node.kind === kind)
    .map((node) => node.displayName)
    .sort();
}

test("discovers a source-linked Next.js product map without executing host code", async () => {
  const fixture = await createFixture();
  try {
    const result = await discoverNextApp({
      repositoryRoot: fixture.root,
      clock: () => new Date("2026-07-19T10:00:00.000Z"),
    });

    assert.deepEqual(nodeNames(result, "route"), ["/", "/deals/:id", "/settings"]);
    assert.deepEqual(nodeNames(result, "endpoint"), ["/api/deals"]);
    assert.ok(nodeNames(result, "surface").includes("SavePanel"));
    assert.ok(nodeNames(result, "entity").includes("Deal"));
    assert.ok(nodeNames(result, "entity").includes("Stage"));
    assert.ok(!nodeNames(result, "entity").includes("WidgetProps"));
    assert.ok(nodeNames(result, "integration").includes("localStorage fixture-crm:v1"));

    const dynamicLocator = result.runtimeLocatorMap.locators.find(
      (locator) => locator.normalizedValue === "deal-link-{*}",
    );
    assert.ok(dynamicLocator);
    assert.equal(dynamicLocator.dynamic, true);
    assert.equal(dynamicLocator.selector, '[data-testid^="deal-link-"]');
    assert.deepEqual(dynamicLocator.match, { kind: "prefix", value: "deal-link-" });
    assert.match(dynamicLocator.token, /^locator:[a-f0-9]{12}$/u);
    assert.ok(dynamicLocator.eventBindings.includes("action.activate"));
    assert.ok(dynamicLocator.captures.includes("geometry"));
    assert.ok(dynamicLocator.captures.includes("activate"));
    assert.ok(
      result.metricCatalog.metrics.some(
        (metric) =>
          metric.eventName === "layout.geometry" &&
          metric.targetNodeId === dynamicLocator.nodeId,
      ),
    );

    const endpoint = result.manifest.nodes.find((node) => node.kind === "endpoint");
    assert.deepEqual(endpoint?.attributes?.methods, ["GET", "POST"]);
    assert.ok(result.manifest.edges.some((edge) => edge.relation === "navigates-to"));
    assert.ok(result.manifest.edges.some((edge) => edge.relation === "calls"));
    assert.ok(result.manifest.edges.some((edge) => edge.relation === "renders"));
    assert.ok(result.manifest.edges.some((edge) => edge.relation === "reads"));

    assert.match(result.sourceDigest, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(result.manifest.release.revision, result.sourceDigest);
    assert.equal(result.config.application.id, "fixture-crm");
    assert.equal(result.support.detectedVersion, "15.3.1");
    assert.ok(
      result.diagnostics.some((entry) => entry.code === "static-analysis-only"),
    );
    assert.ok(
      result.diagnostics.filter((entry) => entry.code === "sensitive-file-excluded")
        .length >= 3,
    );

    parseProductManifest(result.manifest);
    parseLivingConfig(result.config);
    discoveryResultSchema.parse(result);
  } finally {
    await fixture.cleanup();
  }
});

test("scans application source without admitting simulator, test, script, or build harness decoys", async () => {
  const applicationFiles: FixtureFiles = {
    ...BASE_FILES,
    "src/lib/integrations/audit-store.ts": `
      export interface AuditRecord {
        id: string;
        action: string;
        occurredAt: string;
        route: string;
      }
      export function saveAudit(record: AuditRecord) {
        localStorage.setItem("fixture-crm:audit:v1", JSON.stringify(record));
      }
    `,
  };
  const baselineFixture = await createFixture(applicationFiles);
  const decoyFixture = await createFixture({
    ...applicationFiles,
    "sim/model.ts": `
      export interface SimulatorPersona { id: string; name: string; role: string; cohort: string; }
      localStorage.setItem("simulator-only", "ignored");
    `,
    "scripts/seed.ts": `
      export interface SeedHarness { id: string; name: string; stage: string; owner: string; }
      localStorage.setItem("seed-only", "ignored");
    `,
    "tests/unit/product-map.test.ts": `
      export interface TestHarness { id: string; route: string; action: string; result: string; }
      localStorage.setItem("test-only", "ignored");
    `,
    "src/components/decoy.test.tsx": `
      export function TestOnlyButton() { return <button data-testid="test-only-button">Test</button>; }
    `,
    "src/__tests__/decoy.ts": `
      export interface NestedTestHarness { id: string; route: string; action: string; result: string; }
    `,
    "playwright.config.ts": `
      export interface BrowserHarness { id: string; baseUrl: string; project: string; command: string; }
    `,
    ".living/stale-runtime.ts": `
      export interface InstalledHarness { id: string; route: string; action: string; result: string; }
      localStorage.setItem("installed-only", "ignored");
    `,
  });
  try {
    const baseline = await discoverNextApp({
      repositoryRoot: baselineFixture.root,
      clock: () => new Date("2026-07-19T10:00:00.000Z"),
    });
    const withDecoys = await discoverNextApp({
      repositoryRoot: decoyFixture.root,
      previous: baseline,
      clock: () => new Date("2030-01-01T00:00:00.000Z"),
    });

    assert.equal(withDecoys.sourceDigest, baseline.sourceDigest);
    assert.deepEqual(withDecoys.manifest, baseline.manifest);
    assert.deepEqual(withDecoys.runtimeLocatorMap, baseline.runtimeLocatorMap);
    assert.deepEqual(withDecoys.metricCatalog, baseline.metricCatalog);
    assert.deepEqual(withDecoys.stats, baseline.stats);

    const provenancePaths = withDecoys.manifest.nodes.flatMap((node) =>
      node.provenance.sources.map((source) => source.path),
    );
    assert.ok(provenancePaths.includes("src/lib/integrations/audit-store.ts"));
    assert.ok(
      provenancePaths.every(
        (sourcePath) =>
          !/^(?:scripts|sim|tests)\//u.test(sourcePath) &&
          !/^\.living\//u.test(sourcePath) &&
          !/(?:^|\/)__tests__\//u.test(sourcePath) &&
          !/\.(?:spec|stories|test)\.[cm]?[jt]sx?$/iu.test(sourcePath) &&
          !/^[^/]+\.config\.[cm]?[jt]s$/iu.test(sourcePath),
      ),
    );
    assert.ok(
      nodeNames(withDecoys, "integration").includes(
        "localStorage fixture-crm:audit:v1",
      ),
    );
  } finally {
    await baselineFixture.cleanup();
    await decoyFixture.cleanup();
  }
});

test("skips generic interactive JSX locators without emitting wildcard action families", async () => {
  const fixture = await createFixture({
    ...BASE_FILES,
    "src/components/generic-actions.tsx": `
      export function GenericActions({
        testId,
        livingId,
        rowId,
      }: {
        testId: string;
        livingId: string;
        rowId: string;
      }) {
        return <section>
          <button data-testid={testId} onClick={() => undefined}>Generic click</button>
          <input data-living-id={livingId} onChange={() => undefined} />
          <button data-testid={\`row-\${rowId}-edit\`} onClick={() => undefined}>Edit</button>
        </section>;
      }
    `,
  });
  try {
    const result = await discoverNextApp({
      repositoryRoot: fixture.root,
      clock: () => new Date("2026-07-19T10:00:00.000Z"),
    });

    const actionFamilies = result.manifest.nodes
      .filter((node) => node.kind === "action")
      .map((node) => node.attributes?.locatorValue ?? node.displayName);
    assert.ok(!actionFamilies.includes("{*}"));
    assert.ok(!actionFamilies.includes("*"));
    assert.ok(
      result.runtimeLocatorMap.locators.every(
        (locator) =>
          locator.normalizedValue.trim().replaceAll("{*}", "*") !== "*",
      ),
    );
    assert.ok(actionFamilies.includes("row-{*}-edit"));
    assert.equal(
      result.diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === "generic-action-locator-skipped" &&
          diagnostic.path === "src/components/generic-actions.tsx",
      ).length,
      2,
    );
    discoveryResultSchema.parse(result);
  } finally {
    await fixture.cleanup();
  }
});

test("is deterministic and reuses prior generation evidence only when unchanged", async () => {
  const fixture = await createFixture();
  try {
    const first = await discoverNextApp({
      repositoryRoot: fixture.root,
      clock: () => new Date("2026-07-19T10:00:00.000Z"),
    });
    const repeated = await discoverNextApp({
      repositoryRoot: fixture.root,
      previous: first,
      clock: () => new Date("2030-01-01T00:00:00.000Z"),
    });
    assert.equal(repeated.sourceDigest, first.sourceDigest);
    assert.equal(repeated.manifest.contentHash, first.manifest.contentHash);
    assert.equal(repeated.manifest.generatedAt, first.manifest.generatedAt);
    assert.deepEqual(repeated.manifest.nodes, first.manifest.nodes);
    assert.deepEqual(repeated.manifest.edges, first.manifest.edges);

    await writeFile(
      path.join(fixture.root, "src", "app", "globals.css"),
      ".toolbar { display: flex; flex-direction: row-reverse; }",
      "utf8",
    );
    const changed = await discoverNextApp({
      repositoryRoot: fixture.root,
      previous: first,
      clock: () => new Date("2030-01-01T00:00:00.000Z"),
    });
    assert.notEqual(changed.sourceDigest, first.sourceDigest);
    assert.notEqual(changed.manifest.contentHash, first.manifest.contentHash);
    assert.equal(changed.manifest.generatedAt, "2030-01-01T00:00:00.000Z");

    await writeFile(path.join(fixture.root, ".env"), "CHANGED_BUT_EXCLUDED=yes", "utf8");
    const secretChanged = await discoverNextApp({
      repositoryRoot: fixture.root,
      previous: changed,
      clock: () => new Date("2040-01-01T00:00:00.000Z"),
    });
    assert.equal(secretChanged.sourceDigest, changed.sourceDigest);
    assert.equal(secretChanged.manifest.generatedAt, changed.manifest.generatedAt);
  } finally {
    await fixture.cleanup();
  }
});

test("generated integration files are scan-idempotent while neighboring host APIs remain visible", async () => {
  const fixture = await createFixture();
  try {
    const baseline = await discoverNextApp({
      repositoryRoot: fixture.root,
      clock: () => new Date("2026-07-19T10:00:00.000Z"),
    });
    const generatedFiles = {
      "src/instrumentation-client.ts": "throw new Error('generated instrumentation');",
      "src/living-observer.generated.ts": "export const GENERATED_OBSERVER = 'arbitrary';",
      "src/living-collector.generated.ts": "export const GENERATED_COLLECTOR = 'arbitrary';",
      "src/app/api/living/events/route.ts": "export async function POST() { throw new Error('generated collector'); }",
    };
    for (const [relativePath, contents] of Object.entries(generatedFiles)) {
      const absolutePath = path.join(fixture.root, ...relativePath.split("/"));
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents, "utf8");
    }

    const installedRescan = await discoverNextApp({
      repositoryRoot: fixture.root,
      previous: baseline,
      clock: () => new Date("2030-01-01T00:00:00.000Z"),
    });
    assert.equal(installedRescan.sourceDigest, baseline.sourceDigest);
    assert.deepEqual(installedRescan.manifest, baseline.manifest);
    assert.deepEqual(installedRescan.config, baseline.config);
    assert.deepEqual(installedRescan.runtimeLocatorMap, baseline.runtimeLocatorMap);
    assert.deepEqual(installedRescan.metricCatalog, baseline.metricCatalog);
    assert.deepEqual(installedRescan.stats, baseline.stats);
    assert.deepEqual(installedRescan.diagnostics, baseline.diagnostics);
    assert.equal(
      installedRescan.manifest.generatedAt,
      baseline.manifest.generatedAt,
    );

    const neighboringApi = path.join(
      fixture.root,
      "src",
      "app",
      "api",
      "living",
      "health",
      "route.ts",
    );
    await mkdir(path.dirname(neighboringApi), { recursive: true });
    await writeFile(
      neighboringApi,
      "export async function GET() { return Response.json({ ok: true }); }",
      "utf8",
    );
    const hostChanged = await discoverNextApp({
      repositoryRoot: fixture.root,
      previous: installedRescan,
      clock: () => new Date("2030-01-01T00:00:00.000Z"),
    });
    assert.notEqual(hostChanged.sourceDigest, baseline.sourceDigest);
    assert.equal(hostChanged.stats.scannedFiles, baseline.stats.scannedFiles + 1);
    assert.ok(
      hostChanged.manifest.nodes.some(
        (node) =>
          node.kind === "endpoint" && node.displayName === "/api/living/health",
      ),
    );
  } finally {
    await fixture.cleanup();
  }
});

test("normalizes dynamic, catch-all, optional catch-all, route-group, and parallel segments", async () => {
  const fixture = await createFixture({
    "package.json": JSON.stringify({ name: "routes", dependencies: { next: "16.1.0" } }),
    "app/page.js": "export default function Page() { return null; }",
    "app/blog/[slug]/page.js": "export default function Page() { return null; }",
    "app/docs/[...parts]/page.js": "export default function Page() { return null; }",
    "app/files/[[...path]]/page.js": "export default function Page() { return null; }",
    "app/(admin)/@modal/users/page.js": "export default function Page() { return null; }",
  });
  try {
    const result = await discoverNextApp({ repositoryRoot: fixture.root });
    assert.deepEqual(nodeNames(result, "route"), [
      "/",
      "/blog/:slug",
      "/docs/*parts",
      "/files/*path?",
      "/users",
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("fails closed when scan bounds would make the evidence incomplete", async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      discoverNextApp({ repositoryRoot: fixture.root, limits: { maxFiles: 2 } }),
      (error: unknown) =>
        error instanceof DiscoveryError && error.code === "file-limit-exceeded",
    );
    await assert.rejects(
      discoverNextApp({ repositoryRoot: fixture.root, limits: { maxFileBytes: 8 } }),
      (error: unknown) =>
        error instanceof DiscoveryError && error.code === "file-byte-limit-exceeded",
    );
    await assert.rejects(
      discoverNextApp({ repositoryRoot: fixture.root, limits: { maxTotalBytes: 16 } }),
      (error: unknown) =>
        error instanceof DiscoveryError && error.code === "total-byte-limit-exceeded",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("rejects internal symlinks without reading their targets", async (context) => {
  const fixture = await createFixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "living-discovery-outside-"));
  try {
    await writeFile(path.join(outside, "outside.ts"), "export const SECRET = 'outside';", "utf8");
    const link = path.join(fixture.root, "src", "linked-source");
    try {
      await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        context.skip("The host does not permit creation of test symlinks");
        return;
      }
      throw error;
    }
    const result = await discoverNextApp({ repositoryRoot: fixture.root });
    assert.ok(result.diagnostics.some((entry) => entry.code === "symlink-rejected"));
    assert.ok(
      !result.manifest.nodes.some((node) =>
        node.provenance.sources.some((source) => source.path.includes("linked-source")),
      ),
    );
  } finally {
    await fixture.cleanup();
    await rm(outside, { recursive: true, force: true });
  }
});

test("rejects unsupported or missing Next.js declarations", async () => {
  const unsupported = await createFixture({
    "package.json": JSON.stringify({ name: "old", dependencies: { next: "15.2.4" } }),
    "app/page.tsx": "export default function Page() { return null; }",
  });
  const missing = await createFixture({
    "package.json": JSON.stringify({ name: "not-next", dependencies: { react: "19.0.0" } }),
    "app/page.tsx": "export default function Page() { return null; }",
  });
  try {
    await assert.rejects(
      discoverNextApp({ repositoryRoot: unsupported.root }),
      (error: unknown) =>
        error instanceof DiscoveryError && error.code === "unsupported-next-version",
    );
    await assert.rejects(
      discoverNextApp({ repositoryRoot: missing.root }),
      (error: unknown) =>
        error instanceof DiscoveryError && error.code === "next-dependency-missing",
    );
  } finally {
    await unsupported.cleanup();
    await missing.cleanup();
  }
});

test("normalizes explicit application ids and validates custom collector URLs", async () => {
  const fixture = await createFixture();
  try {
    const result = await discoverNextApp({
      repositoryRoot: fixture.root,
      appId: "@Acme/CRM Workflow!",
      displayName: "Acme CRM",
      collectorEndpoint: "https://collector.example.test/events",
    });
    assert.equal(result.manifest.appId, "acme/crm-workflow");
    assert.equal(result.config.application.displayName, "Acme CRM");
    assert.equal(
      result.config.collector.endpoint,
      "https://collector.example.test/events",
    );
  } finally {
    await fixture.cleanup();
  }
});
