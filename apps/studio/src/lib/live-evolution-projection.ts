import "server-only";

import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

import type { EvolutionReceipt, LiveView } from "@living-software/contracts";
import type { SourceEvolutionState } from "@living-software/evolution";

const MAX_SOURCE_BYTES = 2_000_000;
const MAX_DIFF_LINES = 2_000;
const MAX_DIFF_BYTES = 100_000;

function safeSegments(relativePath: string): string[] {
  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    normalized !== relativePath ||
    normalized.length === 0 ||
    normalized.length > 512 ||
    /[\u0000-\u001f\u007f]/u.test(normalized) ||
    /^[A-Za-z]:\//u.test(normalized) ||
    path.isAbsolute(relativePath) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new TypeError("Evolution target is not a canonical repository-relative path");
  }
  return segments;
}

function sameFile(
  left: Readonly<{ dev: number; ino: number }>,
  right: Readonly<{ dev: number; ino: number }>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function inspectTarget(root: string, segments: readonly string[]) {
  let target = root;
  let targetStat: Stats | undefined;
  for (const [index, segment] of segments.entries()) {
    target = path.join(target, segment);
    const stat = await lstat(target);
    const final = index === segments.length - 1;
    if (
      stat.isSymbolicLink() ||
      (!final && !stat.isDirectory()) ||
      (final && (!stat.isFile() || stat.size > MAX_SOURCE_BYTES))
    ) {
      throw new TypeError("Evolution target traverses an unsafe path");
    }
    if (final) targetStat = stat;
  }
  if (targetStat === undefined) {
    throw new TypeError("Evolution target is empty");
  }
  return { target, targetStat };
}

async function readExactTarget(
  handle: Awaited<ReturnType<typeof open>>,
  size: number,
): Promise<Buffer> {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const result = await handle.read(bytes, offset, size - offset, offset);
    if (result.bytesRead === 0) {
      throw new TypeError("Evolution target became shorter while its source hash was read");
    }
    offset += result.bytesRead;
  }
  const probe = Buffer.allocUnsafe(1);
  if ((await handle.read(probe, 0, 1, size)).bytesRead !== 0) {
    throw new TypeError("Evolution target grew while its source hash was read");
  }
  return bytes;
}

export async function readCurrentTargetHash(
  rootInput: string,
  targetPath: string,
): Promise<`sha256:${string}`> {
  const root = await realpath(rootInput);
  const segments = safeSegments(targetPath);
  const { target, targetStat } = await inspectTarget(root, segments);
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const handle = await open(target, constants.O_RDONLY | noFollow);
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      before.size > MAX_SOURCE_BYTES ||
      before.size !== targetStat.size ||
      !sameFile(before, targetStat)
    ) {
      throw new TypeError("Evolution target is not a bounded regular file");
    }
    const openedPath = await inspectTarget(root, segments);
    if (!sameFile(openedPath.targetStat, before) || openedPath.targetStat.size !== before.size) {
      throw new TypeError("Evolution target changed between path validation and open");
    }
    const bytes = await readExactTarget(handle, before.size);
    const after = await handle.stat();
    const finalPath = await inspectTarget(root, segments);
    if (
      !sameFile(before, after) ||
      !sameFile(before, finalPath.targetStat) ||
      before.size !== after.size ||
      before.size !== finalPath.targetStat.size ||
      bytes.length !== before.size
    ) {
      throw new TypeError("Evolution target changed while its source hash was read");
    }
    return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  } finally {
    await handle.close();
  }
}

type DiffLine = Readonly<{
  kind: "same" | "remove" | "add";
  value: string;
  oldLine: number;
  newLine: number;
}>;

