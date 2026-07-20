import { z } from "zod";

import {
  identifierSchema,
  isoDateTimeSchema,
  jsonObjectSchema,
  relativePathSchema,
  sha256Schema,
} from "./primitives.js";

export const sourceReferenceSchema = z
  .object({
    path: relativePathSchema,
    revision: z.string().min(1).max(160),
    line: z.number().int().positive().optional(),
    symbol: z.string().min(1).max(256).optional(),
  })
  .strict();

export const productProvenanceSchema = z
  .object({
    origin: z.enum(["scanned", "declared", "inferred"]),
    confidence: z.number().min(0).max(1),
    sources: z.array(sourceReferenceSchema).min(1).max(64),
  })
  .strict();

export const extensionPointSchema = z
  .object({
    id: identifierSchema,
    surfaceNodeId: identifierSchema,
    presentation: z.enum(["action", "panel"]),
  })
  .strict();

export const hostOperationSpecSchema = z
  .object({
    id: identifierSchema,
    version: z.string().min(1).max(64),
    effect: z.enum(["read", "write", "external", "irreversible"]),
    inputSchema: jsonObjectSchema,
    outputSchema: jsonObjectSchema,
    idempotency: z.enum(["required", "supported", "none"]),
    requiresUserConfirmation: z.boolean(),
  })
  .strict();

export const hostInterfaceDescriptorSchema = z
  .object({
    schemaVersion: z.literal("living.host-interface/v1"),
    appId: identifierSchema,
    version: z.string().min(1).max(64),
    extensionPoints: z.array(extensionPointSchema).max(128),
    operations: z.array(hostOperationSpecSchema).max(256),
    contentHash: sha256Schema,
  })
  .strict()
  .superRefine((descriptor, context) => {
    const extensionIds = descriptor.extensionPoints.map((point) => point.id);
    if (new Set(extensionIds).size !== extensionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["extensionPoints"],
        message: "Extension point ids must be unique",
      });
    }

    const operationKeys = descriptor.operations.map(
      (operation) => `${operation.id}@${operation.version}`,
    );
    if (new Set(operationKeys).size !== operationKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["operations"],
        message: "Operation id/version pairs must be unique",
      });
    }
  });

export type HostInterfaceDescriptor = z.infer<
  typeof hostInterfaceDescriptorSchema
>;

export const productNodeSchema = z
  .object({
    id: identifierSchema,
    kind: z.enum([
      "route",
      "surface",
      "action",
      "endpoint",
      "entity",
      "job",
      "integration",
      "test",
      "extension-point",
    ]),
    displayName: z.string().min(1).max(160),
    provenance: productProvenanceSchema,
    attributes: jsonObjectSchema.optional(),
  })
  .strict();

export const productEdgeSchema = z
  .object({
    from: identifierSchema,
    to: identifierSchema,
    relation: z.enum([
      "renders",
      "navigates-to",
      "calls",
      "reads",
      "writes",
      "triggers",
      "tests",
      "exposes",
    ]),
    provenance: productProvenanceSchema,
  })
  .strict();

export const productManifestSchema = z
  .object({
    schemaVersion: z.literal("living.product-manifest/v1"),
    appId: identifierSchema,
    release: z
      .object({
        revision: z.string().min(1).max(160),
        version: z.string().min(1).max(64).optional(),
      })
      .strict(),
    generatedAt: isoDateTimeSchema,
    generators: z
      .array(
        z
          .object({
            adapterId: identifierSchema,
            adapterVersion: z.string().min(1).max(64),
          })
          .strict(),
      )
      .min(1),
    nodes: z.array(productNodeSchema).max(20_000),
    edges: z.array(productEdgeSchema).max(100_000),
    hostInterface: hostInterfaceDescriptorSchema.optional(),
    contentHash: sha256Schema,
  })
  .strict()
  .superRefine((manifest, context) => {
    const nodeIds = manifest.nodes.map((node) => node.id);
    const nodeIdSet = new Set(nodeIds);

    if (nodeIdSet.size !== nodeIds.length) {
      context.addIssue({
        code: "custom",
        path: ["nodes"],
        message: "Product node ids must be unique",
      });
    }

    manifest.edges.forEach((edge, index) => {
      if (!nodeIdSet.has(edge.from)) {
        context.addIssue({
          code: "custom",
          path: ["edges", index, "from"],
          message: "Edge source must reference an existing product node",
        });
      }
      if (!nodeIdSet.has(edge.to)) {
        context.addIssue({
          code: "custom",
          path: ["edges", index, "to"],
          message: "Edge target must reference an existing product node",
        });
      }
    });

    if (manifest.hostInterface !== undefined) {
      if (manifest.hostInterface.appId !== manifest.appId) {
        context.addIssue({
          code: "custom",
          path: ["hostInterface", "appId"],
          message: "Host interface appId must match the manifest appId",
        });
      }

      manifest.hostInterface.extensionPoints.forEach((point, index) => {
        if (!nodeIdSet.has(point.id)) {
          context.addIssue({
            code: "custom",
            path: ["hostInterface", "extensionPoints", index, "id"],
            message: "Extension point must reference a product node",
          });
        }
        if (!nodeIdSet.has(point.surfaceNodeId)) {
          context.addIssue({
            code: "custom",
            path: [
              "hostInterface",
              "extensionPoints",
              index,
              "surfaceNodeId",
            ],
            message: "Extension point surface must reference a product node",
          });
        }
      });
    }
  });

export type ProductManifest = z.infer<typeof productManifestSchema>;

export function parseProductManifest(input: unknown): ProductManifest {
  return productManifestSchema.parse(input);
}
