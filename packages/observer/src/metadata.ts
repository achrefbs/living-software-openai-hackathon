/** Must remain aligned with contracts/src/observation.ts. */
export const OBSERVATION_METADATA_KEYS = Object.freeze([
  "errorCategory",
  "interaction",
  "lifecycle",
  "metric",
  "position",
  "routePhase",
  "sanitized",
  "signal",
  "state",
  "targetGeometry",
  "unit",
  "value",
  "viewport",
  "visibility",
] as const);

export type ObservationMetadataKey = (typeof OBSERVATION_METADATA_KEYS)[number];
