#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  getEvolutionStatus,
  listEvolutionStatuses,
} from "../packages/evolution/dist/index.js";

const PREVIEW_ROUTE_PATH = "src/app/api/living-preview/route.ts";
const PREVIEW_SCHEMA = "living.preview-identity/v1";
const MAX_TRACKED_FILES = 20_000;
const MAX_TRACKED_BYTES = 64 * 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;

function usage() {
  return [
    "Create verified display-only views for a supported Next.js host evolution.",
    "",
    "Usage:",
    "  npm run preview:host -- --root <host-root> --out <new-postimage-path> [--before-out <new-preimage-path>] [--evolution <id>]",
    "",
    "Only Git-tracked regular files are copied. The connected host is never edited.",
  ].join("\n");
}

export function parseHostPreviewArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  if (argv.length === 0 || argv.length % 2 !== 0) {
    throw new TypeError(usage());
  }
  const allowed = new Set(["--root", "--out", "--before-out", "--evolution"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.has(key) ||
      typeof value !== "string" ||
      value.length === 0 ||
      value.startsWith("--") ||
      values.has(key)
    ) {
      throw new TypeError(`Invalid preview argument near '${key ?? ""}'`);
    }
    values.set(key, value);
  }
  const root = values.get("--root");
  const out = values.get("--out");
  if (root === undefined || out === undefined) {
    throw new TypeError("Preview creation requires --root and --out");
  }
  return {
    help: false,
    root,
    out,
    beforeOut: values.get("--before-out") ?? null,
    evolutionId: values.get("--evolution") ?? null,
  };
}

export function assertSafeTrackedPath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (
    normalized === "" ||
    Buffer.byteLength(normalized, "utf8") > 512 ||
    /[\u0000-\u001f\u007f]/u.test(normalized) ||
    normalized.startsWith("/") ||
    normalized !== relativePath ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new TypeError(`Unsafe tracked path '${relativePath}'`);
  }
  return normalized;
}

export function parseTrackedFileOutput(output) {
  const bytes = Buffer.from(output);
  if (bytes.length === 0) return [];
  const source = bytes.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(bytes) || !source.endsWith("\0")) {
    throw new TypeError("Git tracked-file output must be valid, NUL-terminated UTF-8");
  }
  const entries = source.slice(0, -1).split("\0");
  if (entries.some((entry) => entry === "")) {
    throw new TypeError("Git tracked-file output contains an empty path");
  }
  return entries.map(assertSafeTrackedPath);
}

export function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function assertStableTrackedSnapshot(
  initialRevision,
  initialStatus,
  finalRevision,
  finalStatus,
) {
  if (
    finalRevision !== initialRevision ||
    !Buffer.from(finalStatus).equals(Buffer.from(initialStatus))
  ) {
    throw new TypeError("Host revision or tracked files changed while preview was captured");
  }
}

export function renderPreviewIdentityRoute({
  evolutionId,
  expectedHash,
  targetPath,
  view,
}) {
  return `import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPECTED_HASH = ${JSON.stringify(expectedHash)};
const TARGET_PATH = ${JSON.stringify(targetPath)};
const MAX_SOURCE_BYTES = 2_000_000;

async function inspectTarget() {
  let target = await realpath(process.cwd());
  let targetStat;
  const segments = TARGET_PATH.split("/");
  for (const [index, segment] of segments.entries()) {
    target = path.join(target, segment);
    const stat = await lstat(target);
    const final = index === segments.length - 1;
    if (
      stat.isSymbolicLink() ||
      (!final && !stat.isDirectory()) ||
      (final && (!stat.isFile() || stat.size > MAX_SOURCE_BYTES))
    ) {
      throw new TypeError("Isolated preview target traverses an unsafe path");
    }
    if (final) targetStat = stat;
  }
  if (targetStat === undefined) throw new TypeError("Isolated preview target is empty");
  return { target, targetStat };
}

async function readSealedTarget(): Promise<Buffer> {
  const initial = await inspectTarget();
  const handle = await open(
    initial.target,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      opened.dev !== initial.targetStat.dev ||
      opened.ino !== initial.targetStat.ino ||
      opened.size !== initial.targetStat.size
    ) {
      throw new TypeError("Isolated preview target changed before it was opened");
    }
    const openedPath = await inspectTarget();
    if (
      openedPath.targetStat.dev !== opened.dev ||
      openedPath.targetStat.ino !== opened.ino ||
      openedPath.targetStat.size !== opened.size
    ) {
      throw new TypeError("Isolated preview target path changed before it was read");
    }
    const content = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < content.length) {
      const result = await handle.read(content, offset, content.length - offset, offset);
      if (result.bytesRead === 0) throw new TypeError("Isolated preview target became shorter");
      offset += result.bytesRead;
    }
    const probe = Buffer.allocUnsafe(1);
    if ((await handle.read(probe, 0, 1, content.length)).bytesRead !== 0) {
      throw new TypeError("Isolated preview target grew while it was read");
    }
    const after = await handle.stat();
    const finalPath = await inspectTarget();
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      finalPath.targetStat.dev !== opened.dev ||
      finalPath.targetStat.ino !== opened.ino ||
      finalPath.targetStat.size !== opened.size
    ) {
      throw new TypeError("Isolated preview target changed while it was read");
    }
    return content;
  } finally {
    await handle.close();
  }
}

export async function GET(): Promise<Response> {
  let source: Buffer;
  try {
    source = await readSealedTarget();
  } catch {
    return Response.json(
      { error: "Isolated preview source path is no longer safe" },
      { status: 409, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
    );
  }
  const contentHash = \`sha256:\${createHash("sha256").update(source).digest("hex")}\`;
  if (contentHash !== EXPECTED_HASH) {
    return Response.json(
      { error: "Isolated preview source no longer matches its sealed identity" },
      { status: 409, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
    );
  }
  return Response.json(
    {
      schemaVersion: ${JSON.stringify(PREVIEW_SCHEMA)},
      evolutionId: ${JSON.stringify(evolutionId)},
      targetPath: TARGET_PATH,
      view: ${JSON.stringify(view)},
      contentHash,
    },
    { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
`;
}

