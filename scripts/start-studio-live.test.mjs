import assert from "node:assert/strict";
import test from "node:test";

import {
  liveSessionId,
  parseLoopbackHttpUrl,
  parseStudioSessionId,
  parseStudioLiveArgs,
  projectMappedHost,
  resolveNpmLauncher,
  studioLiveEnvironment,
  studioProcessArguments,
} from "./start-studio-live.mjs";

test("live startup requires a server-supplied root and loopback host URL", () => {
  assert.throws(() => parseStudioLiveArgs([]), /requires --root and --host-url/u);
  assert.throws(
    () => parseStudioLiveArgs(["--root", ".", "--host-url", "https://example.com"]),
    /loopback HTTP/u,
  );
  assert.throws(
    () => parseStudioLiveArgs(["--root", ".", "--host-url", "http://127.0.0.1:3000", "--root", "elsewhere"]),
    /Invalid Studio live argument/u,
  );
});

test("live startup parses bounded optional endpoints and port", () => {
  assert.deepEqual(
    parseStudioLiveArgs([
      "--root",
      "../host",
      "--host-url",
      "http://127.0.0.1:3000",
      "--port",
      "3001",
      "--preview-url",
      "http://localhost:3002",
      "--before-url",
      "http://[::1]:3003",
    ]),
    {
      help: false,
      root: "../host",
      hostUrl: "http://127.0.0.1:3000/",
      port: 3001,
      previewUrl: "http://localhost:3002/",
      beforeUrl: "http://[::1]:3003/",
      sessionId: null,
    },
  );
  assert.throws(
    () => parseStudioLiveArgs(["--root", ".", "--host-url", "http://localhost:3000", "--port", "70000"]),
    /between 1 and 65535/u,
  );
});

test("loopback URL parser rejects credentials, queries, fragments, and non-http", () => {
  for (const candidate of [
    "http://user@localhost:3000/",
    "http://localhost:3000/?root=x",
    "http://localhost:3000/#x",
    "https://localhost:3000/",
    "http://192.168.1.10:3000/",
  ]) {
    assert.throws(() => parseLoopbackHttpUrl(candidate), /loopback HTTP/u);
  }
});

test("live startup creates fresh history by default and resumes only explicitly", () => {
  const root = "C:\\private\\supported-host";
  const first = liveSessionId(root, "run-one");
  assert.equal(first, liveSessionId(root, "run-one"));
  assert.notEqual(first, liveSessionId(root, "run-two"));
  assert.notEqual(liveSessionId(root), liveSessionId(root));
  assert.doesNotMatch(first, /private|supported-host/u);

  assert.equal(parseStudioSessionId("demo-run_2026.07-21"), "demo-run_2026.07-21");
  for (const unsafe of [
    "../prior",
    "nested/prior",
    "nested\\prior",
    ".hidden",
    "trailing.",
    "with space",
    "CON",
  ]) {
    assert.throws(() => parseStudioSessionId(unsafe), /Studio session ID/u);
  }

  assert.equal(
    parseStudioLiveArgs([
      "--root",
      ".",
      "--host-url",
      "http://127.0.0.1:3000",
      "--session-id",
      "demo-run-1",
    ]).sessionId,
    "demo-run-1",
  );
  assert.equal(
    parseStudioLiveArgs([
      "--root",
      ".",
      "--host-url",
      "http://127.0.0.1:3000",
      "--new-session",
    ]).sessionId,
    null,
  );
  assert.throws(
    () => parseStudioLiveArgs([
      "--root",
      ".",
      "--host-url",
      "http://127.0.0.1:3000",
      "--new-session",
      "--session-id",
      "demo-run-1",
    ]),
    /either --new-session or --session-id/u,
  );
});
test("server environment carries the root but no browser argument can override it", () => {
  const configuration = {
    hostRoot: "C:\\hosts\\one",
    hostUrl: "http://127.0.0.1:3000/",
    sessionId: "live-session.0123456789abcdef0123456789abcdef",
    appId: "app.one",
    manifestHash: `sha256:${"a".repeat(64)}`,
    previewUrl: null,
    beforeUrl: null,
  };
  const environment = studioLiveEnvironment(configuration, { SAFE: "yes" });
  assert.equal(environment.LIVING_STUDIO_HOST_ROOT, configuration.hostRoot);
  assert.equal(environment.LIVING_STUDIO_LIVE_MODE, "1");
  assert.equal(environment.LIVING_STUDIO_EVOLUTION_ENABLED, "1");
  assert.equal(environment.SAFE, "yes");
  assert.equal(environment.LIVING_STUDIO_PREVIEW_URL, undefined);
});

test("mapped host projection uses the validated application display name", () => {
  assert.deepEqual(
    projectMappedHost({
      application: {
        appId: "app.generic-host",
        manifestHash: `sha256:${"b".repeat(64)}`,
        displayName: "Generic Workflow Lab",
        framework: "next-app-router",
        nodes: 144,
        edges: 180,
      },
    }),
    {
      appId: "app.generic-host",
      manifestHash: `sha256:${"b".repeat(64)}`,
      displayName: "Generic Workflow Lab",
      mappedNodes: 144,
      mappedEdges: 180,
    },
  );
  assert.throws(
    () => projectMappedHost({ application: { displayName: undefined } }),
    /supported validated Next.js host/u,
  );
});

test("Windows launcher executes npm-cli.js through Node without a command shell", () => {
  assert.deepEqual(
    resolveNpmLauncher({
      platform: "win32",
      nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
      npmExecPath: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    }),
    {
      executable: "C:\\Program Files\\nodejs\\node.exe",
      prefixArguments: [
        "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
      ],
    },
  );
  assert.throws(
    () => resolveNpmLauncher({
      platform: "win32",
      nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
      npmExecPath: "C:\\Program Files\\nodejs\\npm.cmd",
    }),
    /requires npm_execpath/u,
  );
  assert.deepEqual(resolveNpmLauncher({ platform: "linux" }), {
    executable: "npm",
    prefixArguments: [],
  });
});

test("Studio process is explicitly bound to IPv4 loopback", () => {
  assert.deepEqual(
    studioProcessArguments(
      { port: 3120 },
      { prefixArguments: ["/safe/npm-cli.js"] },
    ),
    [
      "/safe/npm-cli.js",
      "run",
      "dev",
      "--workspace",
      "@living-software/studio",
      "--",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3120",
    ],
  );
});
