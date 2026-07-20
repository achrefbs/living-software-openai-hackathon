import { z } from "zod";

import {
  identifierSchema,
  isoDateTimeSchema,
  jsonObjectSchema,
  sha256Schema,
} from "./primitives.js";

export const receiptKindSchema = z.enum([
  "opportunity.detected",
  "hypothesis.created",
  "contract.confirmed",
  "artifact.generated",
  "artifact.compiled",
  "proof.completed",
  "activation.approved",
  "installation.activated",
  "installation.disabled",
  "installation.rolled-back",
  "measurement.recorded",
  "opportunity.dismissed",
]);

export type ReceiptKind = z.infer<typeof receiptKindSchema>;

export const receiptActorSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("human"),
      id: identifierSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("system"),
      component: identifierSchema,
      version: z.string().min(1).max(64),
    })
    .strict(),
  z
    .object({
      type: z.literal("model"),
      provider: identifierSchema,
      model: z.string().min(1).max(120),
      runId: identifierSchema,
    })
    .strict(),
]);

export const evolutionReceiptSchema = z
  .object({
    schemaVersion: z.literal("living.evolution-receipt/v1"),
    receiptId: identifierSchema,
    appId: identifierSchema,
    evolutionId: identifierSchema,
    sequence: z.number().int().nonnegative(),
    previousHash: sha256Schema.nullable(),
    recordedAt: isoDateTimeSchema,
    kind: receiptKindSchema,
    actor: receiptActorSchema,
    refs: z
      .object({
        manifestHash: sha256Schema.optional(),
        opportunityHash: sha256Schema.optional(),
        contractHash: sha256Schema.optional(),
        artifactHash: sha256Schema.optional(),
        proofHash: sha256Schema.optional(),
      })
      .strict(),
    payload: jsonObjectSchema,
    payloadHash: sha256Schema,
    receiptHash: sha256Schema,
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.sequence === 0 && receipt.previousHash !== null) {
      context.addIssue({
        code: "custom",
        path: ["previousHash"],
        message: "The first receipt in a stream cannot have a previous hash",
      });
    }
    if (receipt.sequence > 0 && receipt.previousHash === null) {
      context.addIssue({
        code: "custom",
        path: ["previousHash"],
        message: "Non-initial receipts must reference the previous hash",
      });
    }

    if (
      (receipt.kind === "contract.confirmed" ||
        receipt.kind === "activation.approved") &&
      receipt.actor.type !== "human"
    ) {
      context.addIssue({
        code: "custom",
        path: ["actor"],
        message: "Contract confirmation and activation approval require a human",
      });
    }

    if (
      (receipt.kind === "hypothesis.created" ||
        receipt.kind === "artifact.generated") &&
      receipt.actor.type !== "model"
    ) {
      context.addIssue({
        code: "custom",
        path: ["actor"],
        message: "Model-created records require model provenance",
      });
    }

    if (
      receipt.kind === "artifact.compiled" &&
      receipt.actor.type !== "system"
    ) {
      context.addIssue({
        code: "custom",
        path: ["actor"],
        message: "Deterministically compiled artifacts require a system actor",
      });
    }

    const requiredRefs: Partial<Record<ReceiptKind, Array<keyof typeof receipt.refs>>> = {
      "opportunity.detected": ["manifestHash", "opportunityHash"],
      "hypothesis.created": ["opportunityHash"],
      "contract.confirmed": ["opportunityHash", "contractHash"],
      "artifact.generated": ["contractHash", "artifactHash"],
      "artifact.compiled": ["contractHash", "artifactHash"],
      "proof.completed": ["contractHash", "artifactHash", "proofHash"],
      "activation.approved": ["contractHash", "artifactHash", "proofHash"],
      "installation.activated": ["contractHash", "artifactHash", "proofHash"],
      "installation.disabled": ["artifactHash"],
      "installation.rolled-back": ["artifactHash"],
      "measurement.recorded": ["artifactHash"],
      "opportunity.dismissed": ["opportunityHash"],
    };

    for (const reference of requiredRefs[receipt.kind] ?? []) {
      if (receipt.refs[reference] === undefined) {
        context.addIssue({
          code: "custom",
          path: ["refs", reference],
          message: `Receipt kind '${receipt.kind}' requires ${reference}`,
        });
      }
    }
  });

export type EvolutionReceipt = z.infer<typeof evolutionReceiptSchema>;

export function parseEvolutionReceipt(input: unknown): EvolutionReceipt {
  return evolutionReceiptSchema.parse(input);
}
