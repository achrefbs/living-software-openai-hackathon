import {
  parseWorkflowEventBatch,
  type WorkflowEvent,
  type WorkflowEventBatch,
} from "@living-software/contracts";

import type {
  CollectorDefinition,
  CollectorEventBinding,
  ResolvedCollectorLimits,
  ValidatedBatchContext,
} from "./types.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const EVENT_NAME = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

const DEFAULT_LIMITS: ResolvedCollectorLimits = Object.freeze({
  maxPayloadBytes: 256_000,
  maxEventsPerBatch: 100,
  maxRequestsPerMinute: 600,
  maxEventsPerMinute: 10_000,
});

export class CollectorValidationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CollectorValidationError";
    this.status = status;
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new CollectorValidationError(422, code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("METADATA_FIELD", `Metadata field '${key}' is not allowed`);
  }
  for (const key of required) {
    if (!(key in value)) fail("METADATA_FIELD", `Metadata field '${key}' is required`);
  }
}

function finiteNumber(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("METADATA_VALUE", `${name} must be a finite number`);
  }
  if (value < minimum || value > maximum) {
    fail("METADATA_VALUE", `${name} is outside its allowed range`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    fail("METADATA_VALUE", `${name} is not an allowed value`);
  }
  return value as T;
}

function validateGeometry(metadata: Record<string, unknown>): void {
  exactKeys(metadata, [
    "targetGeometry",
    "viewport",
    "visibility",
    "position",
    "state",
  ]);

  const target = metadata.targetGeometry;
  if (!isRecord(target)) fail("METADATA_VALUE", "targetGeometry must be an object");
  exactKeys(target, ["x", "y", "width", "height"]);
  finiteNumber(target.x, "targetGeometry.x", -100_000, 100_000);
  finiteNumber(target.y, "targetGeometry.y", -100_000, 100_000);
  finiteNumber(target.width, "targetGeometry.width", 0, 100_000);
  finiteNumber(target.height, "targetGeometry.height", 0, 100_000);

  const viewport = metadata.viewport;
  if (!isRecord(viewport)) fail("METADATA_VALUE", "viewport must be an object");
  exactKeys(viewport, ["width", "height", "scrollX", "scrollY", "pixelRatio"]);
  finiteNumber(viewport.width, "viewport.width", 0, 100_000);
  finiteNumber(viewport.height, "viewport.height", 0, 100_000);
  finiteNumber(viewport.scrollX, "viewport.scrollX", -10_000_000, 10_000_000);
  finiteNumber(viewport.scrollY, "viewport.scrollY", -10_000_000, 10_000_000);
  finiteNumber(viewport.pixelRatio, "viewport.pixelRatio", 0.25, 8);

  const visibility = metadata.visibility;
  if (!isRecord(visibility)) fail("METADATA_VALUE", "visibility must be an object");
  exactKeys(visibility, ["ratio", "inViewport"]);
  finiteNumber(visibility.ratio, "visibility.ratio", 0, 1);
  if (typeof visibility.inViewport !== "boolean") {
    fail("METADATA_VALUE", "visibility.inViewport must be boolean");
  }

  const position = metadata.position;
  if (!isRecord(position)) fail("METADATA_VALUE", "position must be an object");
  exactKeys(position, ["layout", "documentX", "documentY"]);
  oneOf(position.layout, ["flow", "fixed", "sticky"] as const, "position.layout");
  finiteNumber(position.documentX, "position.documentX", -10_000_000, 10_000_000);
  finiteNumber(position.documentY, "position.documentY", -10_000_000, 10_000_000);

  const state = metadata.state;
  if (!isRecord(state)) fail("METADATA_VALUE", "state must be an object");
  exactKeys(state, ["disabled"]);
  if (typeof state.disabled !== "boolean") {
    fail("METADATA_VALUE", "state.disabled must be boolean");
  }
}

