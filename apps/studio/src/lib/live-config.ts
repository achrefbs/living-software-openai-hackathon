import "server-only";

import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u;
const SAFE_SESSION_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,78}[A-Za-z0-9])?$/u;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export type LiveStudioConfig = Readonly<{
  sessionId: string;
  hostRoot: string;
  hostUrl: string;
  previewUrl: string | null;
  beforeUrl: string | null;
  startupAppId: string;
  startupManifestHash: string;
  eventDirectory: string;
}>;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") {
    throw new TypeError(`Studio live is missing server startup value ${name}`);
  }
  return value;
}

function loopbackUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${name} is not an absolute URL`);
  }
  if (
    url.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError(`${name} must be credential-free loopback HTTP`);
  }
  return url.href;
}

function optionalLoopbackUrl(name: string): string | null {
  const value = process.env[name]?.trim();
  return value === undefined || value === "" ? null : loopbackUrl(value, name);
}

export function isLiveStudioMode(): boolean {
  return process.env.LIVING_STUDIO_LIVE_MODE === "1";
}

let configured: Promise<LiveStudioConfig> | undefined;

export function loadLiveStudioConfig(): Promise<LiveStudioConfig> {
  if (!isLiveStudioMode()) {
    throw new TypeError("Studio is running in explicit offline snapshot/fixture mode");
  }
  configured ??= (async () => {
    const suppliedRoot = requiredEnvironment("LIVING_STUDIO_HOST_ROOT");
    const hostRoot = await realpath(suppliedRoot);
    const stats = await lstat(hostRoot);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new TypeError("Studio live host root must be a real directory");
    }
    if (path.resolve(hostRoot) !== path.resolve(suppliedRoot)) {
      throw new TypeError("Studio live host root changed after startup canonicalization");
    }
    const sessionId = requiredEnvironment("LIVING_STUDIO_LIVE_SESSION_ID");
    const startupAppId = requiredEnvironment("LIVING_STUDIO_LIVE_APP_ID");
    const startupManifestHash = requiredEnvironment(
      "LIVING_STUDIO_LIVE_MANIFEST_HASH",
    );
    if (
      !SAFE_SESSION_ID.test(sessionId) ||
      WINDOWS_DEVICE_NAME.test(sessionId) ||
      !IDENTIFIER.test(startupAppId) ||
      !SHA256.test(startupManifestHash)
    ) {
      throw new TypeError("Studio live startup identities failed validation");
    }
    const localRoot = path.join(process.cwd(), ".local", "live");
    return Object.freeze({
      sessionId,
      hostRoot,
      hostUrl: loopbackUrl(
        requiredEnvironment("LIVING_STUDIO_HOST_URL"),
        "LIVING_STUDIO_HOST_URL",
      ),
      previewUrl: optionalLoopbackUrl("LIVING_STUDIO_PREVIEW_URL"),
      beforeUrl: optionalLoopbackUrl("LIVING_STUDIO_BEFORE_URL"),
      startupAppId,
      startupManifestHash,
      eventDirectory: path.join(localRoot, sessionId),
    });
  })();
  return configured;
}

export function resetLiveStudioConfigForTests(): void {
  configured = undefined;
}
