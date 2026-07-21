import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { gpt56EvolutionBriefSchema, identifierSchema, intelligenceProvenanceSchema, isoDateTimeSchema, opportunitySchema, productManifestSchema, relativePathSchema, sha256Schema, } from "@living-software/contracts";
import { hashJson } from "./canonical.js";
import { MODEL_PATCH_PROOF_CHECK_IDS, sourcePatchProposalSchema, } from "./model-patch.js";
export const SOURCE_EVOLUTION_POLICY = {
    id: "bounded-model-ui-patch",
    version: "v2",
    key: "bounded-model-ui-patch/v2",
};
export const SOURCE_EVOLUTION_PROHIBITIONS = [
    "network-authority",
    "process-authority",
    "secret-access",
    "dynamic-code",
    "server-authority",
    "git",
    "multi-file",
    "new-file",
    "symlink",
    "dependency-change",
];
export const SOURCE_EVOLUTION_TESTS = [
    "binding.exact",
    "target.manifest-sourced",
    ...MODEL_PATCH_PROOF_CHECK_IDS,
    "authority.engine-owned",
    "rollback.exact-postimage",
];
function exactOrderedList(values) {
    return z
        .array(z.string())
        .length(values.length)
        .refine((candidate) => candidate.every((value, index) => value === values[index]), { message: "Expected the exact ordered policy list" });
}
export const sourceEvolutionApplicationSchema = z
    .object({
    appId: identifierSchema,
    displayName: z.string().min(1).max(120),
    environment: z.enum(["development", "preview", "production"]),
    releaseRevision: z.string().min(1).max(160),
    manifestHash: sha256Schema,
    dataOrigin: z.enum(["observed", "synthetic", "mixed"]),
})
    .strict();
const sourceCandidateIdentitySchema = z
    .object({
    path: relativePathSchema,
    preimageHash: sha256Schema,
})
    .strict();
const intelligenceTokenUsageSchema = z
    .object({
    inputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    reasoningOutputTokens: z.number().int().nonnegative(),
})
    .strict();
