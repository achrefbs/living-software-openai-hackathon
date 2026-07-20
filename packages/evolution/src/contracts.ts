import { z } from "zod";

import {
  gpt56EvolutionBriefSchema,
  intelligenceProvenanceSchema,
  opportunitySchema,
  productManifestSchema,
  identifierSchema,
  isoDateTimeSchema,
  relativePathSchema,
  sha256Schema,
} from "@living-software/contracts";

import { hashJson } from "./canonical.js";

export const SOURCE_EVOLUTION_ADAPTER = {
  id: "next-crm-lead-review-navigation",
  version: "v1",
  key: "next-crm-lead-review-navigation/v1",
} as const;

export const SOURCE_EVOLUTION_TARGET_PATH =
  "src/app/leads/[id]/page.tsx" as const;

export const SOURCE_EVOLUTION_HOOKS = [
  "lead-review-navigation",
  "previous-lead-button",
  "lead-review-position",
  "next-lead-button",
] as const;

export const SOURCE_EVOLUTION_PROHIBITIONS = [
  "network",
  "process",
  "secret-access",
  "arbitrary-code",
  "model-generated-code",
  "dynamic-code",
  "git",
  "multi-file",
  "symlink",
] as const;

export const SOURCE_EVOLUTION_TESTS = [
  "adapter.exact",
  "binding.exact",
  "target.single-file",
  "target.preimage-hash",
  "patch.deterministic",
  "ui.hooks-exact",
  "navigation.host-derived",
  "authority.model-free",
  "prohibitions.static",
  "rollback.exact-postimage",
] as const;

