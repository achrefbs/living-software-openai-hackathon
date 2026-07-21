import { z } from "zod";
export const jsonPrimitiveSchema = z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
]);
export const jsonValueSchema = z.lazy(() => z.union([
    jsonPrimitiveSchema,
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
]));
export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
export const closedObjectJsonSchema = jsonObjectSchema.refine((schema) => schema.type === "object" && schema.additionalProperties === false, {
    message: "Expected an object JSON Schema with additionalProperties set to false",
});
export const identifierSchema = z
    .string()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, "Invalid identifier");
export const eventNameSchema = z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/, "Invalid event name");
export const sha256Schema = z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/, "Expected a lowercase SHA-256 digest");
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const relativePathSchema = z
    .string()
    .min(1)
    .max(512)
    .refine((path) => !path.startsWith("/") &&
    !path.startsWith("\\") &&
    !/^[A-Za-z]:[\\/]/.test(path) &&
    !path.split(/[\\/]/).includes(".."), "Expected a repository-relative path without parent traversal");
export const contentRefSchema = z
    .object({
    uri: z.string().min(1).max(2048),
    mediaType: z.string().min(1).max(128),
    sha256: sha256Schema,
})
    .strict();
export function invariantResult(issues) {
    return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
//# sourceMappingURL=primitives.js.map