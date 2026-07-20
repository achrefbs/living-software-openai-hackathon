import { z } from "zod";

import { livingConfigSchema } from "./config.js";
import {
  productManifestSchema,
  sourceReferenceSchema,
} from "./product-manifest.js";
import {
  eventNameSchema,
  identifierSchema,
  relativePathSchema,
  sha256Schema,
} from "./primitives.js";

export const runtimeLocatorSchema = z
  .object({
    token: identifierSchema,
    nodeId: identifierSchema,
    strategy: z.enum(["data-living-id", "data-testid", "route"]),
    selector: z.string().min(1).max(1024),
    normalizedValue: z.string().min(1).max(512),
    dynamic: z.boolean(),
    match: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("exact"), value: z.string().min(1).max(512) }).strict(),
      z.object({ kind: z.literal("prefix"), value: z.string().min(1).max(512) }).strict(),
      z.object({ kind: z.literal("suffix"), value: z.string().min(1).max(512) }).strict(),
      z
        .object({
          kind: z.literal("prefix-suffix"),
          prefix: z.string().min(1).max(512),
          suffix: z.string().min(1).max(512),
        })
        .strict(),
      z.object({ kind: z.literal("presence") }).strict(),
      z
        .object({ kind: z.literal("route-template"), value: z.string().min(1).max(512) })
        .strict(),
    ]),
    eventBindings: z.array(eventNameSchema).min(1).max(8),
    captures: z
      .array(z.enum(["view", "activate", "change", "submit", "geometry"]))
      .min(1)
      .max(5),
    source: sourceReferenceSchema,
  })
  .strict();

export type RuntimeLocator = z.infer<typeof runtimeLocatorSchema>;

export const runtimeLocatorMapSchema = z
  .object({
    schemaVersion: z.literal("living.runtime-locator-map/v1"),
    locators: z.array(runtimeLocatorSchema).max(50_000),
  })
  .strict();

export type RuntimeLocatorMap = z.infer<typeof runtimeLocatorMapSchema>;

export const metricDefinitionSchema = z
  .object({
    id: identifierSchema,
    eventName: eventNameSchema,
    kind: z.enum(["workflow", "outcome", "reliability", "layout"]),
    targetNodeId: identifierSchema,
    trigger: z.string().min(1).max(256),
    fields: z.array(identifierSchema).max(32),
    provenance: z.enum(["scanned", "inferred"]),
  })
  .strict();

export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;

export const metricCatalogSchema = z
  .object({
    schemaVersion: z.literal("living.metric-catalog/v1"),
    metrics: z.array(metricDefinitionSchema).max(100_000),
  })
  .strict();

export type MetricCatalog = z.infer<typeof metricCatalogSchema>;

export const discoveryDiagnosticSchema = z
  .object({
    severity: z.enum(["info", "warning"]),
    code: identifierSchema,
    message: z.string().min(1).max(512),
    path: relativePathSchema.optional(),
  })
  .strict();

export type DiscoveryDiagnostic = z.infer<typeof discoveryDiagnosticSchema>;

export const discoveryResultSchema = z
  .object({
    schemaVersion: z.literal("living.discovery-result/v1"),
    support: z
      .object({
        framework: z.literal("next-app-router"),
        detectedVersion: z.string().min(1).max(64),
        supportedRange: z.literal(">=15.3.0"),
      })
      .strict(),
    sourceDigest: sha256Schema,
    manifest: productManifestSchema,
    config: livingConfigSchema,
    runtimeLocatorMap: runtimeLocatorMapSchema,
    metricCatalog: metricCatalogSchema,
    diagnostics: z.array(discoveryDiagnosticSchema).max(10_000),
    stats: z
      .object({
        scannedFiles: z.number().int().nonnegative(),
        scannedBytes: z.number().int().nonnegative(),
        skippedFiles: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.manifest.release.revision !== result.sourceDigest) {
      context.addIssue({
        code: "custom",
        path: ["manifest", "release", "revision"],
        message: "Manifest revision must equal the exact scanned source digest",
      });
    }

    const nodeIds = new Set(result.manifest.nodes.map((node) => node.id));
    for (const [index, locator] of result.runtimeLocatorMap.locators.entries()) {
      if (!nodeIds.has(locator.nodeId)) {
        context.addIssue({
          code: "custom",
          path: ["runtimeLocatorMap", "locators", index, "nodeId"],
          message: "Runtime locator must reference a manifest node",
        });
      }
    }

    for (const [index, metric] of result.metricCatalog.metrics.entries()) {
      if (!nodeIds.has(metric.targetNodeId)) {
        context.addIssue({
          code: "custom",
          path: ["metricCatalog", "metrics", index, "targetNodeId"],
          message: "Metric must reference a manifest node",
        });
      }
    }
  });

export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;

export function parseDiscoveryResult(input: unknown): DiscoveryResult {
  return discoveryResultSchema.parse(input);
}
