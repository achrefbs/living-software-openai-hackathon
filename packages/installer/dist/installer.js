import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, link, lstat, mkdir, open, readFile, realpath, rmdir, unlink, } from "node:fs/promises";
import path from "node:path";
import { parseInstallRecord, } from "@living-software/contracts";
export const INSTALL_RECORD_PATH = ".living/install-record.json";
export class InstallConflictError extends Error {
    diagnostics;
    constructor(diagnostics) {
        super(diagnostics.join("; "));
        this.diagnostics = diagnostics;
        this.name = "InstallConflictError";
    }
}
function sha256(content) {
    return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
function normalizeRelative(candidate) {
    const normalized = candidate.replaceAll("\\", "/");
    if (normalized.length === 0 ||
        normalized.startsWith("/") ||
        /^[A-Za-z]:\//.test(normalized) ||
        normalized.split("/").includes("..") ||
        normalized === INSTALL_RECORD_PATH) {
        throw new TypeError(`Unsafe or reserved installation path: ${candidate}`);
    }
    return normalized;
}
/** Exact-or-descendant matching with a segment boundary (`data-other` is not `data`). */
function isPathPreserved(candidate, preservedDataPaths) {
    const normalizedCandidate = normalizeRelative(candidate);
    return preservedDataPaths.some((preservedPath) => {
        const normalizedPreserved = normalizeRelative(preservedPath).replace(/\/+$/, "");
        return (normalizedCandidate === normalizedPreserved ||
            normalizedCandidate.startsWith(`${normalizedPreserved}/`));
    });
}
function inside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
async function exists(candidate) {
    try {
        await lstat(candidate);
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
async function assertSafeTarget(rootReal, relative) {
    const target = path.resolve(rootReal, ...relative.split("/"));
    if (!inside(rootReal, target))
        throw new TypeError(`Target escapes repository: ${relative}`);
    let cursor = path.dirname(target);
    while (!(await exists(cursor))) {
        const parent = path.dirname(cursor);
        if (parent === cursor)
            throw new TypeError(`Unable to resolve target parent: ${relative}`);
        cursor = parent;
    }
    const ancestorReal = await realpath(cursor);
    if (!inside(rootReal, ancestorReal)) {
        throw new TypeError(`Target traverses a symlink outside the repository: ${relative}`);
    }
    return target;
}
async function readHash(candidate) {
    try {
        return sha256(await readFile(candidate));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    }
}
function canonicalRecord(record) {
    return `${JSON.stringify(record, null, 2)}\n`;
}
export async function readInstallRecord(root) {
    const rootReal = await realpath(root);
    const recordPath = await assertSafeTarget(rootReal, INSTALL_RECORD_PATH);
    try {
        return parseInstallRecord(JSON.parse(await readFile(recordPath, "utf8")));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    }
}
export async function planCreateOnlyInstall(input) {
    const root = await realpath(input.root);
    if (input.artifacts.length === 0 || input.artifacts.length > 64) {
        throw new TypeError("Installation must contain between 1 and 64 artifacts");
    }
    const seen = new Set();
    const artifacts = input.artifacts.map((artifact) => {
        const normalizedPath = normalizeRelative(artifact.path);
        if (seen.has(normalizedPath))
            throw new TypeError(`Duplicate installation path: ${normalizedPath}`);
        seen.add(normalizedPath);
        return {
            path: normalizedPath,
            content: artifact.content,
            installedHash: sha256(artifact.content),
        };
    }).sort((left, right) => left.path.localeCompare(right.path));
    const preservedDataPaths = [
        ...new Set((input.preservedDataPaths ?? [".living/data", ".living/.gitignore"]).map(normalizeRelative)),
    ].sort();
    const existingRecord = await readInstallRecord(root);
    const record = existingRecord ?? parseInstallRecord({
        schemaVersion: "living.install-record/v1",
        installId: input.installId ?? `install-${randomUUID()}`,
        installedAt: (input.clock ?? (() => new Date()))().toISOString(),
        appId: input.appId,
        adapter: input.adapter,
        manifestHash: input.manifestHash,
        mutationPolicy: "create-only",
        files: artifacts.map(({ path: filePath, installedHash }) => ({ path: filePath, installedHash })),
        preservedDataPaths,
    });
    const diagnostics = [];
    const planned = [];
    const expectedRecord = parseInstallRecord({
        ...record,
        appId: input.appId,
        adapter: input.adapter,
        manifestHash: input.manifestHash,
        files: artifacts.map(({ path: filePath, installedHash }) => ({ path: filePath, installedHash })),
        preservedDataPaths,
    });
    const recordMatches = existingRecord !== undefined && canonicalRecord(existingRecord) === canonicalRecord(expectedRecord);
    for (const artifact of artifacts) {
        const target = await assertSafeTarget(root, artifact.path);
        const currentHash = await readHash(target);
        const reusablePreservedArtifact = existingRecord === undefined &&
            isPathPreserved(artifact.path, expectedRecord.preservedDataPaths);
        const state = currentHash === undefined
            ? "create"
            : (recordMatches || reusablePreservedArtifact) && currentHash === artifact.installedHash
                ? "unchanged"
                : "conflict";
        if (state === "conflict")
            diagnostics.push(`Refusing to overwrite existing file: ${artifact.path}`);
        planned.push({ ...artifact, state });
    }
    if (existingRecord !== undefined && !recordMatches) {
        diagnostics.push("Existing install record does not match the requested installation");
    }
    const conflict = diagnostics.length > 0;
    const unchanged = !conflict &&
        existingRecord !== undefined &&
        planned.every((artifact) => artifact.state === "unchanged");
    return {
        schemaVersion: "living.install-plan/v1",
        root,
        mode: "dry-run",
        status: conflict ? "conflict" : unchanged ? "unchanged" : "ready",
        record: expectedRecord,
        artifacts: planned,
        diagnostics,
    };
}
async function atomicCreate(target, content) {
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.living-${randomUUID()}.tmp`);
    const handle = await open(temporary, "wx");
    try {
        await handle.writeFile(content, "utf8");
        await handle.sync();
    }
    finally {
        await handle.close();
    }
    try {
        try {
            await link(temporary, target);
        }
        catch (error) {
            if (!["EXDEV", "EPERM", "ENOTSUP"].includes(error.code ?? "")) {
                throw error;
            }
            await copyFile(temporary, target, constants.COPYFILE_EXCL);
        }
        await unlink(temporary);
    }
    catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
}
async function removeEmptyParents(root, filePath) {
    let cursor = path.dirname(filePath);
    while (cursor !== root && inside(root, cursor)) {
        try {
            await rmdir(cursor);
        }
        catch (error) {
            if (["ENOTEMPTY", "ENOENT", "EEXIST"].includes(error.code ?? ""))
                return;
            throw error;
        }
        cursor = path.dirname(cursor);
    }
}
export async function applyCreateOnlyInstall(plan) {
    if (plan.status === "conflict")
        throw new InstallConflictError(plan.diagnostics);
    if (plan.status === "unchanged")
        return { status: "unchanged", record: plan.record };
    const root = await realpath(plan.root);
    const created = [];
    try {
        for (const artifact of plan.artifacts) {
            if (artifact.state !== "create")
                continue;
            const target = await assertSafeTarget(root, artifact.path);
            if (await exists(target))
                throw new InstallConflictError([`Target changed after planning: ${artifact.path}`]);
            await atomicCreate(target, artifact.content);
            created.push(target);
        }
        const recordPath = await assertSafeTarget(root, INSTALL_RECORD_PATH);
        const currentRecord = await readInstallRecord(root);
        if (currentRecord === undefined) {
            await atomicCreate(recordPath, canonicalRecord(plan.record));
            created.push(recordPath);
        }
        else if (canonicalRecord(currentRecord) !== canonicalRecord(plan.record)) {
            throw new InstallConflictError(["Install record changed after planning"]);
        }
        return { status: "installed", record: plan.record };
    }
    catch (error) {
        for (const target of [...created].reverse()) {
            await unlink(target).catch(() => undefined);
            await removeEmptyParents(root, target).catch(() => undefined);
        }
        throw error;
    }
}
export async function planSafeUninstall(rootInput) {
    const root = await realpath(rootInput);
    const record = await readInstallRecord(root);
    if (record === undefined)
        throw new Error("Living Software is not installed in this repository");
    const diagnostics = [];
    const files = [];
    for (const file of record.files) {
        if (isPathPreserved(file.path, record.preservedDataPaths)) {
            files.push({ path: file.path, state: "preserve" });
            continue;
        }
        const target = await assertSafeTarget(root, file.path);
        const currentHash = await readHash(target);
        const state = currentHash === undefined
            ? "missing"
            : currentHash === file.installedHash
                ? "remove"
                : "conflict";
        if (state === "conflict")
            diagnostics.push(`Installed file was modified and will be preserved: ${file.path}`);
        files.push({ path: file.path, state });
    }
    return {
        schemaVersion: "living.uninstall-plan/v1",
        root,
        mode: "dry-run",
        status: diagnostics.length === 0 ? "ready" : "conflict",
        record,
        files,
        diagnostics,
    };
}
export async function applySafeUninstall(plan) {
    if (plan.status === "conflict")
        throw new InstallConflictError(plan.diagnostics);
    const root = await realpath(plan.root);
    const removed = [];
    const alreadyMissing = [];
    for (const file of plan.files) {
        if (file.state === "preserve")
            continue;
        const target = await assertSafeTarget(root, file.path);
        if (file.state === "missing") {
            alreadyMissing.push(file.path);
            continue;
        }
        if (await readHash(target) !== plan.record.files.find((item) => item.path === file.path)?.installedHash) {
            throw new InstallConflictError([`Installed file changed after planning: ${file.path}`]);
        }
    }
    for (const file of [...plan.files].reverse()) {
        if (file.state !== "remove")
            continue;
        const target = await assertSafeTarget(root, file.path);
        await unlink(target);
        removed.push(file.path);
        await removeEmptyParents(root, target);
    }
    const recordPath = await assertSafeTarget(root, INSTALL_RECORD_PATH);
    await unlink(recordPath);
    await removeEmptyParents(root, recordPath);
    return {
        status: "uninstalled",
        removed,
        alreadyMissing,
        preservedDataPaths: plan.record.preservedDataPaths,
    };
}
//# sourceMappingURL=installer.js.map