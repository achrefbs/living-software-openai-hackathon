import { z } from "zod";
import { contentRefSchema, identifierSchema, invariantResult, jsonObjectSchema, jsonPrimitiveSchema, sha256Schema, } from "./primitives.js";
export const operationGrantSchema = z
    .object({
    operationId: identifierSchema,
    operationVersion: z.string().min(1).max(64),
    maxCalls: z.number().int().positive().max(1_000),
    inputConstraint: jsonObjectSchema.optional(),
})
    .strict();
export const capabilityContractSchema = z
    .object({
    schemaVersion: z.literal("living.capability-contract/v1"),
    contractId: identifierSchema,
    revision: z.number().int().positive(),
    appId: identifierSchema,
    source: z
        .object({
        opportunityId: identifierSchema,
        opportunityHash: sha256Schema,
        hypothesisRef: contentRefSchema.optional(),
    })
        .strict(),
    target: z
        .object({
        manifestHash: sha256Schema,
        hostInterfaceHash: sha256Schema,
        extensionPointId: identifierSchema,
    })
        .strict(),
    display: z
        .object({
        name: z.string().min(1).max(120),
        purpose: z.string().min(1).max(1_000),
    })
        .strict(),
    inputSchema: jsonObjectSchema,
    outputSchema: jsonObjectSchema,
    grants: z.array(operationGrantSchema).max(128),
    prohibitions: z
        .array(z.enum([
        "undeclared-operation",
        "network",
        "filesystem",
        "process",
        "secret-access",
        "dynamic-code",
    ]))
        .min(1),
    budgets: z
        .object({
        maxDurationMs: z.number().int().positive().max(300_000),
        maxOperationCalls: z.number().int().positive().max(10_000),
        maxOutputBytes: z.number().int().positive().max(10_000_000),
    })
        .strict(),
    acceptanceTests: z
        .array(z
        .object({
        testId: identifierSchema,
        fixtureRef: contentRefSchema.optional(),
    })
        .strict())
        .min(1)
        .max(128),
    rollback: z
        .object({
        strategy: z.literal("deactivate"),
        preserveReceipts: z.literal(true),
    })
        .strict(),
    contentHash: sha256Schema,
})
    .strict()
    .superRefine((contract, context) => {
    if (!contract.prohibitions.includes("undeclared-operation")) {
        context.addIssue({
            code: "custom",
            path: ["prohibitions"],
            message: "Contracts must prohibit undeclared broker operations",
        });
    }
    const prohibitionSet = new Set(contract.prohibitions);
    if (prohibitionSet.size !== contract.prohibitions.length) {
        context.addIssue({
            code: "custom",
            path: ["prohibitions"],
            message: "Contract prohibitions must be unique",
        });
    }
    const grantKeys = contract.grants.map((grant) => `${grant.operationId}@${grant.operationVersion}`);
    if (new Set(grantKeys).size !== grantKeys.length) {
        context.addIssue({
            code: "custom",
            path: ["grants"],
            message: "Operation grants must be unique",
        });
    }
    const totalGrantedCalls = contract.grants.reduce((total, grant) => total + grant.maxCalls, 0);
    if (totalGrantedCalls > contract.budgets.maxOperationCalls) {
        context.addIssue({
            code: "custom",
            path: ["budgets", "maxOperationCalls"],
            message: "Operation budget cannot be lower than the granted call total",
        });
    }
    const testIds = contract.acceptanceTests.map((test) => test.testId);
    if (new Set(testIds).size !== testIds.length) {
        context.addIssue({
            code: "custom",
            path: ["acceptanceTests"],
            message: "Acceptance test ids must be unique",
        });
    }
});
export function parseCapabilityContract(input) {
    return capabilityContractSchema.parse(input);
}
const templateReferenceSchema = z
    .object({
    $value: z.discriminatedUnion("source", [
        z
            .object({
            source: z.literal("input"),
            path: z.array(z.string().min(1).max(128)).max(32),
        })
            .strict(),
        z
            .object({
            source: z.literal("context"),
            key: z.enum(["actorId", "sessionId", "subjectType", "subjectId"]),
        })
            .strict(),
        z
            .object({
            source: z.literal("step"),
            stepId: identifierSchema,
            path: z.array(z.string().min(1).max(128)).max(32),
        })
            .strict(),
    ]),
})
    .strict();
