import { z } from "zod";

import {
  identifierSchema,
  jsonValueSchema,
} from "./primitives.js";

export const brokerInvocationSchema = z
  .object({
    invocationId: identifierSchema,
    installationId: identifierSchema,
    operationId: identifierSchema,
    operationVersion: z.string().min(1).max(64),
    input: jsonValueSchema,
    idempotencyKey: z.string().min(1).max(256).optional(),
  })
  .strict();

export type BrokerInvocation = z.infer<typeof brokerInvocationSchema>;

export const brokerResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      output: jsonValueSchema,
      receiptId: identifierSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: z.enum([
            "not-granted",
            "schema-invalid",
            "confirmation-required",
            "operation-failed",
            "budget-exceeded",
          ]),
          message: z.string().min(1).max(1_000),
        })
        .strict(),
      receiptId: identifierSchema,
    })
    .strict(),
]);

export type BrokerResult = z.infer<typeof brokerResultSchema>;

export function parseBrokerInvocation(input: unknown): BrokerInvocation {
  return brokerInvocationSchema.parse(input);
}

export function parseBrokerResult(input: unknown): BrokerResult {
  return brokerResultSchema.parse(input);
}
