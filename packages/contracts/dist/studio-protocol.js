import { z } from "zod";
import { capabilityContractSchema } from "./capability.js";
import { identifierSchema, sha256Schema } from "./primitives.js";
export const studioCommandSchema = z.discriminatedUnion("type", [
    z
        .object({
        type: z.literal("contract.confirm"),
        evolutionId: identifierSchema,
        contract: capabilityContractSchema,
    })
        .strict(),
    z
        .object({
        type: z.literal("generation.request"),
        evolutionId: identifierSchema,
        contractHash: sha256Schema,
    })
        .strict(),
    z
        .object({
        type: z.literal("proof.request"),
        evolutionId: identifierSchema,
        artifactHash: sha256Schema,
    })
        .strict(),
    z
        .object({
        type: z.literal("activation.approve"),
        evolutionId: identifierSchema,
        contractHash: sha256Schema,
        artifactHash: sha256Schema,
        proofHash: sha256Schema,
    })
        .strict(),
    z
        .object({
        type: z.literal("installation.activate"),
        evolutionId: identifierSchema,
        approvalReceiptId: identifierSchema,
    })
        .strict(),
    z
        .object({
        type: z.literal("installation.disable"),
        installationId: identifierSchema,
    })
        .strict(),
    z
        .object({
        type: z.literal("installation.rollback"),
        installationId: identifierSchema,
    })
        .strict(),
    z
        .object({
        type: z.literal("opportunity.dismiss"),
        opportunityId: identifierSchema,
        reasonCode: identifierSchema,
    })
        .strict(),
]);
export const studioCommandEnvelopeSchema = z
    .object({
    schemaVersion: z.literal("living.studio-command/v1"),
    commandId: identifierSchema,
    appId: identifierSchema,
    expectedRevision: z.number().int().nonnegative(),
    command: studioCommandSchema,
})
    .strict()
    .superRefine((envelope, context) => {
    if (envelope.command.type === "contract.confirm" &&
        envelope.command.contract.appId !== envelope.appId) {
        context.addIssue({
            code: "custom",
            path: ["command", "contract", "appId"],
            message: "Confirmed contract appId must match the command appId",
        });
    }
});
export function parseStudioCommandEnvelope(input) {
    return studioCommandEnvelopeSchema.parse(input);
}
export const studioCommandResultSchema = z
    .object({
    schemaVersion: z.literal("living.studio-result/v1"),
    commandId: identifierSchema,
    accepted: z.boolean(),
    revision: z.number().int().nonnegative(),
    receiptId: identifierSchema.optional(),
    error: z
        .object({
        code: z.enum([
            "validation-failed",
            "revision-conflict",
            "illegal-transition",
            "proof-required",
            "approval-required",
            "not-found",
        ]),
        message: z.string().min(1).max(1_000),
    })
        .strict()
        .optional(),
})
    .strict()
    .superRefine((result, context) => {
    if (result.accepted && result.error !== undefined) {
        context.addIssue({
            code: "custom",
            path: ["error"],
            message: "Accepted commands cannot contain an error",
        });
    }
    if (!result.accepted && result.error === undefined) {
        context.addIssue({
            code: "custom",
            path: ["error"],
            message: "Rejected commands require an error",
        });
    }
});
export function parseStudioCommandResult(input) {
    return studioCommandResultSchema.parse(input);
}
//# sourceMappingURL=studio-protocol.js.map