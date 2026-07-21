import { z } from "zod";
import { workflowEventKindSchema } from "./config.js";
import { eventNameSchema, identifierSchema, invariantResult, isoDateTimeSchema, jsonObjectSchema, sha256Schema, } from "./primitives.js";
export const workflowEventSchema = z
    .object({
    schemaVersion: z.literal("living.workflow-event/v1"),
    eventId: identifierSchema,
    appId: identifierSchema,
    environment: z.enum(["development", "preview", "production"]),
    releaseRevision: z.string().min(1).max(160),
    occurredAt: isoDateTimeSchema,
    sequence: z.number().int().nonnegative(),
    name: eventNameSchema,
    kind: workflowEventKindSchema,
    status: z.enum(["started", "succeeded", "failed", "abandoned"]),
    sessionId: identifierSchema,
    actor: z
        .object({
        pseudonymousId: identifierSchema,
    })
        .strict()
        .optional(),
    subject: z
        .object({
        type: identifierSchema,
        pseudonymousId: identifierSchema,
    })
        .strict()
        .optional(),
    product: z
        .object({
        manifestHash: sha256Schema,
        nodeId: identifierSchema,
        surfaceId: identifierSchema.optional(),
    })
        .strict()
        .optional(),
    trace: z
        .object({
        traceId: z.string().min(1).max(128),
        spanId: z.string().min(1).max(128).optional(),
    })
        .strict()
        .optional(),
    durationMs: z.number().int().nonnegative().max(86_400_000).optional(),
    metadata: jsonObjectSchema,
    provenance: z
        .object({
        source: z.enum([
            "sdk",
            "technical-telemetry",
            "simulator",
            "import",
        ]),
        synthetic: z.boolean(),
    })
        .strict(),
})
    .strict()
    .superRefine((event, context) => {
    if ((event.provenance.source === "simulator" ||
        event.provenance.source === "import") &&
        !event.provenance.synthetic) {
        context.addIssue({
            code: "custom",
            path: ["provenance", "synthetic"],
            message: "Simulator and imported events must be marked synthetic",
        });
    }
});
export function parseWorkflowEvent(input) {
    return workflowEventSchema.parse(input);
}
export function validateWorkflowEventAgainstConfig(event, config) {
    const issues = [];
    if (event.appId !== config.application.id) {
        issues.push("Event appId does not match the configured application");
    }
    const definition = config.semantics.events[event.name];
    if (definition === undefined) {
        issues.push(`Event '${event.name}' is not declared in LivingConfig`);
    }
    else {
        if (definition.kind !== event.kind) {
            issues.push(`Event '${event.name}' has a different declared kind`);
        }
        if (definition.subjectType !== undefined &&
            event.subject?.type !== definition.subjectType) {
            issues.push(`Event '${event.name}' requires its declared subject type`);
        }
        const declaredProperties = definition.metadataSchema.properties;
        if (declaredProperties !== undefined &&
            typeof declaredProperties === "object" &&
            declaredProperties !== null &&
            !Array.isArray(declaredProperties)) {
            const allowedKeys = new Set(Object.keys(declaredProperties));
            for (const key of Object.keys(event.metadata)) {
                if (!allowedKeys.has(key)) {
                    issues.push(`Event metadata key '${key}' is not allowlisted`);
                }
            }
        }
        else if (Object.keys(event.metadata).length > 0) {
            issues.push("Event metadata is present but no properties are allowlisted");
        }
    }
    if (config.privacy.identifierMode === "anonymous" &&
        (event.actor !== undefined || event.subject !== undefined)) {
        issues.push("Anonymous configuration does not accept actor or subject ids");
    }
    return invariantResult(issues);
}
//# sourceMappingURL=workflow-event.js.map