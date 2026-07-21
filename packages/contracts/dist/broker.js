import { z } from "zod";
import { identifierSchema, jsonValueSchema, } from "./primitives.js";
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
export function parseBrokerInvocation(input) {
    return brokerInvocationSchema.parse(input);
}
export function parseBrokerResult(input) {
    return brokerResultSchema.parse(input);
}
//# sourceMappingURL=broker.js.map