function exactOrderedList(values: readonly string[]) {
  return z
    .array(z.string())
    .length(values.length)
    .refine(
      (candidate) =>
        candidate.every((value, index) => value === values[index]),
      { message: "Expected the exact ordered policy list" },
    );
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

export type SourceEvolutionApplication = z.infer<
  typeof sourceEvolutionApplicationSchema
>;

export const sourceEvolutionModelProvenanceSchema =
  intelligenceProvenanceSchema;

export type SourceEvolutionModelProvenance = z.infer<
  typeof sourceEvolutionModelProvenanceSchema
>;

export const sourceEvolutionContractSchema = z
  .object({
    schemaVersion: z.literal("living.source-evolution-contract/v1"),
    adapter: z
      .object({
        id: z.literal(SOURCE_EVOLUTION_ADAPTER.id),
        version: z.literal(SOURCE_EVOLUTION_ADAPTER.version),
        key: z.literal(SOURCE_EVOLUTION_ADAPTER.key),
      })
      .strict(),
    target: z
      .object({
        path: z.literal(SOURCE_EVOLUTION_TARGET_PATH),
        allowedFileCount: z.literal(1),
        mutationMode: z.literal("exact-source-transform"),
      })
      .strict(),
    requiredHooks: exactOrderedList(SOURCE_EVOLUTION_HOOKS),
    prohibitions: exactOrderedList(SOURCE_EVOLUTION_PROHIBITIONS),
    deterministicTests: exactOrderedList(SOURCE_EVOLUTION_TESTS),
    generation: z
      .object({
        kind: z.literal("deterministic-adapter"),
        modelOutputAccepted: z.literal(false),
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

export type SourceEvolutionContract = z.infer<
  typeof sourceEvolutionContractSchema
>;

export const sourceEvolutionArtifactSchema = z
  .object({
    schemaVersion: z.literal("living.source-evolution-artifact/v1"),
    artifactId: identifierSchema,
    adapter: z
      .object({
        id: z.literal(SOURCE_EVOLUTION_ADAPTER.id),
        version: z.literal(SOURCE_EVOLUTION_ADAPTER.version),
        key: z.literal(SOURCE_EVOLUTION_ADAPTER.key),
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
        modelProvenanceHash: sha256Schema,
      })
      .strict(),
    interpretation: z
      .object({
        briefRole: z.literal("evidence-interpretation-only"),
        implementsBrief: z.literal(false),
        adapterCandidateBasis: z.literal("deterministic-opportunity-and-host"),
      })
      .strict(),
    target: z
      .object({
        path: z.literal(SOURCE_EVOLUTION_TARGET_PATH),
        allowedFileCount: z.literal(1),
        preimageHash: sha256Schema,
        postimageHash: sha256Schema,
      })
      .strict(),
    transform: z.literal("next-crm-lead-review-navigation/v1"),
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

export type SourceEvolutionArtifact = z.infer<
  typeof sourceEvolutionArtifactSchema
>;

const proofCheckSchema = z
  .object({
    id: z.enum(SOURCE_EVOLUTION_TESTS),
    status: z.literal("passed"),
    detail: z.string().min(1).max(500),
  })
  .strict();

export const sourceEvolutionProofSchema = z
  .object({
    schemaVersion: z.literal("living.source-evolution-proof/v1"),
    proofId: identifierSchema,
    contractHash: sha256Schema,
    artifactHash: sha256Schema,
    target: z
      .object({
        path: z.literal(SOURCE_EVOLUTION_TARGET_PATH),
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
    if (
      !checkIds.every(
        (checkId, index) => checkId === SOURCE_EVOLUTION_TESTS[index],
      )
    ) {
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

export type SourceEvolutionProof = z.infer<
  typeof sourceEvolutionProofSchema
>;

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
    schemaVersion: z.literal("living.source-evolution-state/v1"),
    evolutionId: identifierSchema,
    app: sourceEvolutionApplicationSchema,
    status: z.enum(["prepared", "approved", "applied", "rolled-back"]),
    bindings: z
      .object({
        appHash: sha256Schema,
        manifestHash: sha256Schema,
        manifestInputHash: sha256Schema,
        opportunityId: identifierSchema,
        opportunityHash: sha256Schema,
        briefId: identifierSchema,
        briefHash: sha256Schema,
        modelProvenanceHash: sha256Schema,
      })
      .strict(),
    contract: sourceEvolutionContractSchema,
    inputs: z
      .object({
        manifest: productManifestSchema,
        opportunity: opportunitySchema,
        brief: gpt56EvolutionBriefSchema,
      })
      .strict(),
    modelProvenance: sourceEvolutionModelProvenanceSchema,
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
    const invalidLifecycle =
      (state.status === "prepared" &&
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

    if (
      state.bindings.appHash !== state.artifact.bindings.appHash ||
      state.bindings.manifestHash !== state.artifact.bindings.manifestHash ||
      state.bindings.manifestInputHash !==
        state.artifact.bindings.manifestInputHash ||
      state.bindings.opportunityId !==
        state.artifact.bindings.opportunityId ||
      state.bindings.opportunityHash !==
        state.artifact.bindings.opportunityHash ||
      state.bindings.briefId !== state.artifact.bindings.briefId ||
      state.bindings.briefHash !== state.artifact.bindings.briefHash ||
      state.bindings.modelProvenanceHash !==
        state.artifact.bindings.modelProvenanceHash ||
      state.bindings.manifestInputHash !== hashJson(state.inputs.manifest) ||
      state.bindings.opportunityHash !== hashJson(state.inputs.opportunity) ||
      state.bindings.briefHash !== hashJson(state.inputs.brief) ||
      state.bindings.modelProvenanceHash !==
        hashJson(state.modelProvenance)
    ) {
      context.addIssue({
        code: "custom",
        path: ["bindings"],
        message: "State and artifact input bindings must match exactly",
      });
    }

    if (
      state.contract.contentHash !== state.artifact.contractHash ||
      state.proof.contractHash !== state.contract.contentHash ||
      state.proof.artifactHash !== state.artifact.contentHash ||
      state.proof.target.preimageHash !== state.artifact.target.preimageHash ||
      state.proof.target.postimageHash !== state.artifact.target.postimageHash
    ) {
      context.addIssue({
        code: "custom",
        path: ["proof"],
        message: "Contract, artifact, and proof hashes must form one exact chain",
      });
    }
  });

export type SourceEvolutionState = z.infer<
  typeof sourceEvolutionStateSchema
>;

export const sourceEvolutionSummarySchema = z
  .object({
    evolutionId: identifierSchema,
    appId: identifierSchema,
    status: z.enum(["prepared", "approved", "applied", "rolled-back"]),
    targetPath: z.literal(SOURCE_EVOLUTION_TARGET_PATH),
    artifactHash: sha256Schema,
    proofHash: sha256Schema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export type SourceEvolutionSummary = z.infer<
  typeof sourceEvolutionSummarySchema
>;

export function parseSourceEvolutionState(
  input: unknown,
): SourceEvolutionState {
  return sourceEvolutionStateSchema.parse(input);
}