/** Accept only the observer's bounded, content-free metadata vocabulary. */
export function validateObservationMetadata(candidate: unknown): void {
  if (!isRecord(candidate)) fail("METADATA_VALUE", "metadata must be an object");
  const keys = Object.keys(candidate);

  if ("interaction" in candidate) {
    exactKeys(candidate, [
      "interaction",
      "targetGeometry",
      "viewport",
      "visibility",
      "position",
      "state",
    ]);
    oneOf(candidate.interaction, ["click", "change", "submit"] as const, "interaction");
    const { interaction: _interaction, ...geometry } = candidate;
    validateGeometry(geometry);
    return;
  }

  if ("signal" in candidate) {
    exactKeys(candidate, [
      "signal",
      "targetGeometry",
      "viewport",
      "visibility",
      "position",
      "state",
    ]);
    oneOf(candidate.signal, ["dead-click", "rage-click", "correction"] as const, "signal");
    const { signal: _signal, ...geometry } = candidate;
    validateGeometry(geometry);
    return;
  }

  if (keys.includes("routePhase")) {
    exactKeys(candidate, ["routePhase"]);
    oneOf(candidate.routePhase, ["start", "complete"] as const, "routePhase");
    return;
  }

  if (keys.includes("metric")) {
    exactKeys(candidate, ["metric", "value", "unit"]);
    const metric = oneOf(candidate.metric, ["lcp", "inp", "cls"] as const, "metric");
    if (metric === "cls") {
      oneOf(candidate.unit, ["score"] as const, "unit");
      finiteNumber(candidate.value, "value", 0, 1_000);
    } else {
      oneOf(candidate.unit, ["millisecond"] as const, "unit");
      finiteNumber(candidate.value, "value", 0, 3_600_000);
    }
    return;
  }

  if (keys.includes("lifecycle")) {
    exactKeys(candidate, ["lifecycle"]);
    oneOf(candidate.lifecycle, ["pagehide"] as const, "lifecycle");
    return;
  }

  if (keys.includes("errorCategory")) {
    exactKeys(candidate, ["errorCategory", "sanitized"]);
    oneOf(
      candidate.errorCategory,
      ["script-runtime", "promise-rejection"] as const,
      "errorCategory",
    );
    if (candidate.sanitized !== true) {
      fail("METADATA_VALUE", "Runtime errors must be marked sanitized");
    }
    return;
  }

  fail("METADATA_SHAPE", "Metadata does not match a supported observation shape");
}

function positiveLimit(
  value: number | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new TypeError(`${name} must be an integer between 1 and ${maximum}`);
  }
  return resolved;
}

export function resolveCollectorDefinition(definition: CollectorDefinition): {
  readonly definition: CollectorDefinition;
  readonly bindings: ReadonlyMap<string, CollectorEventBinding>;
  readonly limits: ResolvedCollectorLimits;
} {
  if (definition.schemaVersion !== "living.collector-definition/v1") {
    throw new TypeError("Unsupported collector definition schemaVersion");
  }
  const app = definition.application;
  if (!IDENTIFIER.test(app.appId)) throw new TypeError("Invalid collector appId");
  if (!SHA256.test(app.manifestHash)) throw new TypeError("Invalid collector manifestHash");
  if (!["development", "preview", "production"].includes(app.environment)) {
    throw new TypeError("Invalid collector environment");
  }
  if (typeof app.synthetic !== "boolean") throw new TypeError("Invalid collector synthetic flag");
  if (app.releaseRevision.length < 1 || app.releaseRevision.length > 160) {
    throw new TypeError("Invalid collector releaseRevision");
  }
  if (definition.eventBindings.length < 1 || definition.eventBindings.length > 10_000) {
    throw new TypeError("Collector requires between 1 and 10000 event bindings");
  }

  const bindings = new Map<string, CollectorEventBinding>();
  for (const binding of definition.eventBindings) {
    if (!EVENT_NAME.test(binding.eventName) || binding.eventName.length > 160) {
      throw new TypeError(`Invalid event binding name '${binding.eventName}'`);
    }
    if (!IDENTIFIER.test(binding.nodeId)) throw new TypeError("Invalid event binding nodeId");
    if (binding.surfaceId !== undefined && !IDENTIFIER.test(binding.surfaceId)) {
      throw new TypeError("Invalid event binding surfaceId");
    }
    if (!["navigation", "action", "outcome", "error", "system"].includes(binding.kind)) {
      throw new TypeError("Invalid event binding kind");
    }
    if (bindings.has(binding.eventName)) {
      throw new TypeError(`Duplicate event binding '${binding.eventName}'`);
    }
    bindings.set(binding.eventName, Object.freeze({ ...binding }));
  }

  const limits: ResolvedCollectorLimits = Object.freeze({
    maxPayloadBytes: positiveLimit(
      definition.limits?.maxPayloadBytes,
      DEFAULT_LIMITS.maxPayloadBytes,
      1_000_000,
      "maxPayloadBytes",
    ),
    maxEventsPerBatch: positiveLimit(
      definition.limits?.maxEventsPerBatch,
      DEFAULT_LIMITS.maxEventsPerBatch,
      100,
      "maxEventsPerBatch",
    ),
    maxRequestsPerMinute: positiveLimit(
      definition.limits?.maxRequestsPerMinute,
      DEFAULT_LIMITS.maxRequestsPerMinute,
      10_000,
      "maxRequestsPerMinute",
    ),
    maxEventsPerMinute: positiveLimit(
      definition.limits?.maxEventsPerMinute,
      DEFAULT_LIMITS.maxEventsPerMinute,
      100_000,
      "maxEventsPerMinute",
    ),
  });

  return { definition, bindings, limits };
}