export const sourcePatchModelProvenanceSchema = z
    .object({
    provider: z.literal("openai"),
    transport: z.enum(["responses-api", "codex-cli"]),
    boundaryRequestedModel: z.literal("gpt-5.6"),
    transportRequestedModel: z.enum(["gpt-5.6", "gpt-5.6-terra"]),
    actualResponseModel: z.string().min(1).max(256).nullable(),
    responseId: z.string().min(1).max(256).nullable(),
    codexThreadId: z.string().min(1).max(256).nullable(),
    responseStoreRequested: z.union([z.literal(false), z.null()]),
    localSessionPersisted: z.union([z.literal(false), z.null()]),
    tokenUsage: intelligenceTokenUsageSchema.nullable(),
    sourceCandidates: z.array(sourceCandidateIdentitySchema).min(1).max(3),
})
    .strict()
    .superRefine((provenance, context) => {
    const paths = provenance.sourceCandidates.map((candidate) => candidate.path);
    if (new Set(paths).size !== paths.length) {
        context.addIssue({
            code: "custom",
            path: ["sourceCandidates"],
            message: "Source candidate paths must be unique",
        });
    }
    if (provenance.transport === "codex-cli") {
        if (provenance.transportRequestedModel !== "gpt-5.6-terra" ||
            provenance.actualResponseModel !== null ||
            provenance.responseId !== null ||
            provenance.codexThreadId === null ||
            provenance.responseStoreRequested !== null ||
            provenance.localSessionPersisted !== false ||
            provenance.tokenUsage === null) {
            context.addIssue({
                code: "custom",
                path: ["transport"],
                message: "Codex CLI source-patch provenance is contradictory",
            });
        }
    }
    else if (provenance.transportRequestedModel !== "gpt-5.6" ||
        provenance.actualResponseModel === null ||
        !/^gpt-5\.6(?:$|[-_])/u.test(provenance.actualResponseModel) ||
        provenance.responseId === null ||
        provenance.codexThreadId !== null ||
        provenance.responseStoreRequested !== false ||
        provenance.localSessionPersisted !== null) {
        context.addIssue({
            code: "custom",
            path: ["transport"],
            message: "Responses API source-patch provenance is contradictory",
        });
    }
});
export const sourceEvolutionContractSchema = z
    .object({
    schemaVersion: z.literal("living.source-evolution-contract/v2"),
    policy: z
        .object({
        id: z.literal(SOURCE_EVOLUTION_POLICY.id),
        version: z.literal(SOURCE_EVOLUTION_POLICY.version),
        key: z.literal(SOURCE_EVOLUTION_POLICY.key),
    })
        .strict(),
    target: z
        .object({
        path: relativePathSchema,
        allowedFileCount: z.literal(1),
        mutationMode: z.literal("exact-model-edit-program"),
    })
        .strict(),
    prohibitions: exactOrderedList(SOURCE_EVOLUTION_PROHIBITIONS),
    deterministicTests: exactOrderedList(SOURCE_EVOLUTION_TESTS),
    generation: z
        .object({
        kind: z.literal("model-proposed-bounded-edits"),
        modelOutputAcceptedAsProposal: z.literal(true),
        modelApplicationAuthority: z.literal(false),
        filesystemAuthorityOwnedByEngine: z.literal(true),
        arbitraryCodeAccepted: z.literal(false),
        gitInvocationAllowed: z.literal(false),
    })
        .strict(),
    approval: z
        .object({
        humanRequired: z.literal(true),
        bindsExactContractArtifactAndProof: z.literal(true),
    })
        .strict(),
    rollback: z
        .object({
        required: z.literal(true),
        condition: z.literal("exact-postimage-only"),
    })
        .strict(),
    contentHash: sha256Schema,
})
    .strict()
    .superRefine((contract, context) => {
    const { contentHash, ...content } = contract;
    if (hashJson(content) !== contentHash) {
        context.addIssue({
            code: "custom",
            path: ["contentHash"],
            message: "Source evolution contract hash does not match its content",
        });
    }
});
export const sourceEvolutionArtifactSchema = z
    .object({
    schemaVersion: z.literal("living.source-evolution-artifact/v2"),
    artifactId: identifierSchema,
    policy: z
        .object({
        id: z.literal(SOURCE_EVOLUTION_POLICY.id),
        version: z.literal(SOURCE_EVOLUTION_POLICY.version),
        key: z.literal(SOURCE_EVOLUTION_POLICY.key),
    })
        .strict(),
    contractHash: sha256Schema,
    bindings: z
        .object({
        appHash: sha256Schema,
        manifestHash: sha256Schema,
        manifestInputHash: sha256Schema,
        opportunityId: identifierSchema,
        opportunityHash: sha256Schema,
        briefId: identifierSchema,
        briefHash: sha256Schema,
        briefModelProvenanceHash: sha256Schema,
        patchProposalId: identifierSchema,
        patchProposalHash: sha256Schema,
        patchModelProvenanceHash: sha256Schema,
    })
        .strict(),
    generation: z
        .object({
        proposalOrigin: z.literal("gpt-5.6"),
        proposalRole: z.literal("untrusted-bounded-source-proposal"),
        compiler: z.literal("exact-anchor-engine/v1"),
        modelAppliedSource: z.literal(false),
    })
        .strict(),
    target: z
        .object({
        path: relativePathSchema,
        allowedFileCount: z.literal(1),
        preimageHash: sha256Schema,
        postimageHash: sha256Schema,
    })
        .strict(),
    transform: z.literal("bounded-exact-anchor-edits/v1"),
    contentHash: sha256Schema,
})
    .strict()
    .superRefine((artifact, context) => {
    const { contentHash, ...content } = artifact;
    if (hashJson(content) !== contentHash) {
        context.addIssue({
            code: "custom",
            path: ["contentHash"],
            message: "Source evolution artifact hash does not match its content",
        });
    }
});
const proofCheckSchema = z
    .object({
    id: z.enum(SOURCE_EVOLUTION_TESTS),
    status: z.literal("passed"),
    detail: z.string().min(1).max(500),
})
    .strict();
export const sourceEvolutionProofSchema = z
    .object({
    schemaVersion: z.literal("living.source-evolution-proof/v2"),
    proofId: identifierSchema,
    contractHash: sha256Schema,
    artifactHash: sha256Schema,
    target: z
        .object({
        path: relativePathSchema,
        preimageHash: sha256Schema,
        postimageHash: sha256Schema,
    })
        .strict(),
    checks: z.array(proofCheckSchema).length(SOURCE_EVOLUTION_TESTS.length),
    verdict: z.literal("passed"),
    proofHash: sha256Schema,
})
    .strict()
    .superRefine((proof, context) => {
    const checkIds = proof.checks.map((check) => check.id);
    if (!checkIds.every((checkId, index) => checkId === SOURCE_EVOLUTION_TESTS[index])) {
        context.addIssue({
            code: "custom",
            path: ["checks"],
            message: "Proof must contain every deterministic check exactly once",
        });
    }
    const { proofHash, ...content } = proof;
    if (hashJson(content) !== proofHash) {
        context.addIssue({
            code: "custom",
            path: ["proofHash"],
            message: "Source evolution proof hash does not match its content",
        });
    }
});
const sourceEvolutionApprovalSchema = z
    .object({
    humanId: identifierSchema,
    approvedAt: isoDateTimeSchema,
    contractHash: sha256Schema,
    artifactHash: sha256Schema,
    proofHash: sha256Schema,
    receiptHash: sha256Schema,
})
    .strict();
const sourceEvolutionApplicationRecordSchema = z
    .object({
    appliedAt: isoDateTimeSchema,
    preimageHash: sha256Schema,
    postimageHash: sha256Schema,
    receiptHash: sha256Schema,
})
    .strict();
const sourceEvolutionRollbackSchema = z
    .object({
    humanId: identifierSchema,
    rolledBackAt: isoDateTimeSchema,
    fromHash: sha256Schema,
    toHash: sha256Schema,
    receiptHash: sha256Schema,
})
    .strict();
