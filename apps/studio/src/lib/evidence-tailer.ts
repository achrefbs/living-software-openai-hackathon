import "server-only";

import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

import {
  EvidenceIntegrityError,
  parseEvidenceNdjson,
  type CollectorDefinition,
} from "@living-software/collector";
import type { EvidenceBatchRecord } from "@living-software/contracts";

const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;

type FileIdentity = Readonly<{
  device: number;
  inode: number;
}>;

export type EvidenceTailSnapshot = Readonly<{
  status: "missing" | "partial" | "ready" | "unchanged";
  records: readonly EvidenceBatchRecord[];
  newRecords: readonly EvidenceBatchRecord[];
  partialBytes: number;
  totalBytes: number;
  chainHead: string | null;
}>;

export class LiveEvidenceIntegrityError extends Error {
  constructor(
    public readonly code:
      | "evidence-deleted"
      | "evidence-truncated"
      | "evidence-replaced"
      | "evidence-symlink"
      | "evidence-corrupt"
      | "evidence-raced"
      | "evidence-too-large",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LiveEvidenceIntegrityError";
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function identity(stat: Readonly<{ dev: number; ino: number }>): FileIdentity {
  return { device: stat.dev, inode: stat.ino };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.device === right.device && left.inode === right.inode;
}

async function assertSafeParentChain(root: string, candidate: string): Promise<void> {
  const relative = path.relative(root, candidate);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new LiveEvidenceIntegrityError(
      "evidence-symlink",
      "Evidence path escaped the canonical host root",
    );
  }
  let cursor = root;
  const segments = relative.split(path.sep);
  for (const segment of segments.slice(0, -1)) {
    cursor = path.join(cursor, segment);
    let stat;
    try {
      stat = await lstat(cursor);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new LiveEvidenceIntegrityError(
        "evidence-symlink",
        "Evidence parent components must be real directories",
      );
    }
  }
  const parent = await realpath(path.dirname(candidate)).catch((error) => {
    if (isMissing(error)) return null;
    throw error;
  });
  if (parent !== null) {
    const parentRelative = path.relative(root, parent);
    if (
      parentRelative === ".." ||
      parentRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(parentRelative)
    ) {
      throw new LiveEvidenceIntegrityError(
        "evidence-symlink",
        "Evidence parent resolved outside the canonical host root",
      );
    }
  }
}

async function assertOpenedPathIsStillSafe(
  root: string,
  candidate: string,
  openedIdentity: FileIdentity,
): Promise<Readonly<{ size: number }>> {
  await assertSafeParentChain(root, candidate);
  let pathStat;
  try {
    pathStat = await lstat(candidate);
  } catch (error) {
    throw new LiveEvidenceIntegrityError(
      "evidence-raced",
      "Evidence disappeared while its open handle was being validated",
      { cause: error },
    );
  }
  if (pathStat.isSymbolicLink() || !pathStat.isFile()) {
    throw new LiveEvidenceIntegrityError(
      "evidence-symlink",
      "The active release evidence path became unsafe while it was open",
    );
  }
  if (!sameIdentity(identity(pathStat), openedIdentity)) {
    throw new LiveEvidenceIntegrityError(
      "evidence-raced",
      "Evidence path identity changed while its open handle was being validated",
    );
  }
  return Object.freeze({ size: pathStat.size });
}

async function readExactBounded(
  handle: Awaited<ReturnType<typeof open>>,
  size: number,
): Promise<Buffer> {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const result = await handle.read(bytes, offset, size - offset, offset);
    if (result.bytesRead === 0) {
      throw new LiveEvidenceIntegrityError(
        "evidence-raced",
        "Evidence became shorter while the live monitor was reading it",
      );
    }
    offset += result.bytesRead;
  }
  return bytes;
}

