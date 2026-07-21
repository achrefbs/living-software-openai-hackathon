#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadLiveHostState } from "../packages/cli/dist/index.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const SAFE_SESSION_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,78}[A-Za-z0-9])?$/u;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const DEFAULT_PORT = 3001;
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function usage() {
  return [
    "Usage:",
    "  npm run studio:live -- --root <supported-next-app> --host-url <loopback-url> [--port <port>] [--new-session | --session-id <id>]",
    "",
    "Session history:",
    "  --new-session        Start an empty durable history (also the safe default)",
    "  --session-id <id>    Explicitly resume the printed history for this run",
    "",
    "Optional verified comparison endpoints:",
    "  --preview-url <loopback-url>  Exact proposed-postimage preview",
    "  --before-url <loopback-url>   Immutable exact-preimage preview",
  ].join("\n");
}

function readArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const allowed = new Set([
    "--root",
    "--host-url",
    "--port",
    "--preview-url",
    "--before-url",
    "--session-id",
  ]);
  const values = new Map();
  let newSession = false;
  for (let index = 0; index < argv.length;) {
    const key = argv[index];
    if (key === "--new-session") {
      if (newSession) {
        throw new TypeError("Invalid duplicate Studio live argument --new-session\n" + usage());
      }
      newSession = true;
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (
      !allowed.has(key) ||
      typeof value !== "string" ||
      value.length === 0 ||
      value.startsWith("--") ||
      values.has(key)
    ) {
      throw new TypeError("Invalid Studio live argument near '" + (key ?? "") + "'\n" + usage());
    }
    values.set(key, value);
    index += 2;
  }
  return { help: false, values, newSession };
}
export function parseStudioLiveArgs(argv) {
  const parsed = readArguments(argv);
  if (parsed.help) return parsed;
  const root = parsed.values.get("--root");
  const hostUrl = parsed.values.get("--host-url");
  if (root === undefined || hostUrl === undefined) {
    throw new TypeError(`Studio live requires --root and --host-url\n${usage()}`);
  }
  const requestedSessionId = parsed.values.get("--session-id");
  if (parsed.newSession && requestedSessionId !== undefined) {
    throw new TypeError("Studio live accepts either --new-session or --session-id, not both");
  }
  const portSource = parsed.values.get("--port") ?? String(DEFAULT_PORT);
  if (!/^[0-9]{1,5}$/u.test(portSource)) {
    throw new TypeError("Studio port must be a decimal integer");
  }
  const port = Number(portSource);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("Studio port must be between 1 and 65535");
  }
  return {
    help: false,
    root,
    hostUrl: parseLoopbackHttpUrl(hostUrl, "host URL"),
    port,
    previewUrl: optionalLoopbackUrl(parsed.values.get("--preview-url"), "preview URL"),
    beforeUrl: optionalLoopbackUrl(parsed.values.get("--before-url"), "before URL"),
    sessionId: requestedSessionId === undefined
      ? null
      : parseStudioSessionId(requestedSessionId),
  };
}

export function parseStudioSessionId(value) {
  if (
    typeof value !== "string" ||
    !SAFE_SESSION_ID.test(value) ||
    WINDOWS_DEVICE_NAME.test(value)
  ) {
    throw new TypeError(
      "Studio session ID must be 1-80 ASCII letters, digits, dots, underscores, or hyphens; it must start and end with a letter or digit",
    );
  }
  return value;
}

function optionalLoopbackUrl(value, label) {
  return value === undefined ? null : parseLoopbackHttpUrl(value, label);
}

