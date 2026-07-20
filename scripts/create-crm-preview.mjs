#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  getEvolutionStatus,
  listEvolutionStatuses,
} from "../packages/evolution/dist/index.js";

const PREVIEW_ROUTE_PATH = "src/app/api/living-preview/route.ts";
const PREVIEW_SCHEMA = "living.preview-identity/v1";
const MAX_TRACKED_FILES = 20_000;
const MAX_GIT_BYTES = 16 * 1024 * 1024;

function usage() {
  return [
    "Create an isolated, hash-verifying CRM postimage preview.",
    "",
    "Usage:",
    "  npm run preview:crm -- --root <crm-root> --out <empty-output-path> [--evolution <id>]",
    "",
    "The command copies only tracked files from a clean CRM worktree, writes the",
    "prepared postimage, and adds GET /api/living-preview. It never edits the CRM.",
  ].join("\n");
}

export function parsePreviewArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (
      (key !== "--root" && key !== "--out" && key !== "--evolution") ||
      value === undefined ||
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
    evolutionId: values.get("--evolution") ?? null,
  };
}

export function assertSafeTrackedPath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (
    normalized === "" ||
    normalized.startsWith("/") ||
    normalized.split("/").some((segment) => segment === "" || segment === "..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new TypeError(`Unsafe tracked path '${relativePath}'`);
  }
  return normalized;
}

export function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function renderPreviewIdentityRoute({
  evolutionId,
  postHash,
  targetPath,
}) {
  return `import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPECTED_POST_HASH = ${JSON.stringify(postHash)};
const TARGET_PATH = ${JSON.stringify(targetPath)};

export async function GET(): Promise<Response> {
  const target = path.join(process.cwd(), ...TARGET_PATH.split("/"));
  const source = await readFile(target);
  const postHash = \`sha256:\${createHash("sha256").update(source).digest("hex")}\`;
  if (postHash !== EXPECTED_POST_HASH) {
    return Response.json(
      { error: "Isolated preview source no longer matches the prepared postimage" },
      {
        status: 409,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  }
  return Response.json(
    {
      schemaVersion: ${JSON.stringify(PREVIEW_SCHEMA)},
      evolutionId: ${JSON.stringify(evolutionId)},
      postHash,
      targetPath: TARGET_PATH,
    },
    {
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
`;
}

function git(root, args, encoding = "utf8") {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding,
    maxBuffer: MAX_GIT_BYTES,
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail =
      typeof result.stderr === "string"
        ? result.stderr.trim()
        : Buffer.from(result.stderr ?? []).toString("utf8").trim();
    throw new TypeError(detail || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function requireMissing(target) {
  try {
    await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new TypeError("Preview output path already exists; choose a new empty path");
}

async function selectState(root, evolutionId) {
  if (evolutionId !== null) {
    return getEvolutionStatus(root, evolutionId);
  }
  const summaries = await listEvolutionStatuses(root);
  const candidates = [...summaries]
    .filter((summary) => summary.status === "prepared" || summary.status === "approved")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  if (candidates.length !== 1) {
    throw new TypeError(
      "Expected exactly one prepared or approved evolution; pass --evolution explicitly",
    );
  }
  return getEvolutionStatus(root, candidates[0].evolutionId);
}

export async function createCrmPreview(options) {
  const root = await realpath(path.resolve(options.root));
  const out = path.resolve(options.out);
  const outParent = await realpath(path.dirname(out));
  const resolvedOut = path.join(outParent, path.basename(out));
  if (
    resolvedOut === root ||
    isInside(root, resolvedOut) ||
    isInside(resolvedOut, root)
  ) {
    throw new TypeError("Preview output must be separate from the CRM worktree");
  }
  await requireMissing(resolvedOut);

  const trackedStatus = String(
    git(root, ["status", "--porcelain", "--untracked-files=no"]),
  ).trim();
  if (trackedStatus !== "") {
    throw new TypeError("CRM tracked files must be clean before preview creation");
  }
  const revision = String(git(root, ["rev-parse", "HEAD"])).trim();
  const trackedOutput = git(root, ["ls-files", "-z"], "buffer");
  const trackedFiles = Buffer.from(trackedOutput)
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(assertSafeTrackedPath);
  if (trackedFiles.length === 0 || trackedFiles.length > MAX_TRACKED_FILES) {
    throw new TypeError("CRM tracked-file set is empty or exceeds the preview bound");
  }
  if (trackedFiles.includes(PREVIEW_ROUTE_PATH)) {
    throw new TypeError("CRM already owns the reserved preview identity route");
  }

  const state = await selectState(root, options.evolutionId);
  if (state.status !== "prepared" && state.status !== "approved") {
    throw new TypeError("Preview creation requires a prepared or approved evolution");
  }
  const targetPath = assertSafeTrackedPath(state.artifact.target.path);
  if (!trackedFiles.includes(targetPath)) {
    throw new TypeError("Evolution target is not a tracked preview source file");
  }
  const targetSource = await readFile(
    path.join(root, ...targetPath.split("/")),
  );
  if (sha256(targetSource) !== state.artifact.target.preimageHash) {
    throw new TypeError("Connected CRM no longer matches the prepared preimage");
  }

  const sourceFiles = [];
  for (const relativePath of trackedFiles) {
    const sourcePath = path.join(root, ...relativePath.split("/"));
    const metadata = await lstat(sourcePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new TypeError(`Tracked preview input is not a regular file: ${relativePath}`);
    }
    sourceFiles.push({ relativePath, sourcePath });
  }

  await mkdir(resolvedOut, { recursive: false });
  try {
    for (const file of sourceFiles) {
      const destination = path.join(resolvedOut, ...file.relativePath.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(file.sourcePath, destination);
    }
    const outputTarget = path.join(
      resolvedOut,
      ...targetPath.split("/"),
    );
    await writeFile(outputTarget, state.source.postimage, {
      encoding: "utf8",
      flag: "w",
    });
    const writtenPostimage = await readFile(outputTarget);
    if (sha256(writtenPostimage) !== state.artifact.target.postimageHash) {
      throw new TypeError("Written preview does not match the prepared postimage");
    }
    const routePath = path.join(resolvedOut, ...PREVIEW_ROUTE_PATH.split("/"));
    await mkdir(path.dirname(routePath), { recursive: true });
    await writeFile(
      routePath,
      renderPreviewIdentityRoute({
        evolutionId: state.evolutionId,
        postHash: state.artifact.target.postimageHash,
        targetPath: state.artifact.target.path,
      }),
      { encoding: "utf8", flag: "wx" },
    );
  } catch (error) {
    throw new Error(
      `Preview creation failed; inspect the partial output at ${resolvedOut}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    output: resolvedOut,
    sourceRevision: revision,
    evolutionId: state.evolutionId,
    preHash: state.artifact.target.preimageHash,
    postHash: state.artifact.target.postimageHash,
  };
}

async function main() {
  const args = parsePreviewArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const result = await createCrmPreview(args);
  console.log(JSON.stringify(result, null, 2));
  console.log("\nNext:");
  console.log(`  cd ${result.output}`);
  console.log("  npm install");
  console.log("  npm run build");
  console.log("  npm run start -- --hostname 127.0.0.1 --port 3002");
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
