import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath, } from "node:fs/promises";
import path from "node:path";
import { parseProductManifest, } from "@living-software/contracts";
export const SOURCE_CANDIDATE_LIMITS = Object.freeze({
    maxFileBytes: 64 * 1024,
    maxFiles: 3,
    maxTotalBytes: 96 * 1024,
});
export class SourceCandidateError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "SourceCandidateError";
    }
}
const ALLOWED_EXTENSION = /\.(?:css|jsx?|tsx?)$/iu;
const ALLOWED_ROOT = /^src\/(?:app|components)\//u;
const EXCLUDED_SEGMENT = /^(?:__tests__|api|config|configs|e2e|test|tests)$/iu;
const EXCLUDED_FILE = /(?:^route\.(?:jsx?|tsx?)$|\.(?:spec|stories|test)\.(?:jsx?|tsx?)$|(?:^|\.)config\.(?:jsx?|tsx?)$|(?:^|\.)env\.(?:css|jsx?|tsx?)$|^env\.(?:css|jsx?|tsx?)$|\.d\.ts$|\.lock$)/iu;
function normalizeSourcePath(candidate) {
    const normalized = candidate.replaceAll("\\", "/");
    const segments = normalized.split("/");
    if (normalized.length === 0 ||
        normalized.startsWith("/") ||
        /^[A-Za-z]:\//u.test(normalized) ||
        segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
        throw new SourceCandidateError("UNSAFE_PATH", `Source candidate must be a canonical repository-relative path: ${candidate}`);
    }
    return normalized;
}
function isEligibleSourcePath(relative) {
    if (!ALLOWED_ROOT.test(relative) || !ALLOWED_EXTENSION.test(relative)) {
        return false;
    }
    const segments = relative.split("/");
    const fileName = segments.at(-1);
    return (fileName !== undefined &&
        !segments
            .slice(0, -1)
            .some((segment) => segment.startsWith(".") || EXCLUDED_SEGMENT.test(segment)) &&
        !EXCLUDED_FILE.test(fileName) &&
        !fileName.startsWith(".env") &&
        !/(?:^|[-_.])lock(?:[-_.]|$)/iu.test(fileName));
}
function validateBrief(brief) {
    if (!Array.isArray(brief.affectedProductNodeIds) ||
        brief.affectedProductNodeIds.length < 1 ||
        brief.affectedProductNodeIds.length > 32 ||
        brief.affectedProductNodeIds.some((nodeId) => typeof nodeId !== "string" ||
            !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u.test(nodeId))) {
        throw new SourceCandidateError("INVALID_BRIEF", "Source selection requires 1 to 32 valid affected product node ids");
    }
    return [...new Set(brief.affectedProductNodeIds)];
}
function isInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return (relative === "" ||
        (!relative.startsWith(`..${path.sep}`) &&
            relative !== ".." &&
            !path.isAbsolute(relative)));
}
function isMissing(error) {
    return error.code === "ENOENT";
}
function fileState(stat) {
    return {
        size: stat.size,
        device: stat.dev,
        inode: stat.ino,
        modifiedNs: stat.mtimeNs,
        changedNs: stat.ctimeNs,
    };
}
function isSameFileState(left, right) {
    return (left.device === right.device &&
        left.inode === right.inode &&
        left.size === right.size &&
        left.modifiedNs === right.modifiedNs &&
        left.changedNs === right.changedNs);
}
async function assertPathHasNoSymlink(root, relative) {
    const segments = relative.split("/");
    let current = root;
    for (let index = 0; index < segments.length; index += 1) {
        current = path.join(current, segments[index]);
        let stat;
        try {
            stat = await lstat(current, { bigint: true });
        }
        catch (error) {
            if (isMissing(error)) {
                throw new SourceCandidateError("SOURCE_MISSING", `Mapped source file no longer exists: ${relative}`);
            }
            throw error;
        }
        if (stat.isSymbolicLink()) {
            throw new SourceCandidateError("SYMLINK_REJECTED", `Source candidate traverses a symbolic link: ${relative}`);
        }
        const isLast = index === segments.length - 1;
        if ((!isLast && !stat.isDirectory()) || (isLast && !stat.isFile())) {
            throw new SourceCandidateError("UNSAFE_FILE", `Source candidate is not a regular file below regular directories: ${relative}`);
        }
        if (isLast) {
            return {
                absolute: current,
                ...fileState(stat),
            };
        }
    }
    throw new SourceCandidateError("UNSAFE_PATH", `Invalid source candidate path: ${relative}`);
}
function contentHash(content) {
    return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
function containsBinaryControlByte(content) {
    return content.some((byte) => (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) ||
        byte === 0x7f);
}
function candidateOpenFlags(relative) {
    if (process.platform === "win32") {
        return fsConstants.O_RDONLY;
    }
    if (typeof fsConstants.O_NOFOLLOW !== "number") {
        throw new SourceCandidateError("UNSAFE_FILE", `The runtime cannot safely open source candidates without following links: ${relative}`);
    }
    return fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW;
}
async function openCandidate(absolute, relative) {
    try {
        return await open(absolute, candidateOpenFlags(relative));
    }
    catch (error) {
        if (error instanceof SourceCandidateError)
            throw error;
        const code = error.code;
        if (code === "ELOOP" || code === "EMLINK") {
            throw new SourceCandidateError("SYMLINK_REJECTED", `Source candidate became a symbolic link while it was being opened: ${relative}`);
        }
        if (code === "ENOENT" || code === "ENOTDIR") {
            throw new SourceCandidateError("SOURCE_CHANGED", `Source candidate changed while it was being opened: ${relative}`);
        }
        if (code === "EINVAL" ||
            code === "ENOSYS" ||
            code === "ENOTSUP" ||
            code === "EOPNOTSUPP") {
            throw new SourceCandidateError("UNSAFE_FILE", `The filesystem cannot safely open source candidates without following links: ${relative}`);
        }
        throw new SourceCandidateError("UNSAFE_FILE", `Source candidate could not be safely opened: ${relative}`);
    }
}
async function readBounded(handle, maxBytes) {
    const buffer = Buffer.allocUnsafe(maxBytes);
    let offset = 0;
    while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (bytesRead === 0)
            break;
        offset += bytesRead;
    }
    return buffer.subarray(0, offset);
}
async function readCandidate(root, relative) {
    const before = await assertPathHasNoSymlink(root, relative);
    if (!isInside(root, before.absolute)) {
        throw new SourceCandidateError("UNSAFE_PATH", `Source candidate escaped the repository root: ${relative}`);
    }
    if (before.size > BigInt(SOURCE_CANDIDATE_LIMITS.maxFileBytes)) {
        throw new SourceCandidateError("FILE_TOO_LARGE", `Source candidate exceeds ${SOURCE_CANDIDATE_LIMITS.maxFileBytes} bytes: ${relative}`);
    }
    const handle = await openCandidate(before.absolute, relative);
    let bytes;
    try {
        const handleBeforeStat = await handle.stat({ bigint: true });
        if (!handleBeforeStat.isFile()) {
            throw new SourceCandidateError("UNSAFE_FILE", `Source candidate is not an opened regular file: ${relative}`);
        }
        const handleBefore = fileState(handleBeforeStat);
        if (!isSameFileState(before, handleBefore)) {
            throw new SourceCandidateError("SOURCE_CHANGED", `Source candidate changed while it was being opened: ${relative}`);
        }
        bytes = await readBounded(handle, SOURCE_CANDIDATE_LIMITS.maxFileBytes + 1);
        const handleAfterStat = await handle.stat({ bigint: true });
        const after = await assertPathHasNoSymlink(root, relative);
        if (!handleAfterStat.isFile() ||
            !isSameFileState(handleBefore, fileState(handleAfterStat)) ||
            !isSameFileState(handleBefore, after) ||
            BigInt(bytes.length) !== handleBefore.size) {
            throw new SourceCandidateError("SOURCE_CHANGED", `Source candidate changed while it was being read: ${relative}`);
        }
    }
    finally {
        await handle.close();
    }
    if (bytes.length > SOURCE_CANDIDATE_LIMITS.maxFileBytes) {
        throw new SourceCandidateError("FILE_TOO_LARGE", `Source candidate exceeds ${SOURCE_CANDIDATE_LIMITS.maxFileBytes} bytes: ${relative}`);
    }
    if (containsBinaryControlByte(bytes)) {
        throw new SourceCandidateError("BINARY_CONTENT", `Source candidate contains binary control bytes: ${relative}`);
    }
    let content;
    try {
        content = new TextDecoder("utf-8", {
            fatal: true,
            ignoreBOM: true,
        }).decode(bytes);
    }
    catch {
        throw new SourceCandidateError("INVALID_UTF8", `Source candidate is not valid UTF-8: ${relative}`);
    }
    return {
        candidate: Object.freeze({
            path: relative,
            content,
            preimageHash: contentHash(bytes),
        }),
        bytes: bytes.length,
    };
}
/**
 * Collects a small, exact, read-only source projection for patch generation.
 * Only source references already bound to the brief's affected manifest nodes
 * can cross this boundary.
 */