export function parseLoopbackHttpUrl(value, label = "URL") {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an absolute URL`);
  }
  const hostname = url.hostname.startsWith("[")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  if (
    url.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(hostname) ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError(`${label} must be credential-free loopback HTTP without query or fragment`);
  }
  if (url.port !== "") {
    const port = Number(url.port);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      throw new TypeError(`${label} contains an invalid port`);
    }
  }
  return url.href;
}

export function liveSessionId(canonicalRoot, runNonce = randomUUID()) {
  const digest = createHash("sha256")
    .update("living.studio-live-session/v2\0", "utf8")
    .update(canonicalRoot, "utf8")
    .update("\0", "utf8")
    .update(runNonce, "utf8")
    .digest("hex");
  return "live-session." + digest.slice(0, 32);
}

async function resolveHostRoot(rootInput) {
  const root = await realpath(path.resolve(rootInput));
  const stats = await lstat(root);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new TypeError("Studio live root must resolve to a real directory");
  }
  return root;
}

export function projectMappedHost(liveHost) {
  const application = liveHost?.application;
  if (
    typeof application !== "object" ||
    application === null ||
    application.framework !== "next-app-router" ||
    typeof application.appId !== "string" ||
    typeof application.manifestHash !== "string" ||
    typeof application.displayName !== "string" ||
    application.displayName.trim() === "" ||
    !Number.isSafeInteger(application.nodes) ||
    application.nodes < 0 ||
    !Number.isSafeInteger(application.edges) ||
    application.edges < 0
  ) {
    throw new TypeError("Studio live mapping did not return a supported validated Next.js host");
  }
  return Object.freeze({
    appId: application.appId,
    manifestHash: application.manifestHash,
    displayName: application.displayName,
    mappedNodes: application.nodes,
    mappedEdges: application.edges,
  });
}

export async function prepareStudioLiveConfiguration(args) {
  const hostRoot = await resolveHostRoot(args.root);
  const mapped = projectMappedHost(await loadLiveHostState(hostRoot));
  return Object.freeze({
    hostRoot,
    hostUrl: args.hostUrl,
    port: args.port,
    previewUrl: args.previewUrl,
    beforeUrl: args.beforeUrl,
    sessionId: args.sessionId ?? liveSessionId(hostRoot),
    ...mapped,
  });
}

export function studioLiveEnvironment(configuration, base = process.env) {
  return {
    ...base,
    LIVING_STUDIO_LIVE_MODE: "1",
    LIVING_STUDIO_HOST_ROOT: configuration.hostRoot,
    LIVING_STUDIO_HOST_URL: configuration.hostUrl,
    LIVING_STUDIO_LIVE_SESSION_ID: configuration.sessionId,
    LIVING_STUDIO_LIVE_APP_ID: configuration.appId,
    LIVING_STUDIO_LIVE_MANIFEST_HASH: configuration.manifestHash,
    LIVING_STUDIO_EVOLUTION_ENABLED: "1",
    ...(configuration.previewUrl === null
      ? {}
      : { LIVING_STUDIO_PREVIEW_URL: configuration.previewUrl }),
    ...(configuration.beforeUrl === null
      ? {}
      : { LIVING_STUDIO_BEFORE_URL: configuration.beforeUrl }),
  };
}

export function resolveNpmLauncher({
  platform = process.platform,
  nodeExecutable = process.execPath,
  npmExecPath = process.env.npm_execpath,
} = {}) {
  if (platform !== "win32") {
    return Object.freeze({ executable: "npm", prefixArguments: Object.freeze([]) });
  }
  if (
    typeof npmExecPath !== "string" ||
    !path.isAbsolute(npmExecPath) ||
    path.basename(npmExecPath).toLowerCase() !== "npm-cli.js" ||
    !path.isAbsolute(nodeExecutable)
  ) {
    throw new TypeError(
      "Windows Studio live startup requires npm_execpath; launch it with 'npm run studio:live -- ...'",
    );
  }
  return Object.freeze({
    executable: nodeExecutable,
    prefixArguments: Object.freeze([path.resolve(npmExecPath)]),
  });
}

export function startStudioProcess(configuration) {
  const launcher = resolveNpmLauncher();
  return spawn(
    launcher.executable,
    studioProcessArguments(configuration, launcher),
    {
      cwd: REPOSITORY_ROOT,
      env: studioLiveEnvironment(configuration),
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    },
  );
}

export function studioProcessArguments(configuration, launcher = resolveNpmLauncher()) {
  return [
    ...launcher.prefixArguments,
    "run",
    "dev",
    "--workspace",
    "@living-software/studio",
    "--",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(configuration.port),
  ];
}
async function main() {
  const args = parseStudioLiveArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const configuration = await prepareStudioLiveConfiguration(args);
  process.stdout.write(
    [
      `Mapped ${configuration.displayName} (${configuration.mappedNodes} nodes, ${configuration.mappedEdges} relationships).`,
      `Studio live session ${configuration.sessionId}`,
      `Open http://127.0.0.1:${configuration.port}`,
      "The live monitor starts independently of Living installation state.",
      "",
    ].join("\n"),
  );
  const child = startStudioProcess(configuration);
  const forward = (signal) => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  };
  const forwardSigint = () => forward("SIGINT");
  const forwardSigterm = () => forward("SIGTERM");
  process.once("SIGINT", forwardSigint);
  process.once("SIGTERM", forwardSigterm);
  let exitCode;
  try {
    exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        resolve(code ?? (signal === null ? 1 : 0));
      });
    });
  } finally {
    process.off("SIGINT", forwardSigint);
    process.off("SIGTERM", forwardSigterm);
  }
  process.exitCode = exitCode;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
