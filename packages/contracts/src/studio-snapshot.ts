import { z } from "zod";

import { metricReportSchema } from "./metrics.js";
import { opportunitySchema } from "./opportunity.js";
import {
  identifierSchema,
  isoDateTimeSchema,
  relativePathSchema,
  sha256Schema,
} from "./primitives.js";
import { productManifestSchema } from "./product-manifest.js";

export const STUDIO_SNAPSHOT_SCHEMA_VERSION = "living.studio-snapshot/v1" as const;

const dataOriginSchema = z.enum(["observed", "synthetic", "mixed"]);
const workflowOutcomeSchema = z.enum([
  "succeeded",
  "failed",
  "abandoned",
  "unknown",
]);
const opaqueCaseIdSchema = z
  .string()
  .regex(/^case:[a-f0-9]{64}$/, "Expected an opaque case digest");
const opaqueVariantIdSchema = z
  .string()
  .regex(/^variant:[a-f0-9]{64}$/, "Expected an opaque variant digest");

export const studioSnapshotCaseSchema = z
  .object({
    caseId: opaqueCaseIdSchema,
    durationMs: z.number().finite().nonnegative(),
    outcome: workflowOutcomeSchema,
    eventCount: z.number().int().positive(),
    journeyNodeIds: z.array(identifierSchema).max(100_000),
    sessionCount: z.number().int().positive(),
  })
  .strict();

export type StudioSnapshotCase = z.infer<typeof studioSnapshotCaseSchema>;

const workflowOutcomeCountsSchema = z
  .object({
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    abandoned: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  })
  .strict();

export const studioSnapshotVariantSchema = z
  .object({
    variantId: opaqueVariantIdSchema,
    caseIds: z.array(opaqueCaseIdSchema).min(1).max(100_000),
    journeyNodeIds: z.array(identifierSchema).max(100_000),
    caseCount: z.number().int().positive(),
    averageDurationMs: z.number().finite().nonnegative(),
    outcomes: workflowOutcomeCountsSchema,
  })
  .strict();

export type StudioSnapshotVariant = z.infer<
  typeof studioSnapshotVariantSchema
>;

/**
 * A privacy-minimized Opportunity projection for Studio. Event-name sequences
 * and sampled raw event identifiers intentionally remain outside this boundary.
 */
export const studioSnapshotOpportunitySchema = z
  .object({
    opportunityId: opportunitySchema.shape.opportunityId,
    appId: opportunitySchema.shape.appId,
    manifestHash: opportunitySchema.shape.manifestHash,
    detectedAt: opportunitySchema.shape.detectedAt,
    detector: opportunitySchema.shape.detector,
    window: opportunitySchema.shape.window,
    signal: z
      .object({
        kind: opportunitySchema.shape.signal.shape.kind,
        metrics: opportunitySchema.shape.signal.shape.metrics,
      })
      .strict(),
    evidence: z
      .object({
        bundle: opportunitySchema.shape.evidence.shape.bundle,
        eventSetHash: opportunitySchema.shape.evidence.shape.eventSetHash,
        subjectCount: opportunitySchema.shape.evidence.shape.subjectCount,
        sessionCount: opportunitySchema.shape.evidence.shape.sessionCount,
        occurrenceCount: opportunitySchema.shape.evidence.shape.occurrenceCount,
        dataOrigin: opportunitySchema.shape.evidence.shape.dataOrigin,
      })
      .strict(),
    confidence: opportunitySchema.shape.confidence,
  })
  .strict()
  .superRefine((opportunity, context) => {
    if (Date.parse(opportunity.window.from) > Date.parse(opportunity.window.to)) {
      context.addIssue({
        code: "custom",
        path: ["window"],
        message: "Opportunity window must not end before it starts",
      });
    }

    const metricNames = opportunity.signal.metrics.map((metric) => metric.name);
    if (new Set(metricNames).size !== metricNames.length) {
      context.addIssue({
        code: "custom",
        path: ["signal", "metrics"],
        message: "Opportunity metric names must be unique",
      });
    }
    if (opportunity.evidence.bundle.sha256 !== opportunity.evidence.eventSetHash) {
      context.addIssue({
        code: "custom",
        path: ["evidence", "bundle", "sha256"],
        message: "Opportunity evidence bundle hash must match its event-set hash",
      });
    }
  });

export type StudioSnapshotOpportunity = z.infer<
  typeof studioSnapshotOpportunitySchema
