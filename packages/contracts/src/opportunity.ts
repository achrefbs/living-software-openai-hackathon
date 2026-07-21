import { z } from "zod";

import {
  contentRefSchema,
  eventNameSchema,
  identifierSchema,
  isoDateTimeSchema,
  sha256Schema,
} from "./primitives.js";

export const opportunitySchema = z
  .object({
    schemaVersion: z.literal("living.opportunity/v1"),
    opportunityId: identifierSchema,
    appId: identifierSchema,
    manifestHash: sha256Schema,
    detectedAt: isoDateTimeSchema,
    detector: z
      .object({
        id: identifierSchema,
        version: z.string().min(1).max(64),
        configHash: sha256Schema,
      })
      .strict(),
    window: z
      .object({
        from: isoDateTimeSchema,
        to: isoDateTimeSchema,
      })
      .strict(),
    signal: z
      .object({
        kind: z.enum([
          "rework-loop",
          "backtracking",
          "abandonment",
          "failure-cluster",
          "repeated-sequence",
          "handoff-delay",
          "model-discovery",
        ]),
        sequence: z.array(eventNameSchema).min(2).max(64).optional(),
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
      .strict(),
    evidence: z
      .object({
        bundle: contentRefSchema,
        eventSetHash: sha256Schema,
        sampleEventIds: z.array(identifierSchema).min(1).max(256),
        subjectCount: z.number().int().positive(),
        sessionCount: z.number().int().positive(),
        occurrenceCount: z.number().int().positive(),
        dataOrigin: z.enum(["observed", "synthetic", "mixed"]),
      })
      .strict(),
    confidence: z
      .object({
        score: z.number().min(0).max(1),
        reasonCodes: z.array(identifierSchema).min(1).max(32),
      })
      .strict(),
  })
  .strict()
  .superRefine((opportunity, context) => {
    if (
      Date.parse(opportunity.window.from) > Date.parse(opportunity.window.to)
    ) {
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

    if (
      new Set(opportunity.evidence.sampleEventIds).size !==
      opportunity.evidence.sampleEventIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence", "sampleEventIds"],
        message: "Sample event ids must be unique",
      });
    }
  });

export type Opportunity = z.infer<typeof opportunitySchema>;

export function parseOpportunity(input: unknown): Opportunity {
  return opportunitySchema.parse(input);
}