function git(root, args, encoding = "utf8") {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    shell: false,
    windowsHide: true,
  });
  if (result.error !== undefined) {
    throw new TypeError(`Unable to run git ${args.join(" ")}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = typeof result.stderr === "string"
      ? result.stderr.trim()
      : Buffer.from(result.stderr ?? []).toString("utf8").trim();
    throw new TypeError(detail || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function inspectTrackedFile(root, relativePath) {
  const segments = relativePath.split("/");
  let sourcePath = root;
  let sourceStat;
  for (const [index, segment] of segments.entries()) {
    sourcePath = path.join(sourcePath, segment);
    const stat = await lstat(sourcePath);
    const final = index === segments.length - 1;
    if (
      stat.isSymbolicLink() ||
      (!final && !stat.isDirectory()) ||
      (final && !stat.isFile())
    ) {
      throw new TypeError(`Tracked preview input traverses an unsafe path: ${relativePath}`);
    }
    if (final) sourceStat = stat;
  }
  if (sourceStat === undefined) {
    throw new TypeError(`Tracked preview input is empty: ${relativePath}`);
  }
  return { sourcePath, sourceStat };
}

async function readTrackedFile(root, relativePath, maximumBytes) {
  const initial = await inspectTrackedFile(root, relativePath);
  if (initial.sourceStat.size > maximumBytes) {
    throw new TypeError("Tracked host bytes exceed the preview bound");
  }
  const handle = await open(
    initial.sourcePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      !sameFile(opened, initial.sourceStat) ||
      opened.size !== initial.sourceStat.size ||
      opened.size > maximumBytes
    ) {
      throw new TypeError(`Tracked file changed between validation and open: ${relativePath}`);
    }
    const openedPath = await inspectTrackedFile(root, relativePath);
    if (!sameFile(openedPath.sourceStat, opened) || openedPath.sourceStat.size !== opened.size) {
      throw new TypeError(`Tracked path changed while preview was captured: ${relativePath}`);
    }
    const content = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < content.length) {
      const result = await handle.read(content, offset, content.length - offset, offset);
      if (result.bytesRead === 0) {
        throw new TypeError(`Tracked file became shorter while preview was captured: ${relativePath}`);
      }
      offset += result.bytesRead;
    }
    const probe = Buffer.allocUnsafe(1);
    if ((await handle.read(probe, 0, 1, content.length)).bytesRead !== 0) {
      throw new TypeError(`Tracked file grew while preview was captured: ${relativePath}`);
    }
    const after = await handle.stat();
    const finalPath = await inspectTrackedFile(root, relativePath);
    if (
      !sameFile(after, opened) ||
      !sameFile(finalPath.sourceStat, opened) ||
      after.size !== opened.size ||
      finalPath.sourceStat.size !== opened.size
    ) {
      throw new TypeError(`Tracked file changed while preview was captured: ${relativePath}`);
    }
    return { content, mode: opened.mode & 0o777 };
  } finally {
    await handle.close();
  }
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function samePath(left, right) {
  return path.relative(left, right) === "";
}

async function resolveMissingOutput(input) {
  const absolute = path.resolve(input);
  const parent = await realpath(path.dirname(absolute));
  const resolved = path.join(parent, path.basename(absolute));
  try {
    await lstat(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") return resolved;
    throw error;
  }
  throw new TypeError(`Preview output already exists: ${resolved}`);
}

async function selectState(root, evolutionId) {
  if (evolutionId !== null) return getEvolutionStatus(root, evolutionId);
  const candidates = [...await listEvolutionStatuses(root)]
    .filter((summary) => summary.status === "prepared" || summary.status === "approved")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  if (candidates.length !== 1) {
    throw new TypeError("Expected exactly one prepared or approved evolution; pass --evolution explicitly");
  }
  return getEvolutionStatus(root, candidates[0].evolutionId);
}

async function writeView(output, files, state, view) {
  await mkdir(output, { recursive: false });
  for (const file of files) {
    const destination = path.join(output, ...file.relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content, { flag: "wx", mode: file.mode });
  }
  const targetPath = state.artifact.target.path;
  const target = path.join(output, ...targetPath.split("/"));
  const source = view === "postimage"
    ? Buffer.from(state.source.postimage, "utf8")
    : Buffer.from(state.source.preimage, "utf8");
  await writeFile(target, source, { flag: "w" });
  const expectedHash = view === "postimage"
    ? state.artifact.target.postimageHash
    : state.artifact.target.preimageHash;
  if (sha256(await readFile(target)) !== expectedHash) {
    throw new TypeError(`Written ${view} does not match its sealed source hash`);
  }
  const route = path.join(output, ...PREVIEW_ROUTE_PATH.split("/"));
  await mkdir(path.dirname(route), { recursive: true });
  await writeFile(route, renderPreviewIdentityRoute({
    evolutionId: state.evolutionId,
    expectedHash,
    targetPath,
    view,
  }), { encoding: "utf8", flag: "wx" });
}

export async function createHostPreview(options) {
  const root = await realpath(path.resolve(options.root));
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new TypeError("Host root must be a real directory");
  }
  const output = await resolveMissingOutput(options.out);
  const beforeOutput = options.beforeOut === null
    ? null
    : await resolveMissingOutput(options.beforeOut);
  for (const candidate of [output, ...(beforeOutput === null ? [] : [beforeOutput])]) {
    if (samePath(candidate, root) || inside(root, candidate) || inside(candidate, root)) {
      throw new TypeError("Preview outputs must be separate from the connected host");
    }
  }
  if (beforeOutput !== null && samePath(beforeOutput, output)) {
    throw new TypeError("Before and proposed preview outputs must be different");
  }

  const trackedStatus = Buffer.from(
    git(root, ["status", "--porcelain", "--untracked-files=no"], "buffer"),
  );
  const revision = String(git(root, ["rev-parse", "HEAD"])).trim();
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(revision)) {
    throw new TypeError("Git returned an invalid host revision");
  }
  const trackedFiles = parseTrackedFileOutput(
    git(root, ["ls-files", "-z"], "buffer"),
  );
  if (trackedFiles.length === 0 || trackedFiles.length > MAX_TRACKED_FILES) {
    throw new TypeError("Tracked-file set is empty or exceeds the preview file-count bound");
  }
  if (trackedFiles.includes(PREVIEW_ROUTE_PATH)) {
    throw new TypeError("Host already owns the reserved preview identity route");
  }

  const state = await selectState(root, options.evolutionId);
  if (state.status !== "prepared" && state.status !== "approved") {
    throw new TypeError("Preview creation requires a prepared or approved evolution");
  }
  const targetPath = assertSafeTrackedPath(state.artifact.target.path);
  if (!trackedFiles.includes(targetPath)) {
    throw new TypeError("Evolution target is not a tracked host source file");
  }

  let totalBytes = 0;
  const files = [];
  for (const relativePath of trackedFiles) {
    const captured = await readTrackedFile(
      root,
      relativePath,
      MAX_TRACKED_BYTES - totalBytes,
    );
    totalBytes += captured.content.length;
    files.push({ relativePath, ...captured });
  }
  const finalRevision = String(git(root, ["rev-parse", "HEAD"])).trim();
  const finalTrackedStatus = Buffer.from(
    git(root, ["status", "--porcelain", "--untracked-files=no"], "buffer"),
  );
  assertStableTrackedSnapshot(revision, trackedStatus, finalRevision, finalTrackedStatus);
  const target = files.find((file) => file.relativePath === targetPath);
  if (target === undefined || sha256(target.content) !== state.artifact.target.preimageHash) {
    throw new TypeError("Connected host no longer matches the prepared target preimage");
  }

  try {
    if (beforeOutput !== null) await writeView(beforeOutput, files, state, "preimage");
    await writeView(output, files, state, "postimage");
  } catch (error) {
    throw new Error(`Preview creation failed; inspect partial outputs: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    output,
    beforeOutput,
    sourceRevision: revision,
    evolutionId: state.evolutionId,
    targetPath,
    preimageHash: state.artifact.target.preimageHash,
    postimageHash: state.artifact.target.postimageHash,
    trackedFileCount: files.length,
    trackedBytes: totalBytes,
  };
}

async function main() {
  const args = parseHostPreviewArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await createHostPreview(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write("\nInstall dependencies and start each isolated view on its own loopback port.\n");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
