import { z } from "zod";

import { receiptActorSchema, receiptKindSchema } from "./evolution-receipt.js";
import { liveStateSchema } from "./live.js";
import { identifierSchema, relativePathSchema, sha256Schema } from "./primitives.js";

export const LIVE_VIEW_SCHEMA_VERSION = "living.live-view/v1" as const;

const safeCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const boundedText = (maximum: number) => z.string().min(1).max(maximum);
const loopbackUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname) &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  }, "Expected a credential-free loopback HTTP URL");

const liveOpportunityViewSchema = z
  .object({
    opportunityId: identifierSchema,
    eventSetHash: sha256Schema,
    detectorId: identifierSchema,
    signalKind: z.enum([
      "rework-loop",
      "failure-cluster",
      "backtracking",
      "repeated-sequence",
      "model-discovery",
    ]),
    affectedCases: safeCount,
    occurrenceCount: safeCount,
    dataOrigin: z.enum(["synthetic", "observed", "mixed"]),
    confidence: z.number().min(0).max(1),
    metrics: z
      .array(
        z
          .object({
            name: identifierSchema,
            unit: z.enum(["count", "milliseconds", "pixels", "ratio"]),
            observed: z.number().finite(),
            comparator: z.number().finite().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(10_000),
  })
  .strict();

const liveModelRunViewSchema = z
  .object({
    transport: z.enum(["responses-api", "codex-cli"]),
    requestedModel: z.enum(["gpt-5.6", "gpt-5.6-terra"]),
    actualModel: z.string().min(1).max(256).nullable(),
    runId: z.string().min(1).max(256).nullable(),
    tokenUsage: z
      .object({
        inputTokens: safeCount,
        cachedInputTokens: safeCount,
        outputTokens: safeCount,
        reasoningOutputTokens: safeCount,
      })
      .strict()
      .nullable(),
  })
  .strict();

const liveEvolutionViewSchema = z
  .object({
    evolutionId: identifierSchema,
    status: z.enum(["prepared", "approved", "applied", "rolled-back"]),
    revision: safeCount,
    title: boundedText(160),
    interpretation: boundedText(2_000),
    proposalSummary: boundedText(1_000),
    proposalRationale: boundedText(2_000),
    targetPath: relativePathSchema,
    normalizedDiff: z.string().min(1).max(100_000).nullable(),
    artifactHash: sha256Schema,
    proofHash: sha256Schema,
    preimageHash: sha256Schema,
    postimageHash: sha256Schema,
    currentSourceHash: sha256Schema,
    approvalActor: identifierSchema.nullable(),
    proofChecks: z
      .array(
        z
          .object({
            id: identifierSchema,
            status: z.enum(["passed", "failed"]),
            detail: boundedText(1_000),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    modelRuns: z
      .object({
        interpretation: liveModelRunViewSchema,
        patch: liveModelRunViewSchema,
      })
      .strict(),
    receipts: z
      .array(
        z
          .object({
            sequence: safeCount,
            recordedAt: z.string().datetime({ offset: true }),
            kind: receiptKindSchema,
            actor: receiptActorSchema,
            previousHash: sha256Schema.nullable(),
            receiptHash: sha256Schema,
          })
          .strict(),
      )
      .max(1_000),
    receiptChainHead: sha256Schema,
  })
  .strict();

export const liveViewSchema = z
  .object({
    schemaVersion: z.literal(LIVE_VIEW_SCHEMA_VERSION),
    mappedHost: z
      .object({
        appId: identifierSchema,
        displayName: z.string().min(1).max(120),
        releaseRevision: z.string().min(1).max(160),
        framework: z.literal("next-app-router"),
        detectedVersion: z.string().min(1).max(64),
      })
      .strict(),
    state: liveStateSchema,
    hostUrl: loopbackUrlSchema,
    previewUrl: loopbackUrlSchema.nullable(),
    beforeUrl: loopbackUrlSchema.nullable(),
    snapshotHash: sha256Schema.nullable(),
    opportunity: liveOpportunityViewSchema.nullable(),
    evolution: liveEvolutionViewSchema.nullable(),
    nextAction: z
      .object({
        type: z.enum([
          "install",
          "capture-evidence",
          "prepare",
          "approve",
          "apply",
          "inspect-runtime",
          "rollback",
          "resolve-integrity",
          "wait",
        ]),
        label: boundedText(160),
        commandEnabled: z.boolean(),
        reason: boundedText(500).optional(),
      })
      .strict(),
    limitations: z.array(boundedText(500)).max(12),
  })
  .strict()
  .superRefine((view, context) => {
    if ((view.snapshotHash === null) !== (view.opportunity === null)) {
      context.addIssue({
        code: "custom",
        path: ["snapshotHash"],
        message: "An exact analysis snapshot and opportunity must be present together",
      });
    }
    if (view.evolution !== null && view.opportunity === null) {
      context.addIssue({
        code: "custom",
        path: ["evolution"],
        message: "An evolution view requires its current evidence-bound opportunity",
      });
    }
    if (
      view.evolution !== null &&
      view.evolution.receipts.length !== view.evolution.revision
    ) {
      context.addIssue({
        code: "custom",
        path: ["evolution", "receipts"],
        message: "Evolution revision must equal the validated receipt count",
      });
    }
  });

export type LiveView = z.infer<typeof liveViewSchema>;

export function parseLiveView(input: unknown): LiveView {
  return liveViewSchema.parse(input);
}