export function normalizedUnifiedDiff(
  before: string,
  after: string,
  targetPath: string,
): string | null {
  safeSegments(targetPath);
  if (
    Buffer.byteLength(before, "utf8") > MAX_SOURCE_BYTES ||
    Buffer.byteLength(after, "utf8") > MAX_SOURCE_BYTES
  ) {
    return null;
  }
  const left = before.replaceAll("\r\n", "\n").split("\n");
  const right = after.replaceAll("\r\n", "\n").split("\n");
  if (left.length > MAX_DIFF_LINES || right.length > MAX_DIFF_LINES) return null;
  const width = right.length + 1;
  const table = new Uint32Array((left.length + 1) * width);
  for (let oldIndex = left.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = right.length - 1; newIndex >= 0; newIndex -= 1) {
      const offset = oldIndex * width + newIndex;
      table[offset] = left[oldIndex] === right[newIndex]
        ? table[(oldIndex + 1) * width + newIndex + 1]! + 1
        : Math.max(
            table[(oldIndex + 1) * width + newIndex]!,
            table[oldIndex * width + newIndex + 1]!,
          );
    }
  }
  const operations: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let oldLine = 1;
  let newLine = 1;
  while (oldIndex < left.length || newIndex < right.length) {
    if (oldIndex < left.length && newIndex < right.length && left[oldIndex] === right[newIndex]) {
      operations.push({ kind: "same", value: left[oldIndex]!, oldLine, newLine });
      oldIndex += 1;
      newIndex += 1;
      oldLine += 1;
      newLine += 1;
    } else if (
      newIndex < right.length &&
      (oldIndex >= left.length || table[oldIndex * width + newIndex + 1]! >= table[(oldIndex + 1) * width + newIndex]!)
    ) {
      operations.push({ kind: "add", value: right[newIndex]!, oldLine, newLine });
      newIndex += 1;
      newLine += 1;
    } else {
      operations.push({ kind: "remove", value: left[oldIndex]!, oldLine, newLine });
      oldIndex += 1;
      oldLine += 1;
    }
  }
  const changed = operations.flatMap((line, index) => line.kind === "same" ? [] : [index]);
  if (changed.length === 0) return null;
  const included = new Set<number>();
  for (const index of changed) {
    for (let cursor = Math.max(0, index - 3); cursor <= Math.min(operations.length - 1, index + 3); cursor += 1) {
      included.add(cursor);
    }
  }
  const output = [`--- a/${targetPath}`, `+++ b/${targetPath}`];
  let cursor = 0;
  while (cursor < operations.length) {
    while (cursor < operations.length && !included.has(cursor)) cursor += 1;
    if (cursor >= operations.length) break;
    const start = cursor;
    while (cursor < operations.length && included.has(cursor)) cursor += 1;
    const hunk = operations.slice(start, cursor);
    output.push(
      `@@ -${hunk[0]!.oldLine},${hunk.filter((line) => line.kind !== "add").length} +${hunk[0]!.newLine},${hunk.filter((line) => line.kind !== "remove").length} @@`,
    );
    output.push(...hunk.map((line) => `${line.kind === "same" ? " " : line.kind === "add" ? "+" : "-"}${line.value}`));
  }
  const diff = output.join("\n");
  return Buffer.byteLength(diff, "utf8") <= MAX_DIFF_BYTES ? diff : null;
}

function modelRun(
  provenance: SourceEvolutionState["modelProvenance"]["brief"] | SourceEvolutionState["modelProvenance"]["patch"],
): NonNullable<LiveView["evolution"]>["modelRuns"]["interpretation"] {
  return {
    transport: provenance.transport,
    requestedModel: provenance.transportRequestedModel,
    actualModel: provenance.actualResponseModel,
    runId: provenance.codexThreadId ?? provenance.responseId,
    tokenUsage: provenance.tokenUsage,
  };
}

export function projectEvolution(
  state: SourceEvolutionState,
  receipts: readonly EvolutionReceipt[],
  currentSourceHash: `sha256:${string}`,
): NonNullable<LiveView["evolution"]> {
  const expectedCurrentHash = state.status === "applied"
    ? state.artifact.target.postimageHash
    : state.artifact.target.preimageHash;
  if (currentSourceHash !== expectedCurrentHash) {
    throw new TypeError("Current host source hash contradicts the authoritative evolution state");
  }
  if (
    receipts.length !== state.receiptCount ||
    receipts.at(-1)?.receiptHash !== state.chainHead
  ) {
    throw new TypeError("Validated receipt chain does not match the evolution revision");
  }
  let previousReceiptHash: string | null = null;
  for (const [index, receipt] of receipts.entries()) {
    if (
      receipt.appId !== state.app.appId ||
      receipt.evolutionId !== state.evolutionId ||
      receipt.sequence !== index ||
      receipt.previousHash !== previousReceiptHash
    ) {
      throw new TypeError("Evolution receipts are not one contiguous identity-bound chain");
    }
    previousReceiptHash = receipt.receiptHash;
  }
  return {
    evolutionId: state.evolutionId,
    status: state.status,
    revision: state.receiptCount,
    title: state.inputs.brief.title,
    interpretation: state.inputs.brief.interpretation,
    proposalSummary: state.inputs.patchProposal.summary,
    proposalRationale: state.inputs.patchProposal.rationale,
    targetPath: state.artifact.target.path,
    normalizedDiff: normalizedUnifiedDiff(
      state.source.preimage,
      state.source.postimage,
      state.artifact.target.path,
    ),
    artifactHash: state.artifact.contentHash,
    proofHash: state.proof.proofHash,
    preimageHash: state.artifact.target.preimageHash,
    postimageHash: state.artifact.target.postimageHash,
    currentSourceHash,
    approvalActor: state.approval?.humanId ?? null,
    proofChecks: state.proof.checks.map((check) => ({
      id: check.id,
      status: check.status,
      detail: check.detail,
    })),
    modelRuns: {
      interpretation: modelRun(state.modelProvenance.brief),
      patch: modelRun(state.modelProvenance.patch),
    },
    receipts: receipts.map((receipt) => ({
      sequence: receipt.sequence,
      recordedAt: receipt.recordedAt,
      kind: receipt.kind,
      actor: receipt.actor,
      previousHash: receipt.previousHash,
      receiptHash: receipt.receiptHash,
    })),
    receiptChainHead: state.chainHead,
  };
}
