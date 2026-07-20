import { createHash } from "node:crypto";
import { lstat, opendir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import type {
  DiscoveryDiagnostic,
  DiscoveryLimits,
} from "./types.js";
import { DiscoveryError } from "./types.js";

export interface ScannedFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly bytes: Buffer;
  readonly text: string;
}

export interface SecureScan {
  readonly root: string;
  readonly files: readonly ScannedFile[];
  readonly sourceDigest: string;
  readonly diagnostics: readonly DiscoveryDiagnostic[];
  readonly skippedFiles: number;
  readonly scannedBytes: number;
}

export const DEFAULT_LIMITS: DiscoveryLimits = {
  maxFiles: 10_000,
  maxTotalBytes: 64 * 1024 * 1024,
  maxFileBytes: 2 * 1024 * 1024,
};

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  ".living",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "vendor",
]);

/**
 * Exact create-only artifacts owned by Living Software. They are invisible to
 * discovery so an install followed by a rescan describes the same host source.
 * Keep this list narrow: neighboring host files must remain discoverable.
 */
const GENERATED_INTEGRATION_FILES = new Set([
  "src/instrumentation-client.ts",
  "src/living-collector.generated.ts",
  "src/living-observer.generated.ts",
  "src/app/api/living/events/route.ts",
]);

const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".js",
  ".jsx",
  ".less",
  ".mjs",
  ".sass",
  ".scss",
  ".ts",
  ".tsx",
]);

/**
 * Deliberately narrow source boundary for the supported Next.js App Router
 * adapter. Shared components, libraries, route handlers, and integrations
 * remain visible when they live in these application-owned roots; repository
 * simulators, scripts, tests, and build harnesses do not become product nodes.
 */
const APPLICATION_SOURCE_PREFIXES = [
  "app/",
  "src/app/",
  "src/components/",
  "src/lib/",
] as const;

const COLOCATED_HARNESS_DIRECTORIES = new Set([
  "__fixtures__",
  "__mocks__",
  "__tests__",
]);

const HARNESS_FILE = /(?:^|\.)(?:spec|stories|test)\.(?:[cm]?js|jsx|ts|tsx)$/iu;

function isSensitiveFile(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === ".env" ||
    lower.startsWith(".env.") ||
    /(?:^|[._-])(secret|secrets|credential|credentials)(?:[._-]|$)/u.test(
      lower,
    ) ||
    /\.(?:key|pem|p12|pfx|crt|cer)$/u.test(lower)
  );
}

function isApplicationSourceFile(relativePath: string): boolean {
  const base = path.posix.basename(relativePath).toLowerCase();
  if (base === "package.json" && relativePath === "package.json") return true;
  if (!SOURCE_EXTENSIONS.has(path.posix.extname(base))) return false;

  const segments = relativePath.toLowerCase().split("/");
  if (segments.some((segment) => COLOCATED_HARNESS_DIRECTORIES.has(segment))) {
    return false;
  }
  if (HARNESS_FILE.test(base)) return false;

  return APPLICATION_SOURCE_PREFIXES.some((prefix) =>
    relativePath.toLowerCase().startsWith(prefix),
  );
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

export async function securelyReadSourceTree(
  repositoryRoot: string,
  limits: DiscoveryLimits,
): Promise<SecureScan> {
  const requestedRoot = path.resolve(repositoryRoot);
  const rootStat = await lstat(requestedRoot).catch(() => undefined);
  if (rootStat === undefined || !rootStat.isDirectory()) {
    throw new DiscoveryError(
      "invalid-root",
      `Discovery root is not a directory: ${requestedRoot}`,
    );
  }
  if (rootStat.isSymbolicLink()) {
    throw new DiscoveryError(
      "symlink-root-rejected",
      "Discovery refuses a repository root that is a symbolic link",
    );
  }

  const root = await realpath(requestedRoot);
  const diagnostics: DiscoveryDiagnostic[] = [];
  const candidates: { absolutePath: string; relativePath: string }[] = [];
  let skippedFiles = 0;

  async function walk(directory: string): Promise<void> {
    if (!isWithin(root, directory)) {
      throw new DiscoveryError(
        "path-escape-rejected",
        `Discovery path escaped the repository root: ${directory}`,
      );
    }

    const handle = await opendir(directory);
    const entries = [];
    for await (const entry of handle) entries.push(entry);
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = toPosix(path.relative(root, absolutePath));
      const lowerName = entry.name.toLowerCase();

      if (GENERATED_INTEGRATION_FILES.has(relativePath)) continue;

      if (entry.isSymbolicLink()) {
        skippedFiles += 1;
        diagnostics.push({
          severity: "warning",
          code: "symlink-rejected",
          message: "A symbolic link was rejected and was not followed",
          path: relativePath,
        });
        continue;
      }
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(lowerName)) await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isSensitiveFile(entry.name)) {
        skippedFiles += 1;
        diagnostics.push({
          severity: "info",
          code: "sensitive-file-excluded",
          message: "A potentially sensitive file was excluded from discovery",
          path: relativePath,
        });
        continue;
      }
      if (!isApplicationSourceFile(relativePath)) continue;
      candidates.push({ absolutePath, relativePath });
      if (candidates.length > limits.maxFiles) {
        throw new DiscoveryError(
          "file-limit-exceeded",
          `Discovery exceeded the ${limits.maxFiles} file safety limit`,
        );
      }
    }
  }

  await walk(root);
  candidates.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );

  const files: ScannedFile[] = [];
  let scannedBytes = 0;
  for (const candidate of candidates) {
    const fileStat = await lstat(candidate.absolutePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      throw new DiscoveryError(
        "file-changed-during-scan",
        `A source changed type while it was being scanned: ${candidate.relativePath}`,
      );
    }
    const canonicalFile = await realpath(candidate.absolutePath);
    if (!isWithin(root, canonicalFile)) {
      throw new DiscoveryError(
        "path-escape-rejected",
        `A source resolved outside the repository: ${candidate.relativePath}`,
      );
    }
    if (fileStat.size > limits.maxFileBytes) {
      throw new DiscoveryError(
        "file-byte-limit-exceeded",
        `Source exceeds the ${limits.maxFileBytes} byte per-file safety limit: ${candidate.relativePath}`,
      );
    }
    scannedBytes += fileStat.size;
    if (scannedBytes > limits.maxTotalBytes) {
      throw new DiscoveryError(
        "total-byte-limit-exceeded",
        `Discovery exceeded the ${limits.maxTotalBytes} total byte safety limit`,
      );
    }
    const bytes = await readFile(canonicalFile);
    files.push({
      absolutePath: canonicalFile,
      relativePath: candidate.relativePath,
      bytes,
      text: bytes.toString("utf8"),
    });
  }

  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file.relativePath, "utf8");
    digest.update("\0", "utf8");
    digest.update(file.bytes);
    digest.update("\0", "utf8");
  }

  return {
    root,
    files,
    sourceDigest: `sha256:${digest.digest("hex")}`,
    diagnostics,
    skippedFiles,
    scannedBytes,
  };
}
