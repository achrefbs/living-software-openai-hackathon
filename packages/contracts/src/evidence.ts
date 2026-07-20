import { z } from "zod";

import {
  isoDateTimeSchema,
  sha256Schema,
} from "./primitives.js";
import { workflowEventSchema } from "./workflow-event.js";

export const workflowEventBatchSchema = z
  .object({
    schemaVersion: z.literal("living.event-batch/v1"),
    sequence: z.number().int().nonnegative(),
    events: z.array(workflowEventSchema).min(1).max(100),
  })
  .strict()
  .superRefine((batch, context) => {
    const eventIds = batch.events.map((event) => event.eventId);
    if (new Set(eventIds).size !== eventIds.length) {
      context.addIssue({
        code: "custom",
        path: ["events"],
        message: "Event ids must be unique inside a batch",
      });
    }
  });

export const evidenceBatchRecordSchema = z
  .object({
    schemaVersion: z.literal("living.evidence-batch/v1"),
    acceptedAt: isoDateTimeSchema,
    previousRecordHash: sha256Schema.nullable(),
    batchHash: sha256Schema,
    recordHash: sha256Schema,
    batch: workflowEventBatchSchema,
  })
  .strict();

export type WorkflowEventBatch = z.infer<typeof workflowEventBatchSchema>;
export type EvidenceBatchRecord = z.infer<typeof evidenceBatchRecordSchema>;

export function parseWorkflowEventBatch(input: unknown): WorkflowEventBatch {
  return workflowEventBatchSchema.parse(input);
}

export function parseEvidenceBatchRecord(input: unknown): EvidenceBatchRecord {
  return evidenceBatchRecordSchema.parse(input);
}