>;

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export const studioSnapshotSchema = z
  .object({
    schemaVersion: z.literal(STUDIO_SNAPSHOT_SCHEMA_VERSION),
    generatedAt: isoDateTimeSchema,
    application: z
      .object({
        appId: identifierSchema,
        displayName: z.string().min(1).max(120),
        environment: z.enum(["development", "preview", "production"]),
        releaseRevision: z.string().min(1).max(160),
        manifestHash: sha256Schema,
        dataOrigin: dataOriginSchema,
      })
      .strict(),
    productManifest: productManifestSchema,
    evidence: z
      .object({
        path: relativePathSchema,
        records: z.number().int().positive(),
        events: z.number().int().positive(),
        chainHead: sha256Schema,
      })
      .strict(),
    workflows: z
      .object({
        cases: z.array(studioSnapshotCaseSchema).min(1).max(100_000),
        variants: z.array(studioSnapshotVariantSchema).min(1).max(100_000),
      })
      .strict(),
    metricReport: metricReportSchema,
    opportunity: studioSnapshotOpportunitySchema.optional(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const { application, productManifest, metricReport } = snapshot;
    if (application.appId !== productManifest.appId) {
      context.addIssue({
        code: "custom",
        path: ["application", "appId"],
        message: "Snapshot appId must match the Product Manifest",
      });
    }
    if (application.releaseRevision !== productManifest.release.revision) {
      context.addIssue({
        code: "custom",
        path: ["application", "releaseRevision"],
        message: "Snapshot release revision must match the Product Manifest",
      });
    }
    if (application.manifestHash !== productManifest.contentHash) {
      context.addIssue({
        code: "custom",
        path: ["application", "manifestHash"],
        message: "Snapshot manifest hash must match the Product Manifest",
      });
    }
    if (
      metricReport.appId !== application.appId ||
      metricReport.manifestHash !== application.manifestHash
    ) {
      context.addIssue({
        code: "custom",
        path: ["metricReport"],
        message: "Metric Report identity must match the snapshot application",
      });
    }
    if (metricReport.dataOrigin !== application.dataOrigin) {
      context.addIssue({
        code: "custom",
        path: ["metricReport", "dataOrigin"],
        message: "Metric Report data origin must match the snapshot application",
      });
    }
    if (metricReport.generatedAt !== snapshot.generatedAt) {
      context.addIssue({
        code: "custom",
        path: ["generatedAt"],
        message: "Snapshot generation time must match the Metric Report",
      });
    }

    const manifestNodeIds = new Set(productManifest.nodes.map((node) => node.id));
    const cases = new Map<string, StudioSnapshotCase>();
    let projectedEventCount = 0;
    for (const [index, workflowCase] of snapshot.workflows.cases.entries()) {
      if (cases.has(workflowCase.caseId)) {
        context.addIssue({
          code: "custom",
          path: ["workflows", "cases", index, "caseId"],
          message: "Snapshot case ids must be unique",
        });
      }
      cases.set(workflowCase.caseId, workflowCase);
      projectedEventCount += workflowCase.eventCount;
      for (const [nodeIndex, nodeId] of workflowCase.journeyNodeIds.entries()) {
        if (!manifestNodeIds.has(nodeId)) {
          context.addIssue({
            code: "custom",
            path: ["workflows", "cases", index, "journeyNodeIds", nodeIndex],
            message: "Journey nodes must reference the Product Manifest",
          });
        }
      }
    }
    if (
      snapshot.evidence.events !== projectedEventCount ||
      metricReport.totals.events !== snapshot.evidence.events
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence", "events"],
        message: "Evidence event counts must match cases and the Metric Report",
      });
    }
    if (metricReport.totals.cases !== snapshot.workflows.cases.length) {
      context.addIssue({
        code: "custom",
        path: ["metricReport", "totals", "cases"],
        message: "Metric Report case count must match snapshot cases",
      });
    }

    const variantIds = new Set<string>();
    const variantJourneys = new Set<string>();
    const assignedCases = new Set<string>();
    for (const [index, variant] of snapshot.workflows.variants.entries()) {
      if (variantIds.has(variant.variantId)) {
        context.addIssue({
          code: "custom",
          path: ["workflows", "variants", index, "variantId"],
          message: "Snapshot variant ids must be unique",
        });
      }
      variantIds.add(variant.variantId);
      const journeyKey = JSON.stringify(variant.journeyNodeIds);
      if (variantJourneys.has(journeyKey)) {
        context.addIssue({
          code: "custom",
          path: ["workflows", "variants", index, "journeyNodeIds"],
          message: "Each journey sequence must have exactly one variant",
        });
      }
      variantJourneys.add(journeyKey);
      if (new Set(variant.caseIds).size !== variant.caseIds.length) {
        context.addIssue({
          code: "custom",
          path: ["workflows", "variants", index, "caseIds"],
          message: "Variant case ids must be unique",
        });
      }
      if (variant.caseCount !== variant.caseIds.length) {
        context.addIssue({
          code: "custom",
          path: ["workflows", "variants", index, "caseCount"],
          message: "Variant case count must match its case references",
        });
      }

      const outcomes = { succeeded: 0, failed: 0, abandoned: 0, unknown: 0 };
      let durationTotal = 0;
      let resolvedCases = 0;
      for (const [caseIndex, caseId] of variant.caseIds.entries()) {
        const workflowCase = cases.get(caseId);
        if (workflowCase === undefined) {
          context.addIssue({
            code: "custom",
            path: ["workflows", "variants", index, "caseIds", caseIndex],
            message: "Variant case references must resolve",
          });
          continue;
        }
        if (assignedCases.has(caseId)) {
          context.addIssue({
            code: "custom",
            path: ["workflows", "variants", index, "caseIds", caseIndex],
            message: "A case may belong to only one journey variant",
          });
        }
        assignedCases.add(caseId);
        if (!sameStrings(workflowCase.journeyNodeIds, variant.journeyNodeIds)) {
          context.addIssue({
            code: "custom",
            path: ["workflows", "variants", index, "journeyNodeIds"],
            message: "Variant journeys must match every referenced case",
          });
        }
        outcomes[workflowCase.outcome] += 1;
        durationTotal += workflowCase.durationMs;
        resolvedCases += 1;
      }
      if (
        outcomes.succeeded !== variant.outcomes.succeeded ||
        outcomes.failed !== variant.outcomes.failed ||
        outcomes.abandoned !== variant.outcomes.abandoned ||
        outcomes.unknown !== variant.outcomes.unknown
      ) {
        context.addIssue({
          code: "custom",
          path: ["workflows", "variants", index, "outcomes"],
          message: "Variant outcomes must match its referenced cases",
        });
      }
      if (
        resolvedCases === variant.caseIds.length &&
        durationTotal / resolvedCases !== variant.averageDurationMs
      ) {
        context.addIssue({
          code: "custom",
          path: ["workflows", "variants", index, "averageDurationMs"],
          message: "Variant average duration must match its referenced cases",
        });
      }
    }
    if (assignedCases.size !== cases.size) {
      context.addIssue({
        code: "custom",
        path: ["workflows", "variants"],
        message: "Every snapshot case must belong to exactly one journey variant",
      });
    }

    const opportunity = snapshot.opportunity;
    if (opportunity !== undefined) {
      if (
        opportunity.appId !== application.appId ||
        opportunity.manifestHash !== application.manifestHash
      ) {
        context.addIssue({
          code: "custom",
          path: ["opportunity"],
          message: "Opportunity identity must match the snapshot application",
        });
      }
      if (opportunity.evidence.dataOrigin !== application.dataOrigin) {
        context.addIssue({
          code: "custom",
          path: ["opportunity", "evidence", "dataOrigin"],
          message: "Opportunity data origin must match the snapshot application",
        });
      }
      if (
        opportunity.evidence.subjectCount > snapshot.workflows.cases.length ||
        opportunity.evidence.sessionCount > metricReport.totals.sessions
      ) {
        context.addIssue({
          code: "custom",
          path: ["opportunity", "evidence"],
          message: "Opportunity evidence counts must fit inside the snapshot cohort",
        });
      }
      if (
        Date.parse(opportunity.window.from) < Date.parse(metricReport.window.from) ||
        Date.parse(opportunity.window.to) > Date.parse(metricReport.window.to)
      ) {
        context.addIssue({
          code: "custom",
          path: ["opportunity", "window"],
          message: "Opportunity window must remain inside the Metric Report window",
        });
      }
    }
  });

export type StudioSnapshot = z.infer<typeof studioSnapshotSchema>;

export function parseStudioSnapshot(input: unknown): StudioSnapshot {
  return studioSnapshotSchema.parse(input);
}
