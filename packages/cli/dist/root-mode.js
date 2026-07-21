import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { buildAutomaticInstallBundle, } from "@living-software/automatic";
import { LEGACY_EVIDENCE_RELATIVE_PATH, analyzeEvidenceRecords, collectorDefinitionFromObservationRuntimeMap, evidenceRelativePathForManifestHash, generateNextCollectorFiles, parseCompatibleLegacyEvidenceNdjson, parseEvidenceNdjson, } from "@living-software/collector";
import { metricCatalogSchema, parseDiscoveryResult, parseLivingConfig, parseObservationRuntimeMap, parseProductManifest, parseStudioSnapshot, STUDIO_SNAPSHOT_SCHEMA_VERSION, } from "@living-software/contracts";
import { discoverNextApp, } from "@living-software/discovery";
import { applyCreateOnlyInstall, applySafeUninstall, planCreateOnlyInstall, planSafeUninstall, readInstallRecord, } from "@living-software/installer";
import { canonicalJson, sha256 } from "./canonical.js";
export const ROOT_RESULT_SCHEMA_VERSION = "living.cli-root-result/v1";
export const REQUIRED_PRESERVED_PATHS = Object.freeze([
    ".living/.gitignore",
    ".living/data",
]);
const ADAPTER = Object.freeze({ id: "next-app-router-automatic", version: "0.1.0" });
const INSTALLED_CONFIG_PATH = ".living/config.json";
const INSTALLED_MANIFEST_PATH = ".living/product-manifest.json";
const INSTALLED_RUNTIME_MAP_PATH = ".living/observation-runtime.json";
const INSTALLED_METRIC_CATALOG_PATH = ".living/metric-catalog.json";
const INSTALLED_GITIGNORE_PATH = ".living/.gitignore";
export class RootModeError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "RootModeError";
    }
}
function isInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return (relative === "" ||
        (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)));
}
function normalizeRelative(candidate) {
    const normalized = candidate.replaceAll("\\", "/");
    if (normalized.length === 0 ||
        normalized.startsWith("/") ||
        /^[A-Za-z]:\//u.test(normalized) ||
        normalized.split("/").includes("..")) {
        throw new RootModeError("UNSAFE_PATH", `Path must remain inside the host root: ${candidate}`);
    }
    return normalized;
}
async function safeRead(root, relativeInput) {
    const relative = normalizeRelative(relativeInput);
    const target = path.resolve(root, ...relative.split("/"));
    if (!isInside(root, target)) {
        throw new RootModeError("PATH_ESCAPE", `Path escaped the host root: ${relative}`);
    }
    const parent = await realpath(path.dirname(target));
    if (!isInside(root, parent)) {
        throw new RootModeError("SYMLINK_ESCAPE", `Path traversed outside the host root: ${relative}`);
    }
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new RootModeError("UNSAFE_FILE", `Expected a regular non-symlink file: ${relative}`);
    }
    return readFile(target, "utf8");
}
function isMissing(error) {
    return error.code === "ENOENT";
}
async function optionalSafeRead(root, relative) {
    try {
        return await safeRead(root, relative);
    }
    catch (error) {
        if (isMissing(error))
            return undefined;
        throw error;
    }
}
async function readJsonArtifact(root, relative) {
    let source;
    try {
        source = await safeRead(root, relative);
    }
    catch (error) {
        if (isMissing(error)) {
            throw new RootModeError("INSTALLED_ARTIFACT_MISSING", `Missing installed artifact: ${relative}`);
        }
        throw error;
    }
    try {
        return JSON.parse(source);
    }
    catch {
        throw new RootModeError("INSTALLED_ARTIFACT_INVALID", `Installed artifact is not valid JSON: ${relative}`);
    }
}
function observationBindings(runtimeMap) {
    return [
        ...runtimeMap.targets.flatMap((target) => Object.values(target.events)),
        ...runtimeMap.routes.flatMap((route) => [route.start, route.complete]),
        ...Object.values(runtimeMap.systemEvents),
    ].filter((candidate) => candidate !== undefined);
}
/** Fail closed before generated runtime bindings become installable collector authority. */
export function validateRuntimeBindings(runtimeCandidate, manifestCandidate, configCandidate) {
    const runtimeMap = parseObservationRuntimeMap(runtimeCandidate);
    const manifest = parseProductManifest(manifestCandidate);
    const config = configCandidate === undefined ? undefined : parseLivingConfig(configCandidate);
    const nodes = new Map(manifest.nodes.map((node) => [node.id, node]));
    const issues = [];
    if (runtimeMap.application.appId !== manifest.appId) {
        issues.push("Runtime appId does not match the product manifest");
    }
    if (runtimeMap.application.manifestHash !== manifest.contentHash) {
        issues.push("Runtime manifestHash does not match the product manifest");
    }
    if (runtimeMap.application.releaseRevision !== manifest.release.revision) {
        issues.push("Runtime release revision does not match the product manifest");
    }
    if (config !== undefined && config.application.id !== manifest.appId) {
        issues.push("Living config appId does not match the product manifest");
    }
    for (const binding of observationBindings(runtimeMap)) {
        if (!nodes.has(binding.nodeId)) {
            issues.push(`Event '${binding.eventName}' references unknown node '${binding.nodeId}'`);
        }
        if (binding.surfaceId !== undefined) {
            const surface = nodes.get(binding.surfaceId);
            if (surface === undefined) {
                issues.push(`Event '${binding.eventName}' references unknown surface '${binding.surfaceId}'`);
            }
            else if (surface.kind !== "surface" && surface.kind !== "route") {
                issues.push(`Event '${binding.eventName}' surface '${binding.surfaceId}' is not a surface or route`);
            }
        }
        if (config !== undefined) {
            const declaration = config.semantics.events[binding.eventName];
            if (declaration === undefined) {
                issues.push(`Event '${binding.eventName}' is absent from Living config semantics`);
            }
            else if (declaration.kind !== binding.kind) {
                issues.push(`Event '${binding.eventName}' kind differs from Living config semantics`);
            }
        }
    }
    if (issues.length > 0) {
        throw new RootModeError("RUNTIME_BINDING_INVALID", issues.sort().join("; "));
    }
    return runtimeMap;
}
function toCollectorBinding(binding) {
    return {
        eventName: binding.eventName,
        kind: binding.kind,
        nodeId: binding.nodeId,
        ...(binding.surfaceId === undefined ? {} : { surfaceId: binding.surfaceId }),
    };
}
/** Normalize Zod's explicit-undefined optionals to the collector's exact optionals. */
function toCollectorRuntimeMap(runtimeMap) {
    return {
        schemaVersion: runtimeMap.schemaVersion,
        application: runtimeMap.application,
        collector: { endpoint: runtimeMap.collector.endpoint },
        targets: runtimeMap.targets.map((target) => ({
            events: {
                ...(target.events.click === undefined
                    ? {}
                    : { click: toCollectorBinding(target.events.click) }),
                ...(target.events.change === undefined
                    ? {}
                    : { change: toCollectorBinding(target.events.change) }),
                ...(target.events.submit === undefined
                    ? {}
                    : { submit: toCollectorBinding(target.events.submit) }),
                ...(target.events.deadClick === undefined
                    ? {}
                    : { deadClick: toCollectorBinding(target.events.deadClick) }),
                ...(target.events.rageClick === undefined
                    ? {}
                    : { rageClick: toCollectorBinding(target.events.rageClick) }),
                ...(target.events.correction === undefined
                    ? {}
                    : { correction: toCollectorBinding(target.events.correction) }),
            },
        })),
        routes: runtimeMap.routes.map((route) => ({
            start: toCollectorBinding(route.start),
            complete: toCollectorBinding(route.complete),
        })),
        systemEvents: {
            sessionEnd: toCollectorBinding(runtimeMap.systemEvents.sessionEnd),
            runtimeError: toCollectorBinding(runtimeMap.systemEvents.runtimeError),
            lcp: toCollectorBinding(runtimeMap.systemEvents.lcp),
            inp: toCollectorBinding(runtimeMap.systemEvents.inp),
            cls: toCollectorBinding(runtimeMap.systemEvents.cls),
        },
        limits: {
            maxBatchSize: runtimeMap.limits.maxBatchSize,
            maxPayloadBytes: runtimeMap.limits.maxPayloadBytes,
            maxEventsPerMinute: runtimeMap.limits.maxEventsPerMinute,
        },
    };
}
function collectorArtifacts(definition) {
    const generated = generateNextCollectorFiles(definition);
    return [
        { path: generated.route.relativePath, content: generated.route.content },
        { path: generated.serverModule.relativePath, content: generated.serverModule.content },
    ];
}
function uniqueArtifacts(artifacts) {
    const byPath = new Map();
    for (const candidate of artifacts) {
        const normalized = normalizeRelative(candidate.path);
        if (byPath.has(normalized)) {
            throw new RootModeError("DUPLICATE_ARTIFACT", `Generated artifact path is duplicated: ${normalized}`);
        }
        byPath.set(normalized, { path: normalized, content: candidate.content });
    }
    return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}
