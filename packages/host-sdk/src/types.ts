import type { WorkflowEvent } from "@living-software/contracts";

export const EVENT_BATCH_SCHEMA_VERSION = "living.event-batch/v1" as const;

export interface EventBatch {
  readonly schemaVersion: typeof EVENT_BATCH_SCHEMA_VERSION;
  readonly sequence: number;
  readonly events: readonly WorkflowEvent[];
}

export interface TransportReceipt {
  readonly accepted: number;
  readonly transportId?: string;
}

/** A host-controlled transport. The SDK never imports the engine or Studio. */
export interface EventTransport {
  send(batch: EventBatch): Promise<TransportReceipt | void>;
}

export interface MetadataPrivacyOptions {
  /** Dot-separated leaf paths. An empty allowlist denies all metadata. */
  readonly allowedKeys?: readonly string[];
  readonly maxDepth?: number;
  readonly maxKeys?: number;
  readonly maxStringLength?: number;
}

export interface EventClientOptions {
  readonly transport: EventTransport;
  readonly maxBatchSize?: number;
  readonly maxQueueSize?: number;
  readonly metadata?: MetadataPrivacyOptions;
}

export interface RecordResult {
  readonly event: WorkflowEvent;
  readonly queued: number;
  readonly flushed: boolean;
}

export interface FlushResult {
  readonly batches: number;
  readonly events: number;
}

export interface EventClient {
  record(candidate: unknown): Promise<RecordResult>;
  flush(): Promise<FlushResult>;
  close(): Promise<FlushResult>;
  readonly queued: number;
  readonly closed: boolean;
}