export async function collectSourceCandidates(input) {
    const manifest = parseProductManifest(input.manifest);
    const affectedNodeIds = validateBrief(input.brief);
    const nodes = new Map(manifest.nodes.map((node) => [node.id, node]));
    const sourcePaths = new Set();
    for (const nodeId of affectedNodeIds) {
        const node = nodes.get(nodeId);
        if (node === undefined) {
            throw new SourceCandidateError("AFFECTED_NODE_MISSING", `Affected product node is absent from the manifest: ${nodeId}`);
        }
        for (const source of node.provenance.sources) {
            const relative = normalizeSourcePath(source.path);
            if (isEligibleSourcePath(relative))
                sourcePaths.add(relative);
        }
    }
    if (sourcePaths.size === 0) {
        throw new SourceCandidateError("NO_ELIGIBLE_SOURCE", "Affected product nodes do not reference an eligible UI source file");
    }
    const root = await realpath(input.repositoryRoot);
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory()) {
        throw new SourceCandidateError("UNSAFE_PATH", "Source candidate repository root must be a directory");
    }
    const selected = [];
    let totalBytes = 0;
    for (const relative of [...sourcePaths].sort((left, right) => left.localeCompare(right))) {
        if (selected.length >= SOURCE_CANDIDATE_LIMITS.maxFiles)
            break;
        const loaded = await readCandidate(root, relative);
        if (totalBytes + loaded.bytes > SOURCE_CANDIDATE_LIMITS.maxTotalBytes) {
            continue;
        }
        selected.push(loaded.candidate);
        totalBytes += loaded.bytes;
    }
    if (selected.length === 0) {
        throw new SourceCandidateError("NO_ELIGIBLE_SOURCE", "Eligible source files could not fit inside the source projection budget");
    }
    return Object.freeze(selected);
}
//# sourceMappingURL=source-candidates.js.map