async function discoverForInstall(root, clock) {
    if (clock !== undefined) {
        return discoverNextApp({ repositoryRoot: root, clock });
    }
    const fresh = await discoverNextApp({ repositoryRoot: root });
    const installedManifestSource = await optionalSafeRead(root, INSTALLED_MANIFEST_PATH);
    if (installedManifestSource === undefined)
        return fresh;
    let installedManifest;
    try {
        installedManifest = parseProductManifest(JSON.parse(installedManifestSource));
    }
    catch {
        // The create-only installer will surface the malformed tracked file as a conflict.
        return fresh;
    }
    if (installedManifest.appId !== fresh.manifest.appId ||
        installedManifest.release.revision !== fresh.sourceDigest) {
        return fresh;
    }
    const stable = await discoverNextApp({
        repositoryRoot: root,
        clock: () => new Date(installedManifest.generatedAt),
    });
    if (stable.sourceDigest === fresh.sourceDigest)
        return stable;
    // A host edit raced the second read; scan again using a current timestamp.
    return discoverNextApp({ repositoryRoot: root });
}
async function prepareInstall(rootInput, synthetic, options = {}) {
    const root = await realpath(rootInput);
    const discovery = await discoverForInstall(root, options.clock);
    const bundle = buildAutomaticInstallBundle(parseDiscoveryResult(discovery), { synthetic });
    const runtimeMap = validateRuntimeBindings(bundle.observationRuntimeMap, bundle.manifest, bundle.config);
    metricCatalogSchema.parse(bundle.metricCatalog);
    const collectorDefinition = collectorDefinitionFromObservationRuntimeMap(toCollectorRuntimeMap(runtimeMap));
    let artifacts = uniqueArtifacts([
        ...bundle.artifacts.map((artifact) => ({ path: artifact.path, content: artifact.content })),
        ...collectorArtifacts(collectorDefinition),
    ]);
    // A preserved exact gitignore from a prior uninstall is host state, not a conflict.
    const record = await readInstallRecord(root);
    const tracksGitignore = record?.files.some((file) => file.path === INSTALLED_GITIGNORE_PATH) ?? false;
    if (!tracksGitignore) {
        const generatedGitignore = artifacts.find((artifact) => artifact.path === INSTALLED_GITIGNORE_PATH);
        const installedGitignore = await optionalSafeRead(root, INSTALLED_GITIGNORE_PATH);
        if (generatedGitignore !== undefined &&
            installedGitignore !== undefined &&
            installedGitignore === generatedGitignore.content) {
            artifacts = artifacts.filter((artifact) => artifact.path !== INSTALLED_GITIGNORE_PATH);
        }
    }
    const plan = await planCreateOnlyInstall({
        root,
        appId: bundle.manifest.appId,
        adapter: ADAPTER,
        manifestHash: bundle.manifest.contentHash,
        artifacts,
        preservedDataPaths: REQUIRED_PRESERVED_PATHS,
        ...(options.clock === undefined ? {} : { clock: options.clock }),
        ...(options.installId === undefined ? {} : { installId: options.installId }),
    });
    return { root, discovery, bundle, collectorDefinition, artifacts, plan };
}
function discoverySummary(discovery) {
    return {
        schemaVersion: discovery.schemaVersion,
        support: discovery.support,
        sourceDigest: discovery.sourceDigest,
        manifest: discovery.manifest,
        runtimeLocatorMap: discovery.runtimeLocatorMap,
        metricCatalog: discovery.metricCatalog,
        diagnostics: discovery.diagnostics,
        stats: discovery.stats,
    };
}
async function runInit(options) {
    const synthetic = options.synthetic ?? false;
    const prepared = await prepareInstall(options.root, synthetic, options);
    const apply = options.apply ?? false;
    const result = apply ? await applyCreateOnlyInstall(prepared.plan) : undefined;
    return {
        schemaVersion: ROOT_RESULT_SCHEMA_VERSION,
        command: "init",
        mode: apply ? "apply" : "dry-run",
        root: prepared.root,
        synthetic,
        discovery: discoverySummary(prepared.discovery),
        automaticDiagnostics: prepared.bundle.diagnostics,
        collectorDefinition: prepared.collectorDefinition,
        plan: prepared.plan,
        ...(result === undefined ? {} : { result }),
    };
}
async function runMap(options) {
    const root = await realpath(options.root);
    const discovery = await discoverNextApp({ repositoryRoot: root });
    return {
        schemaVersion: ROOT_RESULT_SCHEMA_VERSION,
        command: "map",
        mode: "read-only",
        root,
        discovery: discoverySummary(discovery),
    };
}
async function installedArtifacts(root) {
    const config = parseLivingConfig(await readJsonArtifact(root, INSTALLED_CONFIG_PATH));
    const manifest = parseProductManifest(await readJsonArtifact(root, INSTALLED_MANIFEST_PATH));
    const runtimeMap = validateRuntimeBindings(await readJsonArtifact(root, INSTALLED_RUNTIME_MAP_PATH), manifest, config);
    metricCatalogSchema.parse(await readJsonArtifact(root, INSTALLED_METRIC_CATALOG_PATH));
    collectorDefinitionFromObservationRuntimeMap(toCollectorRuntimeMap(runtimeMap));
    return { config, manifest, runtimeMap };
}
async function runDoctor(options) {
    const root = await realpath(options.root);
    const discovery = await discoverNextApp({ repositoryRoot: root });
    const diagnostics = [];
    const record = await readInstallRecord(root);
    if (record === undefined) {
        diagnostics.push({
            code: "NOT_INSTALLED",
            severity: "error",
            message: "No .living/install-record.json exists; run 'living init --root <repo>' first.",
        });
        return {
            schemaVersion: ROOT_RESULT_SCHEMA_VERSION,
            command: "doctor",
            mode: "read-only",
            root,
            discovery: discoverySummary(discovery),
            diagnostics,
        };
    }
    let installed;
    try {
        installed = await installedArtifacts(root);
        diagnostics.push({
            code: "CONTRACTS_VALID",
            severity: "info",
            message: "Installed config, manifest, runtime bindings, metrics, and collector definition are valid.",
        });
    }
    catch (error) {
        diagnostics.push({
            code: "INSTALLED_STATE_INVALID",
            severity: "error",
            message: error instanceof Error ? error.message : "Installed artifact validation failed.",
        });
    }
    const uninstallPlan = await planSafeUninstall(root);
    for (const file of uninstallPlan.files) {
        if (file.state === "missing") {
            diagnostics.push({
                code: "INSTALLED_FILE_MISSING",
                severity: "error",
                message: `Install record file is missing: ${file.path}`,
            });
        }
        if (file.state === "conflict") {
            diagnostics.push({
                code: "INSTALLED_FILE_MODIFIED",
                severity: "error",
                message: `Installed file differs from its recorded hash: ${file.path}`,
            });
        }
    }
    if (installed !== undefined) {
        if (record.appId !== installed.manifest.appId || record.manifestHash !== installed.manifest.contentHash) {
            diagnostics.push({
                code: "INSTALL_RECORD_MISMATCH",
                severity: "error",
                message: "Install record identity does not match the installed product manifest.",
            });
        }
        if (installed.manifest.release.revision !== discovery.sourceDigest) {
            diagnostics.push({
                code: "SOURCE_MAP_DRIFT",
                severity: "error",
                message: "Current source discovery differs from the installed product manifest; rerun init after review.",
            });
        }
        else if (installed.manifest.contentHash !== discovery.manifest.contentHash) {
            diagnostics.push({
                code: "PRODUCT_MAP_DRIFT",
                severity: "error",
                message: "Current discovery produced a different semantic product map from the installed manifest for the same source revision; rerun init after review.",
            });
        }
        if (options.syntheticSpecified === true &&
            installed.runtimeMap.application.synthetic !== (options.synthetic ?? false)) {
            diagnostics.push({
                code: "SYNTHETIC_PROVENANCE_MISMATCH",
                severity: "error",
                message: "Installed runtime synthetic provenance differs from the requested doctor mode.",
            });
        }
    }
    for (const preserved of REQUIRED_PRESERVED_PATHS) {
        if (!record.preservedDataPaths.includes(preserved)) {
            diagnostics.push({
                code: "PRESERVATION_POLICY_MISSING",
                severity: "error",
                message: `Install record does not preserve required path: ${preserved}`,
            });
        }
    }
    const gitignore = await optionalSafeRead(root, INSTALLED_GITIGNORE_PATH);
    if (gitignore === undefined) {
        diagnostics.push({
            code: "EVIDENCE_GITIGNORE_MISSING",
            severity: "error",
            message: ".living/.gitignore is missing; local evidence could be committed accidentally.",
        });
    }
    if (!diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        diagnostics.push({
            code: "INSTALL_HEALTHY",
            severity: "info",
            message: "Discovery and installed create-only artifacts are healthy.",
        });
    }
    diagnostics.sort((left, right) => left.code.localeCompare(right.code));
    return {
        schemaVersion: ROOT_RESULT_SCHEMA_VERSION,
        command: "doctor",
        mode: "read-only",
        root,
        discovery: discoverySummary(discovery),
        record,
        diagnostics,
    };
}
function preservationAwareUninstall(plan) {
    const preserved = new Set(REQUIRED_PRESERVED_PATHS);
    const files = plan.files.filter((file) => !preserved.has(file.path) &&
        !file.path.startsWith(".living/data/"));
    const diagnostics = plan.diagnostics.filter((message) => !message.includes(INSTALLED_GITIGNORE_PATH) &&
        !message.includes(".living/data/"));
    return {
        ...plan,
        status: diagnostics.length === 0 ? "ready" : "conflict",
        files,
        diagnostics,
    };
}
async function runUninstall(options) {
    const root = await realpath(options.root);
    const plan = preservationAwareUninstall(await planSafeUninstall(root));
    const apply = options.apply ?? false;
    const result = apply ? await applySafeUninstall(plan) : undefined;
    return {
        schemaVersion: ROOT_RESULT_SCHEMA_VERSION,
        command: "uninstall",
        mode: apply ? "apply" : "dry-run",
        root,
        preservedPaths: REQUIRED_PRESERVED_PATHS,
        plan,
        ...(result === undefined
            ? {}
            : {
                result: {
                    ...result,
                    preservedDataPaths: REQUIRED_PRESERVED_PATHS,
                },
            }),
    };
}
async function loadEvidenceAnalysis(rootInput) {
    const root = await realpath(rootInput);
    const installed = await installedArtifacts(root);
    const definition = collectorDefinitionFromObservationRuntimeMap(toCollectorRuntimeMap(installed.runtimeMap));
    const activeEvidencePath = evidenceRelativePathForManifestHash(definition.application.manifestHash);
    let evidencePath = activeEvidencePath;
    let records;
    try {
        const evidenceSource = await safeRead(root, activeEvidencePath);
        records = parseEvidenceNdjson(evidenceSource, definition);
    }
    catch (error) {
        if (!isMissing(error))
            throw error;
        let legacySource;
        try {
            legacySource = await safeRead(root, LEGACY_EVIDENCE_RELATIVE_PATH);
        }
        catch (legacyError) {
            if (!isMissing(legacyError))
                throw legacyError;
            throw new RootModeError("EVIDENCE_MISSING", `No evidence exists at ${activeEvidencePath}; run the instrumented host first.`);
        }
        const legacyRecords = parseCompatibleLegacyEvidenceNdjson(legacySource, definition);
        if (legacyRecords === undefined) {
            throw new RootModeError("EVIDENCE_RELEASE_MISMATCH", `Legacy evidence at ${LEGACY_EVIDENCE_RELATIVE_PATH} belongs to another release; current evidence must be captured at ${activeEvidencePath}.`);
        }
        evidencePath = LEGACY_EVIDENCE_RELATIVE_PATH;
        records = legacyRecords;
    }
    const analysis = analyzeEvidenceRecords(records, definition);
    return { root, installed, evidencePath, analysis };
}
export async function loadAutomaticEvolutionInput(rootInput) {
    const loaded = await loadEvidenceAnalysis(rootInput);
    const opportunity = loaded.analysis.opportunity;
    if (opportunity === null) {
        throw new RootModeError("OPPORTUNITY_MISSING", "No deterministic opportunity crossed its threshold for the active evidence set.");
    }
    if (loaded.analysis.opportunityEvidenceEvents.length === 0) {
        throw new RootModeError("OPPORTUNITY_EVIDENCE_MISSING", "The detector emitted an Opportunity without its exact evidence set.");
    }
    return Object.freeze({
        root: loaded.root,
        snapshotHash: sha256(snapshotFromLoadedAnalysis(loaded)),
        application: Object.freeze({
            appId: loaded.installed.manifest.appId,
            displayName: loaded.installed.config.application.displayName,
            environment: loaded.installed.runtimeMap.application.environment,
            releaseRevision: loaded.installed.manifest.release.revision,
            manifestHash: loaded.installed.manifest.contentHash,
            dataOrigin: opportunity.evidence.dataOrigin,
        }),
        manifest: loaded.installed.manifest,
        opportunity,
        evidenceEvents: Object.freeze([
            ...loaded.analysis.opportunityEvidenceEvents,
        ]),
    });
}
function evidenceSummary(loaded) {
    return {
        path: loaded.evidencePath,
        records: loaded.analysis.records.length,
        events: loaded.analysis.events.length,
        chainHead: loaded.analysis.chainHead,
    };
}
async function runAnalyze(options) {
    const loaded = await loadEvidenceAnalysis(options.root);
    return {
        schemaVersion: ROOT_RESULT_SCHEMA_VERSION,
        command: "analyze",
        mode: "read-only",
        root: loaded.root,
        evidence: evidenceSummary(loaded),
        manifest: loaded.installed.manifest,
        workflowCases: loaded.analysis.workflowCases,
        workflowVariants: loaded.analysis.workflowVariants,
        metricReport: loaded.analysis.metricReport,
        opportunity: loaded.analysis.opportunity,
    };
}
function opaqueCaseId(manifestHash, sourceCaseId) {
    return `case:${sha256({
        schemaVersion: "living.studio-case-identity/v1",
        manifestHash,
        sourceCaseId,
    }).slice(7)}`;
}
function snapshotCases(loaded) {
    const manifestHash = loaded.installed.manifest.contentHash;
    return loaded.analysis.workflowCases
        .map((workflowCase) => ({
        caseId: opaqueCaseId(manifestHash, workflowCase.caseId),
        durationMs: workflowCase.durationMs,
        outcome: workflowCase.outcome,
        eventCount: workflowCase.events.length,
        journeyNodeIds: [...workflowCase.surfaces],
        sessionCount: workflowCase.sessionIds.length,
    }))
        .sort((left, right) => left.caseId.localeCompare(right.caseId));
}
function snapshotVariants(cases, manifestHash) {
    const groups = new Map();
    for (const workflowCase of cases) {
        const key = canonicalJson(workflowCase.journeyNodeIds);
        const existing = groups.get(key);
        if (existing === undefined) {
            groups.set(key, {
                journeyNodeIds: workflowCase.journeyNodeIds,
                cases: [workflowCase],
            });
        }
        else {
            existing.cases.push(workflowCase);
        }
    }
    return [...groups.values()]
        .map((group) => {
        const outcomes = {
            succeeded: 0,
            failed: 0,
            abandoned: 0,
            unknown: 0,
        };
        for (const workflowCase of group.cases) {
            outcomes[workflowCase.outcome] += 1;
        }
        return {
            variantId: `variant:${sha256({
                schemaVersion: "living.studio-journey-variant/v1",
                manifestHash,
                journeyNodeIds: group.journeyNodeIds,
            }).slice(7)}`,
            caseIds: group.cases.map((workflowCase) => workflowCase.caseId).sort(),
            journeyNodeIds: [...group.journeyNodeIds],
            caseCount: group.cases.length,
            averageDurationMs: group.cases.reduce((total, workflowCase) => total + workflowCase.durationMs, 0) /
                group.cases.length,
            outcomes,
        };
    })
        .sort((left, right) => right.caseCount - left.caseCount ||
        left.variantId.localeCompare(right.variantId));
}
function snapshotOpportunity(opportunity) {
    if (opportunity === null)
        return undefined;
    return {
        opportunityId: opportunity.opportunityId,
        appId: opportunity.appId,
        manifestHash: opportunity.manifestHash,
        detectedAt: opportunity.detectedAt,
        detector: opportunity.detector,
        window: opportunity.window,
        signal: {
            kind: opportunity.signal.kind,
            metrics: opportunity.signal.metrics,
        },
        evidence: {
            bundle: opportunity.evidence.bundle,
            eventSetHash: opportunity.evidence.eventSetHash,
            subjectCount: opportunity.evidence.subjectCount,
            sessionCount: opportunity.evidence.sessionCount,
            occurrenceCount: opportunity.evidence.occurrenceCount,
            dataOrigin: opportunity.evidence.dataOrigin,
        },
        confidence: opportunity.confidence,
    };
}
function snapshotFromLoadedAnalysis(loaded) {
    const cases = snapshotCases(loaded);
    const opportunity = snapshotOpportunity(loaded.analysis.opportunity);
    return parseStudioSnapshot({
        schemaVersion: STUDIO_SNAPSHOT_SCHEMA_VERSION,
        generatedAt: loaded.analysis.metricReport.generatedAt,
        application: {
            appId: loaded.installed.manifest.appId,
            displayName: loaded.installed.config.application.displayName,
            environment: loaded.installed.runtimeMap.application.environment,
            releaseRevision: loaded.installed.manifest.release.revision,
            manifestHash: loaded.installed.manifest.contentHash,
            dataOrigin: loaded.analysis.metricReport.dataOrigin,
        },
        productManifest: loaded.installed.manifest,
        evidence: evidenceSummary(loaded),
        workflows: {
            cases,
            variants: snapshotVariants(cases, loaded.installed.manifest.contentHash),
        },
        metricReport: loaded.analysis.metricReport,
        ...(opportunity === undefined ? {} : { opportunity }),
    });
}
async function runSnapshot(options) {
    return snapshotFromLoadedAnalysis(await loadEvidenceAnalysis(options.root));
}
export async function runRootCommand(command, options) {
    switch (command) {
        case "init":
            return runInit(options);
        case "map":
            return runMap(options);
        case "doctor":
            return runDoctor(options);
        case "uninstall":
            return runUninstall(options);
        case "analyze":
            return runAnalyze(options);
        case "snapshot":
            return runSnapshot(options);
    }
}
//# sourceMappingURL=root-mode.js.map