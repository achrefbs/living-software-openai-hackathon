import { z } from "zod";

import {
  closedObjectJsonSchema,
  eventNameSchema,
  identifierSchema,
  jsonObjectSchema,
  relativePathSchema,
} from "./primitives.js";

export const workflowEventKindSchema = z.enum([
  "navigation",
  "action",
  "outcome",
  "error",
  "system",
]);

export type WorkflowEventKind = z.infer<typeof workflowEventKindSchema>;

export const eventDefinitionSchema = z
  .object({
    kind: workflowEventKindSchema,
    subjectType: identifierSchema.optional(),
    metadataSchema: closedObjectJsonSchema,
  })
  .strict();

export type EventDefinition = z.infer<typeof eventDefinitionSchema>;

function hasSafeCollectorPath(candidate: string): boolean {
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("//") ||
    candidate.includes("?") ||
    candidate.includes("#") ||
    candidate.includes("\\")
  ) {
    return false;
  }

  let decoded = candidate;
  for (let depth = 0; depth < 5; depth += 1) {
    if (
      decoded.startsWith("//") ||
      decoded.includes("//") ||
      decoded.includes("?") ||
      decoded.includes("#") ||
      decoded.includes("\\") ||
      decoded.split("/").some((segment) => segment === "." || segment === "..")
    ) {
      return false;
    }
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return false;
    }
    if (next === decoded) return true;
    decoded = next;
  }

  // Refuse deeply nested encodings that were not fully canonicalized above.
  return !/%(?:25|2e|2f|5c|3f|23)/i.test(decoded);
}

function isCollectorEndpoint(candidate: string): boolean {
  if (candidate.trim() !== candidate || /\s/.test(candidate)) return false;
  if (candidate.startsWith("/")) return hasSafeCollectorPath(candidate);
  if (!/^https?:\/\//i.test(candidate)) return false;
  if (candidate.includes("?") || candidate.includes("#") || candidate.includes("\\")) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    return false;
  }

  const authorityStart = candidate.indexOf("://") + 3;
  const pathStart = candidate.indexOf("/", authorityStart);
  const rawPath = pathStart === -1 ? "/" : candidate.slice(pathStart);
  return hasSafeCollectorPath(rawPath);
}

export const collectorEndpointSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(isCollectorEndpoint, {
    message: "Expected a safe root-relative path or absolute HTTP(S) URL",
  });

export type CollectorEndpoint = z.infer<typeof collectorEndpointSchema>;

export const livingConfigSchema = z
  .object({
    schemaVersion: z.literal("living.config/v1"),
    application: z
      .object({
        id: identifierSchema,
        displayName: z.string().min(1).max(120),
      })
      .strict(),
    adapters: z
      .array(
        z
          .object({
            id: identifierSchema,
            version: z.string().min(1).max(64),
            options: jsonObjectSchema.optional(),
          })
          .strict(),
      )
      .min(1),
    collector: z
      .object({
        endpoint: collectorEndpointSchema,
        tokenEnv: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]*$/, "Expected an environment-variable name")
          .optional(),
      })
      .strict(),
    manifest: z
      .object({
        root: z.string().min(1).max(512),
        include: z.array(z.string().min(1).max(256)).max(128).optional(),
        exclude: z.array(z.string().min(1).max(256)).max(128).optional(),
      })
      .strict(),
    semantics: z
      .object({
        events: z.record(eventNameSchema, eventDefinitionSchema),
      })
      .strict(),
    privacy: z
      .object({
        metadataPolicy: z.literal("deny-by-default"),
        identifierMode: z.enum(["anonymous", "pseudonymous"]),
        pseudonymSaltEnv: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]*$/, "Expected an environment-variable name")
          .optional(),
        retentionDays: z.number().int().positive().max(3650),
      })
      .strict(),
    broker: z
      .object({
        descriptorPath: relativePathSchema,
        invocationPath: z.string().startsWith("/").max(512),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((config, context) => {
    if (
      config.privacy.identifierMode === "pseudonymous" &&
      config.privacy.pseudonymSaltEnv === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["privacy", "pseudonymSaltEnv"],
        message: "Pseudonymous identifiers require a salt environment variable",
      });
    }

    const adapterKeys = config.adapters.map(
      (adapter) => `${adapter.id}@${adapter.version}`,
    );
    if (new Set(adapterKeys).size !== adapterKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["adapters"],
        message: "Adapter id/version pairs must be unique",
      });
    }
  });

export type LivingConfig = z.infer<typeof livingConfigSchema>;

export function parseLivingConfig(input: unknown): LivingConfig {
  return livingConfigSchema.parse(input);
}