function validateEvent(
  event: WorkflowEvent,
  definition: CollectorDefinition,
  bindings: ReadonlyMap<string, CollectorEventBinding>,
): void {
  const app = definition.application;
  if (event.appId !== app.appId) fail("APP_MISMATCH", "Event appId does not match collector");
  if (event.environment !== app.environment) {
    fail("ENVIRONMENT_MISMATCH", "Event environment does not match collector");
  }
  if (event.releaseRevision !== app.releaseRevision) {
    fail("RELEASE_MISMATCH", "Event releaseRevision does not match collector");
  }
  if (event.actor !== undefined || event.subject !== undefined || event.trace !== undefined) {
    fail("IDENTITY_FIELD", "Observed browser events cannot contain actor, subject, or trace fields");
  }
  if (event.provenance.source !== "technical-telemetry") {
    fail("PROVENANCE", "Collector accepts technical telemetry only");
  }
  if (event.provenance.synthetic !== app.synthetic) {
    fail("PROVENANCE", "Event synthetic provenance does not match collector");
  }
  const binding = bindings.get(event.name);
  if (binding === undefined) fail("EVENT_UNDECLARED", "Event name is not declared by the runtime map");
  if (event.kind !== binding.kind) fail("EVENT_KIND", "Event kind does not match its binding");
  if (event.product === undefined) fail("PRODUCT_REQUIRED", "Observed events require product context");
  if (event.product.manifestHash !== app.manifestHash) {
    fail("MANIFEST_MISMATCH", "Event manifestHash does not match collector");
  }
  if (event.product.nodeId !== binding.nodeId) {
    fail("NODE_MISMATCH", "Event product node does not match its binding");
  }
  if (event.product.surfaceId !== binding.surfaceId) {
    fail("SURFACE_MISMATCH", "Event product surface does not match its binding");
  }
  validateObservationMetadata(event.metadata);
}

export function validateBatchForCollector(
  candidate: unknown,
  definition: CollectorDefinition,
  bindings: ReadonlyMap<string, CollectorEventBinding>,
  maxEventsPerBatch: number,
): ValidatedBatchContext {
  let batch: WorkflowEventBatch;
  try {
    batch = parseWorkflowEventBatch(candidate);
  } catch {
    fail("BATCH_SCHEMA", "Request body does not satisfy living.event-batch/v1");
  }
  if (batch.events.length > maxEventsPerBatch) {
    fail("BATCH_LIMIT", "Batch contains too many events");
  }

  const sessionId = batch.events[0]?.sessionId;
  if (sessionId === undefined) fail("EMPTY_BATCH", "Batch must contain events");
  let previousSequence = -1;
  let previousTime = -Infinity;
  for (const event of batch.events) {
    if (event.sessionId !== sessionId) {
      fail("MIXED_SESSION", "A collector batch must contain exactly one browser session");
    }
    if (event.sequence <= previousSequence) {
      fail("EVENT_ORDER", "Event sequence must increase strictly inside a batch");
    }
    const time = Date.parse(event.occurredAt);
    if (time < previousTime) {
      fail("EVENT_ORDER", "Event timestamps must not move backwards inside a batch");
    }
    previousSequence = event.sequence;
    previousTime = time;
    validateEvent(event, definition, bindings);
  }
  return { batch, sessionId };
}
