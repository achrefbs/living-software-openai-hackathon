import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { canonicalJson, runRootCommand, sha256 } from "@living-software/cli";
import { parseStudioSnapshot } from "@living-software/contracts";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const STUDIO_ROOT = path.join(REPOSITORY_ROOT, "apps", "studio");
const LOCAL_DIRECTORY = path.join(STUDIO_ROOT, ".local");
const SNAPSHOT_PATH = path.join(LOCAL_DIRECTORY, "studio-snapshot.json");
const CONNECTION_PATH = path.join(LOCAL_DIRECTORY, "studio-connection.json");

function usage() {
  return "Usage: npm run studio:sync -- --root <instrumented-next-app>";
}

export function parseRoot(argv) {
  if (argv.length !== 2 || argv[0] !== "--root" || !argv[1]) {
    throw new TypeError(usage());
  }
  return argv[1];
}

async function optionalStat(candidate) {
  try {
    return await lstat(candidate);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function assertSafeLocalTarget() {
  const studioRoot = await realpath(STUDIO_ROOT);
  if (studioRoot !== STUDIO_ROOT) {
    throw new TypeError("Studio root must resolve to its expected repository path");
  }
  const localStat = await optionalStat(LOCAL_DIRECTORY);
  if (localStat !== undefined && (!localStat.isDirectory() || localStat.isSymbolicLink())) {
    throw new TypeError("apps/studio/.local must be a regular directory, not a symlink");
  }
  await mkdir(LOCAL_DIRECTORY, { recursive: true });
  const targetStat = await optionalStat(SNAPSHOT_PATH);
  if (targetStat !== undefined && (!targetStat.isFile() || targetStat.isSymbolicLink())) {
    throw new TypeError("The existing Studio snapshot must be a regular file");
  }
  const connectionStat = await optionalStat(CONNECTION_PATH);
  if (
    connectionStat !== undefined &&
    (!connectionStat.isFile() || connectionStat.isSymbolicLink())
  ) {
    throw new TypeError("The existing Studio connection must be a regular file");
  }
}

export function assertSyntheticSnapshot(snapshot) {
  if (snapshot.application.dataOrigin !== "synthetic") {
    throw new TypeError(
      `Refusing Studio sync for ${snapshot.application.dataOrigin} evidence; only explicitly synthetic captures are allowed.`,
    );
  }
  return snapshot;
}

export async function syncSnapshot(hostRoot) {
  const resolvedHostRoot = await realpath(hostRoot);
  const snapshot = assertSyntheticSnapshot(parseStudioSnapshot(
    await runRootCommand("snapshot", { root: resolvedHostRoot }),
  ));

  await assertSafeLocalTarget();
  const content = canonicalJson(snapshot, true);
  const connection = canonicalJson({
    schemaVersion: "living.studio-local-connection/v1",
    hostRoot: resolvedHostRoot,
    appId: snapshot.application.appId,
    manifestHash: snapshot.application.manifestHash,
    opportunityId: snapshot.opportunity?.opportunityId ?? null,
    eventSetHash: snapshot.opportunity?.evidence.eventSetHash ?? null,
    snapshotHash: sha256(snapshot),
  }, true);
  const existing = await optionalStat(SNAPSHOT_PATH);
  const existingConnection = await optionalStat(CONNECTION_PATH);
  const snapshotUnchanged =
    existing !== undefined &&
    (await readFile(SNAPSHOT_PATH, "utf8")) === content;
  const connectionUnchanged =
    existingConnection !== undefined &&
    (await readFile(CONNECTION_PATH, "utf8")) === connection;
  if (snapshotUnchanged && connectionUnchanged) {
    return { changed: false, snapshot };
  }

  const nonce = `${process.pid}.${Date.now()}`;
  const temporaryPath = path.join(LOCAL_DIRECTORY, `.studio-snapshot.${nonce}.tmp`);
  const temporaryConnectionPath = path.join(
    LOCAL_DIRECTORY,
    `.studio-connection.${nonce}.tmp`,
  );
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await writeFile(temporaryConnectionPath, connection, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, SNAPSHOT_PATH);
    await rename(temporaryConnectionPath, CONNECTION_PATH);
  } finally {
    await rm(temporaryPath, { force: true });
    await rm(temporaryConnectionPath, { force: true });
  }
  return { changed: true, snapshot };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const hostRoot = parseRoot(process.argv.slice(2));
  const { changed, snapshot } = await syncSnapshot(hostRoot);
  process.stdout.write(
    `${changed ? "Wrote" : "Unchanged"} ${path.relative(REPOSITORY_ROOT, SNAPSHOT_PATH)}\n` +
      `${snapshot.application.displayName}: ${snapshot.workflows.cases.length} cases, ` +
      `${snapshot.productManifest.nodes.length} mapped nodes, ${snapshot.evidence.events} events\n`,
  );
}