export class ReleaseEvidenceTailer {
  private previousIdentity: FileIdentity | null = null;
  private previousSize = 0;
  private previousRecordHashes: readonly string[] = Object.freeze([]);
  private previousRecords: readonly EvidenceBatchRecord[] = Object.freeze([]);
  private observedFile = false;
  private stopped = false;
  private serial: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly hostRoot: string,
    private readonly evidencePath: string,
    private readonly definition: CollectorDefinition,
  ) {}

  stop(): void {
    this.stopped = true;
  }

  anchor(): Readonly<{
    recordCount: number;
    chainHead: string | null;
    totalBytes: number;
  }> {
    return Object.freeze({
      recordCount: this.previousRecords.length,
      chainHead: this.previousRecords.at(-1)?.recordHash ?? null,
      totalBytes: this.previousSize,
    });
  }

  async read(): Promise<EvidenceTailSnapshot> {
    const operation = this.serial.then(() => this.readSerialized());
    this.serial = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async readSerialized(): Promise<EvidenceTailSnapshot> {
    if (this.stopped) {
      throw new LiveEvidenceIntegrityError(
        "evidence-corrupt",
        "Evidence monitoring stopped after an integrity failure",
      );
    }
    try {
      return await this.readUnsafe();
    } catch (error) {
      if (error instanceof LiveEvidenceIntegrityError) this.stopped = true;
      throw error;
    }
  }

  private async readUnsafe(): Promise<EvidenceTailSnapshot> {
    const hostRoot = await realpath(this.hostRoot);
    const evidencePath = path.resolve(this.evidencePath);
    await assertSafeParentChain(hostRoot, evidencePath);
    let before;
    try {
      before = await lstat(evidencePath);
    } catch (error) {
      if (isMissing(error)) {
        if (this.observedFile) {
          throw new LiveEvidenceIntegrityError(
            "evidence-deleted",
            "The active release evidence file was deleted after validation",
          );
        }
        return Object.freeze({
          status: "missing",
          records: Object.freeze([]),
          newRecords: Object.freeze([]),
          partialBytes: 0,
          totalBytes: 0,
          chainHead: null,
        });
      }
      throw error;
    }
    if (!before.isFile() || before.isSymbolicLink()) {
      throw new LiveEvidenceIntegrityError(
        "evidence-symlink",
        "The active release evidence path is not a regular non-symlink file",
      );
    }
    if (before.size > MAX_EVIDENCE_BYTES) {
      throw new LiveEvidenceIntegrityError(
        "evidence-too-large",
        `Evidence exceeds the ${MAX_EVIDENCE_BYTES}-byte live-monitor bound`,
      );
    }
    const currentIdentity = identity(before);
    if (
      this.previousIdentity !== null &&
      !sameIdentity(currentIdentity, this.previousIdentity)
    ) {
      throw new LiveEvidenceIntegrityError(
        "evidence-replaced",
        "The active release evidence file identity changed after validation",
      );
    }
    if (this.observedFile && before.size < this.previousSize) {
      throw new LiveEvidenceIntegrityError(
        "evidence-truncated",
        "The active release evidence file became shorter after validation",
      );
    }

    const noFollow = constants.O_NOFOLLOW ?? 0;
    const handle = await open(evidencePath, constants.O_RDONLY | noFollow);
    let bytes: Buffer;
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        !sameIdentity(identity(opened), currentIdentity) ||
        opened.size !== before.size ||
        opened.size > MAX_EVIDENCE_BYTES
      ) {
        throw new LiveEvidenceIntegrityError(
          "evidence-raced",
          "Evidence changed between path validation and open",
        );
      }
      await assertOpenedPathIsStillSafe(hostRoot, evidencePath, currentIdentity);
      bytes = await readExactBounded(handle, opened.size);
      const after = await handle.stat();
      const finalPath = await assertOpenedPathIsStillSafe(
        hostRoot,
        evidencePath,
        currentIdentity,
      );
      if (
        !sameIdentity(identity(after), currentIdentity) ||
        after.size < opened.size ||
        finalPath.size < opened.size ||
        bytes.length !== before.size
      ) {
        throw new LiveEvidenceIntegrityError(
          "evidence-raced",
          "Evidence changed while the live monitor was reading it",
        );
      }
      if (after.size > MAX_EVIDENCE_BYTES || finalPath.size > MAX_EVIDENCE_BYTES) {
        throw new LiveEvidenceIntegrityError(
          "evidence-too-large",
          `Evidence exceeds the ${MAX_EVIDENCE_BYTES}-byte live-monitor bound`,
        );
      }
    } finally {
      await handle.close();
    }
    const finalNewline = bytes.lastIndexOf(0x0a);
    const committedBytes = finalNewline < 0
      ? bytes.subarray(0, 0)
      : bytes.subarray(0, finalNewline + 1);
    const committed = committedBytes.toString("utf8");
    if (!Buffer.from(committed, "utf8").equals(committedBytes)) {
      throw new LiveEvidenceIntegrityError(
        "evidence-corrupt",
        "Committed evidence is not valid UTF-8",
      );
    }
    const partialBytes = bytes.length - committedBytes.length;
    let records: readonly EvidenceBatchRecord[];
    try {
      records = committed === ""
        ? Object.freeze([])
        : parseEvidenceNdjson(committed, this.definition);
    } catch (error) {
      throw new LiveEvidenceIntegrityError(
        "evidence-corrupt",
        "A completed evidence record failed collector chain validation",
        { cause: error instanceof EvidenceIntegrityError ? error : undefined },
      );
    }
    if (records.length < this.previousRecordHashes.length) {
      throw new LiveEvidenceIntegrityError(
        "evidence-truncated",
        "Validated evidence records were removed from the active release",
      );
    }
    for (const [index, recordHash] of this.previousRecordHashes.entries()) {
      if (records[index]?.recordHash !== recordHash) {
        throw new LiveEvidenceIntegrityError(
          "evidence-replaced",
          "Previously validated evidence content changed in place",
        );
      }
    }
    const newRecords = Object.freeze(
      records.slice(this.previousRecordHashes.length),
    );
    const unchanged =
      newRecords.length === 0 &&
      partialBytes === 0 &&
      bytes.length === this.previousSize;
    this.observedFile = true;
    this.previousIdentity = currentIdentity;
    this.previousSize = bytes.length;
    this.previousRecords = Object.freeze([...records]);
    this.previousRecordHashes = Object.freeze(
      records.map((record) => record.recordHash),
    );
    return Object.freeze({
      status: unchanged
        ? "unchanged"
        : partialBytes > 0
          ? "partial"
          : "ready",
      records: this.previousRecords,
      newRecords,
      partialBytes,
      totalBytes: bytes.length,
      chainHead: records.at(-1)?.recordHash ?? null,
    });
  }
}
