import { applySourceEvolution, approveSourceEvolution, getEvolutionStatus, listEvolutionStatuses, prepareSourceEvolution, rollbackSourceEvolution, sourcePatchModelProvenanceSchema, sourcePatchProposalSchema, } from "@living-software/evolution";
import { gpt56EvolutionBriefSchema, intelligenceProvenanceSchema, } from "@living-software/contracts";
import { createCodexCliTransport, createFetchTransport, createIntelligenceClient, } from "@living-software/intelligence";
import { isDeepStrictEqual } from "node:util";
import { loadAutomaticEvolutionInput, runRootCommand, } from "./root-mode.js";
import { collectSourceCandidates, } from "./source-candidates.js";
const defaultDependencies = {
    runRoot: runRootCommand,
    loadEvolutionInput: loadAutomaticEvolutionInput,
    collectCandidates: collectSourceCandidates,
    createIntelligence(provider) {
        return createIntelligenceClient(provider === "codex"
            ? createCodexCliTransport()
            : createFetchTransport(), {
            timeoutMs: 120_000,
            maxPatchOutputTokens: 8_000,
        });
    },
    prepareEvolution: prepareSourceEvolution,
    approveEvolution: approveSourceEvolution,
    applyEvolution: applySourceEvolution,
    rollbackEvolution: rollbackSourceEvolution,
    getEvolution: getEvolutionStatus,
    listEvolutions: listEvolutionStatuses,
};
function result(command, outcome, message, fields = {}) {
    return Object.freeze({
        schemaVersion: "living.terminal-result/v1",
        command,
        outcome,
        message,
        ...fields,
    });
}
function quote(value) {
    return JSON.stringify(value);
}
function nextCommand(root, state) {
    switch (state.status) {
        case "prepared": {
            const artifactHash = "artifact" in state
                ? state.artifact.contentHash
                : state.artifactHash;
            const proofHash = "proof" in state
                ? state.proof.proofHash
                : state.proofHash;
            return `living approve --root ${quote(root)} --evolution ${state.evolutionId} --actor <actor> --artifact-hash ${artifactHash} --proof-hash ${proofHash} --apply`;
        }
        case "approved":
            return `living apply --root ${quote(root)} --evolution ${state.evolutionId}`;
        case "applied":
            return `living rollback --root ${quote(root)} --evolution ${state.evolutionId} --actor <actor>`;
        case "rolled-back":
            return undefined;
    }
}
function evolutionProjection(state) {
    return {
        evolutionId: state.evolutionId,
        status: state.status,
        targetPath: state.artifact.target.path,
        artifactHash: state.artifact.contentHash,
        proofHash: state.proof.proofHash,
        proofVerdict: state.proof.verdict,
        proofChecks: state.proof.checks.length,
        receiptCount: state.receiptCount,
        updatedAt: state.updatedAt,
    };
}
const MAX_PATCH_PREVIEW_BYTES = 12 * 1024;
function boundedPatchPreview(edits) {
    const exact = edits
        .flatMap((edit, index) => [
        `@@ edit ${index + 1} @@`,
        `- ${JSON.stringify(edit.anchor)}`,
        `+ ${JSON.stringify(edit.replacement)}`,
    ])
        .join("\n");
    const totalBytes = Buffer.byteLength(exact, "utf8");
    if (totalBytes <= MAX_PATCH_PREVIEW_BYTES) {
        return { text: exact, truncated: false, totalBytes };
    }
    let low = 0;
    let high = Math.min(exact.length, MAX_PATCH_PREVIEW_BYTES);
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (Buffer.byteLength(exact.slice(0, middle), "utf8") <=
            MAX_PATCH_PREVIEW_BYTES) {
            low = middle;
        }
        else {
            high = middle - 1;
        }
    }
    return {
        text: `${exact.slice(0, low)}\n… [preview truncated; exact patch remains hash-bound in the local evolution ledger]`,
        truncated: true,
        totalBytes,
    };
}
function proposalProjection(patch) {
    return {
        proposalId: patch.proposal.proposalId,
        summary: patch.proposal.summary,
        rationale: patch.proposal.rationale,
        targetPath: patch.proposal.target.path,
        preimageHash: patch.proposal.target.preimageHash,
        edits: patch.proposal.edits.map((edit, index) => ({
            number: index + 1,
            anchorCharacters: edit.anchor.length,
            replacementCharacters: edit.replacement.length,
            anchorPreview: edit.anchor.replace(/\s+/gu, " ").trim().slice(0, 120),
        })),
        patchPreview: boundedPatchPreview(patch.proposal.edits),
    };
}
function storedProposalProjection(state) {
    const inputs = record(state.inputs);
    const patch = record(inputs?.patchProposal);
    if (patch === null)
        return null;
    const target = record(patch.target);
    const edits = Array.isArray(patch.edits)
        ? patch.edits.filter((edit) => {
            const candidate = record(edit);
            return (candidate !== null &&
                typeof candidate.anchor === "string" &&
                typeof candidate.replacement === "string");
        })
        : [];
    if (typeof patch.proposalId !== "string" ||
        typeof patch.summary !== "string" ||
        target === null ||
        typeof target.path !== "string") {
        return null;
    }
    return {
        proposalId: patch.proposalId,
        summary: patch.summary,
        rationale: typeof patch.rationale === "string" ? patch.rationale : "",
        targetPath: target.path,
        edits: edits.map((edit, index) => ({
            number: index + 1,
            anchorCharacters: edit.anchor.length,
            replacementCharacters: edit.replacement.length,
        })),
        patchPreview: boundedPatchPreview(edits),
    };
}
function storedProviderProjection(state) {
    const combined = record(state.modelProvenance);
    const brief = record(combined?.brief);
    const patch = record(combined?.patch);
    if (patch === null)
        return null;
    return {
        requested: patch.transport === "codex-cli" ? "codex" : "api",
        briefTransport: brief?.transport ?? null,
        briefRunId: brief?.codexThreadId ?? brief?.responseId ?? null,
        patchTransport: patch.transport ?? null,
        patchRunId: patch.codexThreadId ?? patch.responseId ?? null,
    };
}
async function exactExistingEvolution(root, input, dependencies, summaries) {
    for (const summary of summaries) {
        if (summary.appId !== input.application.appId)
            continue;
        const state = await dependencies.getEvolution(root, summary.evolutionId);
        if (state.app.appId === input.application.appId &&
            state.bindings.manifestHash === input.application.manifestHash &&
            state.bindings.opportunityId === input.opportunity.opportunityId &&
            isDeepStrictEqual(state.inputs.opportunity, input.opportunity)) {
            return state;
        }
    }
    return null;
}
const ACTIVE_EVOLUTION_STATUSES = new Set([
    "approved",
    "applied",
]);
function conflictingActiveEvolution(summaries, appId, currentEvolutionId) {
    return summaries.find((summary) => summary.appId === appId &&
        summary.evolutionId !== currentEvolutionId &&
        ACTIVE_EVOLUTION_STATUSES.has(summary.status));
}
async function assertNoConflictingActiveEvolution(root, appId, dependencies, action, currentEvolutionId) {
    const conflict = conflictingActiveEvolution(await dependencies.listEvolutions(root), appId, currentEvolutionId);
    if (conflict !== undefined) {
        throw new TypeError(`Evolution '${conflict.evolutionId}' is already ${conflict.status} for app '${appId}'. Roll it back before attempting to ${action} another evolution.`);
    }
}
async function install(args, dependencies) {
    const installed = await dependencies.runRoot("init", {
        root: args.rootPath,
        apply: true,
        synthetic: args.synthetic,
        syntheticSpecified: true,
    });
    const discovery = installed.discovery;
    const installResult = installed.result;
    const application = {
        appId: discovery?.manifest?.appId ?? "unknown",
        nodes: discovery?.manifest?.nodes?.length ?? 0,
        edges: discovery?.manifest?.edges?.length ?? 0,
    };
    return result("install", installResult?.status ?? "installed", "Living Software is installed and observation is ready.", {
        root: installed.root,
        synthetic: args.synthetic,
        application,
        nextCommand: `living improve --root ${quote(args.rootPath)} --provider codex`,
    });
}
async function improve(args, dependencies) {
    const input = await dependencies.loadEvolutionInput(args.rootPath);
    const summaries = [...await dependencies.listEvolutions(args.rootPath)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const existing = await exactExistingEvolution(args.rootPath, input, dependencies, summaries);
    const activeConflict = conflictingActiveEvolution(summaries, input.application.appId, existing?.evolutionId);
    if (activeConflict !== undefined) {
        throw new TypeError(`Evolution '${activeConflict.evolutionId}' is already ${activeConflict.status} for app '${input.application.appId}'. Roll it back before attempting to prepare another evolution.`);
    }
    if (existing !== null) {
        if (existing.status === "rolled-back") {
            throw new TypeError("This evidence already produced a rolled-back evolution. Capture new workflow evidence before improving again.");
        }
        return result("improve", existing.status, "The exact evidence already has a governed improvement; no model call was repeated.", {
            root: input.root,
            reused: true,
            opportunity: {
                opportunityId: input.opportunity.opportunityId,
                signal: input.opportunity.signal.kind,
                confidence: input.opportunity.confidence.score,
            },
            evolution: evolutionProjection(existing),
            nextCommand: nextCommand(input.root, existing),
            ...(existing.status === "prepared"
                ? {
                    nextActionDetail: "The recommended command records exact human approval, then writes that same approved postimage.",
                }
                : {}),
        });
    }
    const intelligence = dependencies.createIntelligence(args.provider);
    const brief = await intelligence.draftEvolutionBrief({
        manifest: input.manifest,
        opportunity: input.opportunity,
        evidenceEvents: input.evidenceEvents,
    });
    const candidates = await dependencies.collectCandidates({
        repositoryRoot: input.root,
        manifest: input.manifest,
        brief: {
            affectedProductNodeIds: brief.draft.proposedChange.affectedProductNodeIds,
        },
    });
    const patch = await intelligence.draftSourcePatch({
        brief: brief.draft,
        candidates,
    });
    const target = candidates.find((candidate) => candidate.path === patch.proposal.target.path &&
        candidate.preimageHash === patch.proposal.target.preimageHash);
    if (target === undefined) {
        throw new TypeError("GPT-5.6 selected a source target outside the exact candidate projection");
    }
    await assertNoConflictingActiveEvolution(input.root, input.application.appId, dependencies, "prepare");
    const state = await dependencies.prepareEvolution({
        root: input.root,
        app: input.application,
        manifest: input.manifest,
        opportunity: input.opportunity,
        brief: gpt56EvolutionBriefSchema.parse(brief.draft),
        briefModelProvenance: intelligenceProvenanceSchema.parse(brief.provenance),
        patchProposal: sourcePatchProposalSchema.parse(patch.proposal),
        patchModelProvenance: sourcePatchModelProvenanceSchema.parse(patch.provenance),
        target: {
            path: target.path,
            preimage: target.content,
        },
    });
    return result("improve", "prepared", "GPT-5.6 proposed one bounded change. Proof passed; the source is still unchanged.", {
        root: input.root,
        reused: false,
        provider: {
            requested: args.provider,
            briefTransport: brief.provenance.transport,
            briefRunId: brief.provenance.codexThreadId ?? brief.provenance.responseId,
            patchTransport: patch.provenance.transport,
            patchRunId: patch.provenance.codexThreadId ?? patch.provenance.responseId,
        },
        opportunity: {
            opportunityId: input.opportunity.opportunityId,
            signal: input.opportunity.signal.kind,
            confidence: input.opportunity.confidence.score,
            affectedCases: input.opportunity.evidence.subjectCount,
            occurrences: input.opportunity.evidence.occurrenceCount,
            dataOrigin: input.opportunity.evidence.dataOrigin,
        },
        interpretation: {
            title: brief.draft.title,
            summary: brief.draft.proposedChange.summary,
            userValue: brief.draft.proposedChange.userValue,
        },
        proposal: proposalProjection(patch),
        evolution: evolutionProjection(state),
        nextCommand: nextCommand(input.root, state),
        nextActionDetail: "The recommended command records exact human approval, then writes that same approved postimage.",
    });
}
async function status(args, dependencies) {
    const doctor = await dependencies.runRoot("doctor", { root: args.rootPath });
    const diagnostics = Array.isArray(doctor.diagnostics)
        ? doctor.diagnostics
        : [];
    const installed = !diagnostics.some((diagnostic) => diagnostic.code === "NOT_INSTALLED" ||
        diagnostic.severity === "error");
    const evolutions = [...await dependencies.listEvolutions(args.rootPath)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const newest = evolutions[0];
    const newestState = newest === undefined
        ? null
        : await dependencies.getEvolution(args.rootPath, newest.evolutionId);
    const storedProposal = newestState === null
        ? null
        : storedProposalProjection(newestState);
    const storedProvider = newestState === null
        ? null
        : storedProviderProjection(newestState);
    return result("status", installed ? "ready" : "attention-required", installed
        ? evolutions.length === 0
            ? "Living Software is installed. No improvement has been prepared yet."
            : `Living Software is installed. Latest improvement is ${newest.status}.`
        : "Living Software needs attention before it can improve this application.", {
        root: doctor.root ?? args.rootPath,
        installed,
        diagnostics,
        evolutions,
        ...(storedProposal === null ? {} : { proposal: storedProposal }),
        ...(storedProvider === null ? {} : { provider: storedProvider }),
        ...(newest === undefined
            ? {
                nextCommand: installed
                    ? `living improve --root ${quote(args.rootPath)} --provider codex`
                    : `living install --root ${quote(args.rootPath)}`,
            }
            : {
                nextCommand: nextCommand(args.rootPath, newest),
            }),
    });
}
async function lifecycle(args, dependencies) {
    const current = await dependencies.getEvolution(args.rootPath, args.evolutionId);
    let updated;
    if (args.command === "approve") {
        await assertNoConflictingActiveEvolution(args.rootPath, current.app.appId, dependencies, "approve", current.evolutionId);
        const approved = await dependencies.approveEvolution({
            root: args.rootPath,
            evolutionId: current.evolutionId,
            humanId: args.actor,
            expectedArtifactHash: args.expectedArtifactHash,
            expectedProofHash: args.expectedProofHash,
            expectedRevision: current.receiptCount,
        });
        if (args.applyAfterApproval) {
            await assertNoConflictingActiveEvolution(args.rootPath, approved.app.appId, dependencies, "apply", approved.evolutionId);
            updated = await dependencies.applyEvolution({
                root: args.rootPath,
                evolutionId: approved.evolutionId,
                expectedRevision: approved.receiptCount,
            });
        }
        else {
            updated = approved;
        }
    }
    else if (args.command === "apply") {
        await assertNoConflictingActiveEvolution(args.rootPath, current.app.appId, dependencies, "apply", current.evolutionId);
        updated = await dependencies.applyEvolution({
            root: args.rootPath,
            evolutionId: current.evolutionId,
            expectedRevision: current.receiptCount,
        });
    }
    else {
        updated = await dependencies.rollbackEvolution({
            root: args.rootPath,
            evolutionId: current.evolutionId,
            humanId: args.actor,
            expectedRevision: current.receiptCount,
        });
    }
    const messages = {
        approve: args.command === "approve" && args.applyAfterApproval
            ? "The exact artifact and proof were approved, then that approved postimage was applied to the application source."
            : "The exact artifact and proof are approved. The application source is still unchanged.",
        apply: "The approved postimage was applied to the application source. Verify the running application next.",
        rollback: "The exact preimage was restored and the rollback receipt was recorded.",
    };
    return result(args.command, updated.status, messages[args.command], {
        root: args.rootPath,
        evolution: evolutionProjection(updated),
        nextCommand: nextCommand(args.rootPath, updated),
    });
}
export async function runTerminalCommand(args, overrides = {}) {
    const dependencies = {
        ...defaultDependencies,
        ...overrides,
    };
    switch (args.command) {
        case "install":
            return install(args, dependencies);
        case "improve":
            return improve(args, dependencies);
        case "status":
            return status(args, dependencies);
        case "approve":
        case "apply":
        case "rollback":
            return lifecycle(args, dependencies);
    }
}
function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : null;
}
export function formatTerminalResult(output) {
    const lines = ["", output.message];
    const application = record(output.application);
    if (application !== null) {
        lines.push(`App: ${String(application.appId)} · ${String(application.nodes)} mapped nodes · ${String(application.edges)} relationships`);
    }
    const opportunity = record(output.opportunity);
    if (opportunity !== null) {
        lines.push(`Trigger: ${String(opportunity.signal)} · confidence ${Math.round(Number(opportunity.confidence) * 100)}%`);
        if (opportunity.affectedCases !== undefined) {
            lines.push(`Evidence: ${String(opportunity.affectedCases)} workflows · ${String(opportunity.occurrences)} occurrences · ${String(opportunity.dataOrigin)}`);
        }
    }
    const interpretation = record(output.interpretation);
    if (interpretation !== null) {
        lines.push(`Problem: ${String(interpretation.title)}`);
    }
    const proposal = record(output.proposal);
    if (proposal !== null) {
        lines.push(`Proposal: ${String(proposal.summary)}`);
        lines.push(`File: ${String(proposal.targetPath)}`);
        const edits = Array.isArray(proposal.edits) ? proposal.edits : [];
        lines.push(`Edits: ${edits.length} bounded replacement${edits.length === 1 ? "" : "s"}`);
        const preview = record(proposal.patchPreview);
        if (preview !== null && typeof preview.text === "string") {
            lines.push("", preview.truncated === true
                ? "GPT patch preview (bounded; truncated):"
                : "GPT patch preview (exact model-authored edits):", preview.text);
        }
    }
    const provider = record(output.provider);
    if (provider !== null) {
        lines.push(`Model: ${String(provider.requested)} · brief run ${String(provider.briefRunId)} · code run ${String(provider.patchRunId)}`);
    }
    const evolution = record(output.evolution);
    if (evolution !== null) {
        lines.push(`Evolution: ${String(evolution.evolutionId)} · ${String(evolution.status)}`);
        if (evolution.artifactHash !== undefined) {
            lines.push(`Artifact hash: ${String(evolution.artifactHash)}`);
        }
        if (evolution.proofHash !== undefined) {
            lines.push(`Proof hash: ${String(evolution.proofHash)}`);
        }
        if (evolution.proofVerdict !== undefined) {
            lines.push(`Proof: ${String(evolution.proofVerdict)} · ${String(evolution.proofChecks)} checks`);
        }
    }
    if (Array.isArray(output.evolutions) && output.evolutions.length > 0) {
        lines.push("Evolutions:");
        for (const item of output.evolutions) {
            lines.push(`  ${item.status.padEnd(11)} ${item.evolutionId} · ${item.targetPath}`);
            lines.push(`    Artifact hash: ${item.artifactHash}`);
            lines.push(`    Proof hash: ${item.proofHash}`);
        }
    }
    if (typeof output.nextCommand === "string") {
        lines.push("", "Next:", `  ${output.nextCommand}`);
        if (typeof output.nextActionDetail === "string") {
            lines.push(`  ${output.nextActionDetail}`);
        }
    }
    return `${lines.join("\n")}\n`;
}
//# sourceMappingURL=terminal.js.map