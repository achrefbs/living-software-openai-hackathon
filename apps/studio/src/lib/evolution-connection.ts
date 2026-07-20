import "server-only";

import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { sha256 } from "@living-software/cli";
import { parseStudioSnapshot } from "@living-software/contracts";

const CONNECTION_PATH = path.join(
  process.cwd(),
  ".local",
  "studio-connection.json",
);
const SNAPSHOT_PATH = path.join(
  process.cwd(),
  ".local",
  "studio-snapshot.json",
);
const MAX_CONNECTION_BYTES = 4 * 1024;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u;

export type StudioEvolutionConnection = Readonly<{
  schemaVersion: "living.studio-local-connection/v1";
  hostRoot: string;
  appId: string;
  manifestHash: string;
  opportunityId: string | null;
  eventSetHash: string | null;
  snapshotHash: string;
}>;

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export async function loadStudioEvolutionConnection(): Promise<
  StudioEvolutionConnection | null
> {
  let stat;
  try {
    stat = await lstat(CONNECTION_PATH);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 1 ||
    stat.size > MAX_CONNECTION_BYTES
  ) {
    throw new TypeError("Studio local connection is not a bounded regular file");
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(await readFile(CONNECTION_PATH, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new TypeError("Studio local connection is not valid JSON");
    }
    throw error;
  }
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new TypeError("Studio local connection must be an object");
  }
  const record = candidate as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !==
      "appId,eventSetHash,hostRoot,manifestHash,opportunityId,schemaVersion,snapshotHash" ||
    record.schemaVersion !== "living.studio-local-connection/v1" ||
    typeof record.hostRoot !== "string" ||
    typeof record.appId !== "string" ||
    !IDENTIFIER.test(record.appId) ||
    typeof record.manifestHash !== "string" ||
    !SHA256.test(record.manifestHash) ||
    !(
      record.opportunityId === null ||
      (typeof record.opportunityId === "string" && IDENTIFIER.test(record.opportunityId))
    ) ||
    !(
      record.eventSetHash === null ||
      (typeof record.eventSetHash === "string" && SHA256.test(record.eventSetHash))
    ) ||
    (record.opportunityId === null) !== (record.eventSetHash === null) ||
    typeof record.snapshotHash !== "string" ||
    !SHA256.test(record.snapshotHash)
  ) {
    throw new TypeError("Studio local connection failed validation");
  }
  const hostRoot = await realpath(record.hostRoot);
  const snapshotStat = await lstat(SNAPSHOT_PATH);
  if (
    !snapshotStat.isFile() ||
    snapshotStat.isSymbolicLink() ||
    snapshotStat.size < 1 ||
    snapshotStat.size > 10 * 1024 * 1024
  ) {
    throw new TypeError("Studio snapshot is not a bounded regular file");
  }
  let snapshotCandidate: unknown;
  try {
    snapshotCandidate = JSON.parse(
      await readFile(SNAPSHOT_PATH, "utf8"),
    ) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new TypeError("Studio snapshot is not valid JSON");
    }
    throw error;
  }
  const snapshot = parseStudioSnapshot(snapshotCandidate);
  if (
    sha256(snapshot) !== record.snapshotHash ||
    snapshot.application.appId !== record.appId ||
    snapshot.application.manifestHash !== record.manifestHash ||
    (snapshot.opportunity?.opportunityId ?? null) !== record.opportunityId ||
    (snapshot.opportunity?.evidence.eventSetHash ?? null) !== record.eventSetHash
  ) {
    throw new TypeError(
      "Studio connection and visible snapshot are not the same exact export",
    );
  }
  return Object.freeze({
    schemaVersion: record.schemaVersion,
    hostRoot,
    appId: record.appId,
    manifestHash: record.manifestHash,
    opportunityId: record.opportunityId,
    eventSetHash: record.eventSetHash,
    snapshotHash: record.snapshotHash,
  });
}