export const sourceEvolutionStateSchema = z
    .object({
    schemaVersion: z.literal("living.source-evolution-state/v2"),
    evolutionId: identifierSchema,
    app: sourceEvolutionApplicationSchema,
    status: z.enum(["prepared", "approved", "applied", "rolled-back"]),
    bindings: sourceEvolutionArtifactSchema.shape.bindings,
    contract: sourceEvolutionContractSchema,
    inputs: z
        .object({
        manifest: productManifestSchema,
        opportunity: opportunitySchema,
        brief: gpt56EvolutionBriefSchema,
        patchProposal: sourcePatchProposalSchema,
    })
        .strict(),
    modelProvenance: z
        .object({
        brief: intelligenceProvenanceSchema,
        patch: sourcePatchModelProvenanceSchema,
    })
        .strict(),
    artifact: sourceEvolutionArtifactSchema,
    proof: sourceEvolutionProofSchema,
    source: z
        .object({
        preimage: z.string().min(1).max(2_000_000),
        postimage: z.string().min(1).max(2_000_000),
    })
        .strict(),
    approval: sourceEvolutionApprovalSchema.nullable(),
    application: sourceEvolutionApplicationRecordSchema.nullable(),
    rollback: sourceEvolutionRollbackSchema.nullable(),
    storage: z
        .object({
        directory: relativePathSchema,
        statePath: relativePathSchema,
        receiptsPath: relativePathSchema,
    })
        .strict(),
    receiptCount: z.number().int().positive(),
    chainHead: sha256Schema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
})
    .strict()
    .superRefine((state, context) => {
    const invalidLifecycle = (state.status === "prepared" &&
        (state.approval !== null ||
            state.application !== null ||
            state.rollback !== null)) ||
        (state.status === "approved" &&
            (state.approval === null ||
                state.application !== null ||
                state.rollback !== null)) ||
        (state.status === "applied" &&
            (state.approval === null ||
                state.application === null ||
                state.rollback !== null)) ||
        (state.status === "rolled-back" &&
            (state.approval === null ||
                state.application === null ||
                state.rollback === null));
    if (invalidLifecycle) {
        context.addIssue({
            code: "custom",
            path: ["status"],
            message: "Source evolution lifecycle records contradict its status",
        });
    }
    const proposalHash = hashJson(state.inputs.patchProposal);
    const targetCandidate = state.modelProvenance.patch.sourceCandidates.find((candidate) => candidate.path === state.inputs.patchProposal.target.path);
    if (state.bindings.appHash !== hashJson(state.app) ||
        state.bindings.manifestHash !== state.inputs.manifest.contentHash ||
        state.bindings.manifestInputHash !== hashJson(state.inputs.manifest) ||
        state.bindings.opportunityId !== state.inputs.opportunity.opportunityId ||
        state.bindings.opportunityHash !== hashJson(state.inputs.opportunity) ||
        state.bindings.briefId !== state.inputs.brief.briefId ||
        state.bindings.briefHash !== hashJson(state.inputs.brief) ||
        state.bindings.briefModelProvenanceHash !==
            hashJson(state.modelProvenance.brief) ||
        state.bindings.patchProposalId !==
            state.inputs.patchProposal.proposalId ||
        state.bindings.patchProposalHash !== proposalHash ||
        state.bindings.patchModelProvenanceHash !==
            hashJson(state.modelProvenance.patch) ||
        targetCandidate?.preimageHash !==
            state.inputs.patchProposal.target.preimageHash ||
        !isDeepStrictEqual(state.bindings, state.artifact.bindings)) {
        context.addIssue({
            code: "custom",
            path: ["bindings"],
            message: "State, model runs, proposal, and artifact bindings must match exactly",
        });
    }
    if (state.contract.contentHash !== state.artifact.contractHash ||
        state.proof.contractHash !== state.contract.contentHash ||
        state.proof.artifactHash !== state.artifact.contentHash ||
        state.contract.target.path !== state.artifact.target.path ||
        state.artifact.target.path !== state.proof.target.path ||
        state.artifact.target.path !== state.inputs.patchProposal.target.path ||
        state.proof.target.preimageHash !== state.artifact.target.preimageHash ||
        state.proof.target.postimageHash !== state.artifact.target.postimageHash) {
        context.addIssue({
            code: "custom",
            path: ["proof"],
            message: "Contract, target, artifact, and proof must form one exact chain",
        });
    }
});
export const sourceEvolutionSummarySchema = z
    .object({
    evolutionId: identifierSchema,
    appId: identifierSchema,
    status: z.enum(["prepared", "approved", "applied", "rolled-back"]),
    targetPath: relativePathSchema,
    artifactHash: sha256Schema,
    proofHash: sha256Schema,
    updatedAt: isoDateTimeSchema,
})
    .strict();
export function parseSourceEvolutionState(input) {
    return sourceEvolutionStateSchema.parse(input);
}
//# sourceMappingURL=contracts.js.map