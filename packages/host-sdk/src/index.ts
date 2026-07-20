export {
  createEventClient,
  EventClientClosedError,
  EventQueueFullError,
} from "./client.js";
export {
  assertPrivacySafeMetadata,
  MetadataPrivacyError,
} from "./privacy.js";
export {
  EVENT_BATCH_SCHEMA_VERSION,
  type EventBatch,
  type EventClient,
  type EventClientOptions,
  type EventTransport,
  type FlushResult,
  type MetadataPrivacyOptions,
  type RecordResult,
  type TransportReceipt,
} from "./types.js";
