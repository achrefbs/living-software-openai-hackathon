import "server-only";

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import { parseStudioSnapshot } from "@living-software/contracts";

import {
  fixtureStudioDataset,
  studioDatasetFromSnapshot,
} from "@/lib/studio-snapshot";
import type { PreviewMode, StudioDataset } from "@/lib/studio-types";

export const LOCAL_SNAPSHOT_RELATIVE_PATH = ".local/studio-snapshot.json";
const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
const DEFAULT_SNAPSHOT_PATH = path.join(
  process.cwd(),
  ".local",
  "studio-snapshot.json",
);

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export async function loadStudioDataset(
  snapshotPath = DEFAULT_SNAPSHOT_PATH,
): Promise<StudioDataset> {
  let stat;
  try {
    stat = await lstat(snapshotPath);
  } catch (error) {
    if (isMissing(error)) return fixtureStudioDataset();
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new TypeError(`Studio snapshot must be a regular non-symlink file: ${snapshotPath}`);
  }
  if (stat.size > MAX_SNAPSHOT_BYTES) {
    throw new TypeError(`Studio snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes`);
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(await readFile(snapshotPath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new TypeError(`Studio snapshot is not valid JSON: ${snapshotPath}`, {
        cause: error,
      });
    }
    throw error;
  }
  return studioDatasetFromSnapshot(parseStudioSnapshot(candidate));
}

export function getStudioDataset(): Promise<StudioDataset> {
  // studio:sync may replace the captured snapshot while the dev server keeps
  // running. Always reload it so a browser refresh cannot render stale
  // evidence against a newer broker connection.
  return loadStudioDataset();
}

export async function getStudioApp(appId: string) {
  const dataset = await getStudioDataset();
  return dataset.app.id === appId ? dataset.app : null;
}

export function getPreviewMode(
  value: string | string[] | undefined,
): PreviewMode {
  const mode = Array.isArray(value) ? value[0] : value;

  if (
    mode === "empty" ||
    mode === "disconnected" ||
    mode === "error"
  ) {
    return mode;
  }

  return "data";
}

export { formatDuration, formatPercent } from "@/lib/format";
