import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    jsonPrimitiveSchema,
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.string(),
  jsonValueSchema,
);

export const closedObjectJsonSchema = jsonObjectSchema.refine(
  (schema) =>
    schema.type === "object" && schema.additionalProperties === false,
  {
    message:
      "Expected an object JSON Schema with additionalProperties set to false",
  },
);

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

export type Sha256 = z.infer<typeof sha256Schema>;

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const relativePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.startsWith("\\") &&
      !/^[A-Za-z]:[\\/]/.test(path) &&
      !path.split(/[\\/]/).includes(".."),
    "Expected a repository-relative path without parent traversal",
  );

export const contentRefSchema = z
  .object({
    uri: z.string().min(1).max(2048),
    mediaType: z.string().min(1).max(128),
    sha256: sha256Schema,
  })
  .strict();

export type ContentRef = z.infer<typeof contentRefSchema>;

export type InvariantResult =
  | { ok: true }
  | { ok: false; issues: readonly string[] };

export function invariantResult(issues: string[]): InvariantResult {
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