export const templateValueSchema = z.lazy(() => z.union([
    jsonPrimitiveSchema,
    templateReferenceSchema,
    z.array(templateValueSchema),
    z.record(z.string(), templateValueSchema),
]));
export const capabilityArtifactSchema = z
    .object({
    schemaVersion: z.literal("living.capability-artifact/v1"),
    artifactId: identifierSchema,
    artifactVersion: z.string().min(1).max(64),
    appId: identifierSchema,
    contract: z
        .object({
        id: identifierSchema,
        hash: sha256Schema,
    })
        .strict(),
    target: z
        .object({
        manifestHash: sha256Schema,
        hostInterfaceHash: sha256Schema,
        extensionPointId: identifierSchema,
    })
        .strict(),
    format: z.literal("broker-workflow/v1"),
    presentation: z
        .object({
        label: z.string().min(1).max(80),
        description: z.string().min(1).max(500),
        confirmationLabel: z.string().min(1).max(120).optional(),
    })
        .strict(),
    steps: z
        .array(z
        .object({
        id: identifierSchema,
        operationId: identifierSchema,
        operationVersion: z.string().min(1).max(64),
        input: templateValueSchema,
        onFailure: z.literal("stop"),
    })
        .strict())
        .min(1)
        .max(1_000),
    output: templateValueSchema,
    contentHash: sha256Schema,
})
    .strict()
    .superRefine((artifact, context) => {
    const stepIds = artifact.steps.map((step) => step.id);
    if (new Set(stepIds).size !== stepIds.length) {
        context.addIssue({
            code: "custom",
            path: ["steps"],
            message: "Artifact step ids must be unique",
        });
    }
    const availableSteps = new Set();
    artifact.steps.forEach((step, index) => {
        for (const referencedStep of collectStepReferences(step.input)) {
            if (!availableSteps.has(referencedStep)) {
                context.addIssue({
                    code: "custom",
                    path: ["steps", index, "input"],
                    message: `Step '${step.id}' references unavailable step '${referencedStep}'`,
                });
            }
        }
        availableSteps.add(step.id);
    });
    for (const referencedStep of collectStepReferences(artifact.output)) {
        if (!availableSteps.has(referencedStep)) {
            context.addIssue({
                code: "custom",
                path: ["output"],
                message: `Output references unavailable step '${referencedStep}'`,
            });
        }
    }
});
export function parseCapabilityArtifact(input) {
    return capabilityArtifactSchema.parse(input);
}
export function validateCapabilityArtifactAgainstContract(artifact, contract, host) {
    const issues = [];
    if (artifact.appId !== contract.appId || artifact.appId !== host.appId) {
        issues.push("Artifact, contract, and host appIds must match");
    }
    if (artifact.contract.id !== contract.contractId ||
        artifact.contract.hash !== contract.contentHash) {
        issues.push("Artifact must reference the exact capability contract");
    }
    if (artifact.target.manifestHash !== contract.target.manifestHash ||
        artifact.target.hostInterfaceHash !== contract.target.hostInterfaceHash ||
        artifact.target.hostInterfaceHash !== host.contentHash ||
        artifact.target.extensionPointId !== contract.target.extensionPointId) {
        issues.push("Artifact target must match the contract and host interface");
    }
    if (!host.extensionPoints.some((point) => point.id === artifact.target.extensionPointId)) {
        issues.push("Artifact extension point is not advertised by the host");
    }
    const grants = new Map(contract.grants.map((grant) => [
        `${grant.operationId}@${grant.operationVersion}`,
        grant,
    ]));
    const hostOperations = new Set(host.operations.map((operation) => `${operation.id}@${operation.version}`));
    const usedCalls = new Map();
    for (const step of artifact.steps) {
        const key = `${step.operationId}@${step.operationVersion}`;
        if (!grants.has(key)) {
            issues.push(`Artifact uses undeclared operation '${key}'`);
        }
        if (!hostOperations.has(key)) {
            issues.push(`Host does not advertise operation '${key}'`);
        }
        usedCalls.set(key, (usedCalls.get(key) ?? 0) + 1);
    }
    for (const [key, calls] of usedCalls) {
        const grant = grants.get(key);
        if (grant !== undefined && calls > grant.maxCalls) {
            issues.push(`Artifact exceeds the granted call count for '${key}'`);
        }
    }
    if (artifact.steps.length > contract.budgets.maxOperationCalls) {
        issues.push("Artifact exceeds the contract operation-call budget");
    }
    return invariantResult(issues);
}
function collectStepReferences(value) {
    if (value === null || typeof value !== "object") {
        return [];
    }
    if (Array.isArray(value)) {
        return value.flatMap(collectStepReferences);
    }
    if ("$value" in value &&
        Object.keys(value).length === 1 &&
        typeof value.$value === "object" &&
        value.$value !== null &&
        "source" in value.$value &&
        value.$value.source === "step" &&
        "stepId" in value.$value &&
        typeof value.$value.stepId === "string") {
        return [value.$value.stepId];
    }
    return Object.values(value).flatMap(collectStepReferences);
}
//# sourceMappingURL=capability.js.map