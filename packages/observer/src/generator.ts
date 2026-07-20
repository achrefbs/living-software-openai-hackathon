import { BROWSER_RUNTIME_SOURCE } from "./runtime-source.js";
import type {
  GeneratedNextObserverFiles,
  ObservationEventBinding,
  ObservationLocator,
  ObservationRoute,
  ObservationRuntimeMap,
  ObservationStructuralTag,
  ObservationTarget,
  ObservationTargetEvents,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const EVENT_NAME = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/;
const MANIFEST_HASH = /^sha256:[a-f0-9]{64}$/;
const LOCATOR_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:/_-]*$/;
const TEST_ID_FRAGMENT = /^[a-z0-9._:/-]+$/;
const EVENT_KINDS = new Set([
  "navigation",
  "action",
  "outcome",
  "error",
  "system",
]);
const STRUCTURAL_TAGS = new Set([
  "a",
  "button",
  "details",
  "div",
  "form",
  "input",
  "select",
  "summary",
  "textarea",
]);

function record(input: unknown, path: string): UnknownRecord {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError(`${path} must be an object`);
  }
  return input as UnknownRecord;
}

function exactKeys(value: UnknownRecord, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new TypeError(`${path}.${key} is not supported`);
  }
}

function string(
  input: unknown,
  path: string,
  options: { readonly max: number; readonly pattern?: RegExp },
): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > options.max ||
    (options.pattern !== undefined && !options.pattern.test(input))
  ) {
    throw new TypeError(`${path} is invalid`);
  }
  return input;
}

function integer(input: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(input) || (input as number) < minimum || (input as number) > maximum) {
    throw new TypeError(`${path} must be an integer from ${minimum} to ${maximum}`);
  }
  return input as number;
}

function boolean(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return input;
}

function binding(input: unknown, path: string): ObservationEventBinding {
  const value = record(input, path);
  exactKeys(value, ["eventName", "kind", "nodeId", "surfaceId"], path);
  const eventName = string(value.eventName, `${path}.eventName`, {
    max: 160,
    pattern: EVENT_NAME,
  });
  const kind = string(value.kind, `${path}.kind`, { max: 16 });
  if (!EVENT_KINDS.has(kind)) throw new TypeError(`${path}.kind is invalid`);
  const nodeId = string(value.nodeId, `${path}.nodeId`, {
    max: 160,
    pattern: IDENTIFIER,
  });
  const surfaceId =
    value.surfaceId === undefined
      ? undefined
      : string(value.surfaceId, `${path}.surfaceId`, {
          max: 160,
          pattern: IDENTIFIER,
        });

  return Object.freeze({
    eventName,
    kind: kind as ObservationEventBinding["kind"],
    nodeId,
    ...(surfaceId === undefined ? {} : { surfaceId }),
  });
}

function routePattern(input: unknown, path: string): string {
  const pattern = string(input, path, { max: 512 });
  if (!pattern.startsWith("/") || pattern.includes("?") || pattern.includes("#")) {
    throw new TypeError(`${path} must be a pathname template without a query or fragment`);
  }
  if (pattern === "/") return pattern;
  const segments = pattern.slice(1).split("/");
  if (
    segments.some(
      (segment) =>
        !/^[A-Za-z0-9._~-]+$/.test(segment) &&
        !/^:[A-Za-z][A-Za-z0-9_]*$/.test(segment) &&
        segment !== "*",
    ) ||
    segments.slice(0, -1).includes("*")
  ) {
    throw new TypeError(`${path} contains an unsafe route segment`);
  }
  return pattern;
}

function locator(input: unknown, path: string): ObservationLocator {
  const value = record(input, path);
  const strategy = string(value.strategy, `${path}.strategy`, { max: 16 });
  if (strategy === "living-id") {
    exactKeys(value, ["strategy", "value"], path);
    return Object.freeze({
      strategy,
      value: string(value.value, `${path}.value`, {
        max: 160,
        pattern: LOCATOR_VALUE,
      }),
    });
  }
  if (strategy === "test-id") {
    exactKeys(value, ["strategy", "match", "value"], path);
    const match = string(value.match, `${path}.match`, { max: 8 });
    if (match !== "exact" && match !== "prefix" && match !== "suffix") {
      throw new TypeError(`${path}.match is invalid`);
    }
    const normalizedValue = string(value.value, `${path}.value`, { max: 128 })
      .trim()
      .toLowerCase();
    if (!TEST_ID_FRAGMENT.test(normalizedValue)) {
      throw new TypeError(`${path}.value is not a safe test-id fragment`);
    }
    return Object.freeze({ strategy, match, value: normalizedValue });
  }
  if (strategy === "structure") {
    exactKeys(value, ["strategy", "tag", "ancestorTags", "ordinalWithinParent"], path);
    const tag = string(value.tag, `${path}.tag`, { max: 16 });
    if (!STRUCTURAL_TAGS.has(tag)) throw new TypeError(`${path}.tag is invalid`);
    let ancestorTags: ObservationStructuralTag[] | undefined;
    if (value.ancestorTags !== undefined) {
      if (!Array.isArray(value.ancestorTags) || value.ancestorTags.length > 3) {
        throw new TypeError(`${path}.ancestorTags must contain at most 3 tags`);
      }
      ancestorTags = value.ancestorTags.map((candidate, index) => {
        const ancestor = string(candidate, `${path}.ancestorTags[${index}]`, { max: 16 });
        if (!STRUCTURAL_TAGS.has(ancestor)) {
          throw new TypeError(`${path}.ancestorTags[${index}] is invalid`);
        }
        return ancestor as ObservationStructuralTag;
      });
    }
    const ordinalWithinParent =
      value.ordinalWithinParent === undefined
        ? undefined
        : integer(value.ordinalWithinParent, `${path}.ordinalWithinParent`, 0, 50);
    return Object.freeze({
      strategy,
      tag: tag as ObservationStructuralTag,
      ...(ancestorTags === undefined ? {} : { ancestorTags: Object.freeze(ancestorTags) }),
      ...(ordinalWithinParent === undefined ? {} : { ordinalWithinParent }),
    });
  }
  throw new TypeError(`${path}.strategy is invalid`);
}

function normalizeRuntimeMap(input: unknown): ObservationRuntimeMap {
  const root = record(input, "runtimeMap");
  exactKeys(
    root,
    [
      "schemaVersion",
      "application",
      "collector",
      "targets",
      "routes",
      "systemEvents",
      "signals",
      "limits",
    ],
    "runtimeMap",
  );
  if (root.schemaVersion !== "living.observation-runtime/v1") {
    throw new TypeError("runtimeMap.schemaVersion is unsupported");
  }

  const applicationInput = record(root.application, "runtimeMap.application");
  exactKeys(
    applicationInput,
    ["appId", "environment", "releaseRevision", "manifestHash", "synthetic"],
    "runtimeMap.application",
  );
  const environment = string(
    applicationInput.environment,
    "runtimeMap.application.environment",
    { max: 16 },
  );
  if (!new Set(["development", "preview", "production"]).has(environment)) {
    throw new TypeError("runtimeMap.application.environment is invalid");
  }
  const application = Object.freeze({
    appId: string(applicationInput.appId, "runtimeMap.application.appId", {
      max: 160,
      pattern: IDENTIFIER,
    }),
    environment: environment as ObservationRuntimeMap["application"]["environment"],
    releaseRevision: string(
      applicationInput.releaseRevision,
      "runtimeMap.application.releaseRevision",
      { max: 160 },
    ),
    manifestHash: string(
      applicationInput.manifestHash,
      "runtimeMap.application.manifestHash",
      { max: 71, pattern: MANIFEST_HASH },
    ),
    synthetic: boolean(
      applicationInput.synthetic,
      "runtimeMap.application.synthetic",
    ),
  });

  const collectorInput = record(root.collector, "runtimeMap.collector");
  exactKeys(collectorInput, ["endpoint"], "runtimeMap.collector");
  if (collectorInput.endpoint !== "/api/living/events") {
    throw new TypeError("runtimeMap.collector.endpoint must be /api/living/events");
  }
  const collector = Object.freeze({ endpoint: "/api/living/events" as const });

  if (!Array.isArray(root.targets) || root.targets.length > 5_000) {
    throw new TypeError("runtimeMap.targets must contain at most 5000 targets");
  }
  const targetTokens = new Set<string>();
  const locatorSignatures = new Set<string>();
  const targets: ObservationTarget[] = root.targets.map((candidate, targetIndex) => {
    const path = `runtimeMap.targets[${targetIndex}]`;
    const targetInput = record(candidate, path);
    exactKeys(targetInput, ["token", "locators", "events"], path);
    const token = string(targetInput.token, `${path}.token`, {
      max: 160,
      pattern: IDENTIFIER,
    });
    if (targetTokens.has(token)) throw new TypeError(`${path}.token must be unique`);
    targetTokens.add(token);

    if (
      !Array.isArray(targetInput.locators) ||
      targetInput.locators.length === 0 ||
      targetInput.locators.length > 8
    ) {
      throw new TypeError(`${path}.locators must contain from 1 to 8 descriptors`);
    }
    const locators = targetInput.locators.map((candidate, locatorIndex) => {
      const normalized = locator(candidate, `${path}.locators[${locatorIndex}]`);
      const signature = JSON.stringify(normalized);
      if (locatorSignatures.has(signature)) {
        throw new TypeError(`${path}.locators[${locatorIndex}] must be globally unique`);
      }
      locatorSignatures.add(signature);
      return normalized;
    });

    const eventsInput = record(targetInput.events, `${path}.events`);
    exactKeys(
      eventsInput,
      ["click", "change", "submit", "deadClick", "rageClick", "correction"],
      `${path}.events`,
    );
    const events: ObservationTargetEvents = Object.freeze({
      ...(eventsInput.click === undefined
        ? {}
        : { click: binding(eventsInput.click, `${path}.events.click`) }),
      ...(eventsInput.change === undefined
        ? {}
        : { change: binding(eventsInput.change, `${path}.events.change`) }),
      ...(eventsInput.submit === undefined
        ? {}
        : { submit: binding(eventsInput.submit, `${path}.events.submit`) }),
      ...(eventsInput.deadClick === undefined
        ? {}
        : { deadClick: binding(eventsInput.deadClick, `${path}.events.deadClick`) }),
      ...(eventsInput.rageClick === undefined
        ? {}
        : { rageClick: binding(eventsInput.rageClick, `${path}.events.rageClick`) }),
      ...(eventsInput.correction === undefined
        ? {}
        : { correction: binding(eventsInput.correction, `${path}.events.correction`) }),
    });
    if (
      events.click === undefined &&
      events.change === undefined &&
      events.submit === undefined
    ) {
      throw new TypeError(`${path}.events must declare click, change, or submit`);
    }
    if (events.deadClick !== undefined && events.click === undefined) {
      throw new TypeError(`${path}.events.deadClick requires click`);
    }
    if (events.rageClick !== undefined && events.click === undefined) {
      throw new TypeError(`${path}.events.rageClick requires click`);
    }
    if (events.correction !== undefined && events.change === undefined) {
      throw new TypeError(`${path}.events.correction requires change`);
    }
    return Object.freeze({ token, locators: Object.freeze(locators), events });
  });

  if (!Array.isArray(root.routes) || root.routes.length > 2_000) {
    throw new TypeError("runtimeMap.routes must contain at most 2000 routes");
  }
  const routePatterns = new Set<string>();
  const routes: ObservationRoute[] = root.routes.map((candidate, routeIndex) => {
    const path = `runtimeMap.routes[${routeIndex}]`;
    const routeInput = record(candidate, path);
    exactKeys(routeInput, ["pattern", "start", "complete"], path);
    const pattern = routePattern(routeInput.pattern, `${path}.pattern`);
    if (routePatterns.has(pattern)) throw new TypeError(`${path}.pattern must be unique`);
    routePatterns.add(pattern);
    return Object.freeze({
      pattern,
      start: binding(routeInput.start, `${path}.start`),
      complete: binding(routeInput.complete, `${path}.complete`),
    });
  });

  const systemInput = record(root.systemEvents, "runtimeMap.systemEvents");
  exactKeys(
    systemInput,
    ["sessionEnd", "runtimeError", "lcp", "inp", "cls"],
    "runtimeMap.systemEvents",
  );
  const systemEvents = Object.freeze({
    sessionEnd: binding(systemInput.sessionEnd, "runtimeMap.systemEvents.sessionEnd"),
    runtimeError: binding(systemInput.runtimeError, "runtimeMap.systemEvents.runtimeError"),
    lcp: binding(systemInput.lcp, "runtimeMap.systemEvents.lcp"),
    inp: binding(systemInput.inp, "runtimeMap.systemEvents.inp"),
    cls: binding(systemInput.cls, "runtimeMap.systemEvents.cls"),
  });

  const signalsInput = record(root.signals, "runtimeMap.signals");
  exactKeys(
    signalsInput,
    ["deadClickDelayMs", "rageClickWindowMs", "rageClickCount", "correctionWindowMs"],
    "runtimeMap.signals",
  );
  const signals = Object.freeze({
    deadClickDelayMs: integer(
      signalsInput.deadClickDelayMs,
      "runtimeMap.signals.deadClickDelayMs",
      250,
      5_000,
    ),
    rageClickWindowMs: integer(
      signalsInput.rageClickWindowMs,
      "runtimeMap.signals.rageClickWindowMs",
      250,
      10_000,
    ),
    rageClickCount: integer(
      signalsInput.rageClickCount,
      "runtimeMap.signals.rageClickCount",
      2,
      10,
    ),
    correctionWindowMs: integer(
      signalsInput.correctionWindowMs,
      "runtimeMap.signals.correctionWindowMs",
      250,
      30_000,
    ),
  });

  const limitsInput = record(root.limits, "runtimeMap.limits");
  exactKeys(
    limitsInput,
    [
      "maxBatchSize",
      "maxQueueSize",
      "maxEventBytes",
      "maxPayloadBytes",
      "maxEventsPerMinute",
      "flushIntervalMs",
      "requestTimeoutMs",
    ],
    "runtimeMap.limits",
  );
  const limits = Object.freeze({
    maxBatchSize: integer(limitsInput.maxBatchSize, "runtimeMap.limits.maxBatchSize", 1, 100),
    maxQueueSize: integer(limitsInput.maxQueueSize, "runtimeMap.limits.maxQueueSize", 1, 2_000),
    maxEventBytes: integer(limitsInput.maxEventBytes, "runtimeMap.limits.maxEventBytes", 512, 16_384),
    maxPayloadBytes: integer(limitsInput.maxPayloadBytes, "runtimeMap.limits.maxPayloadBytes", 1_024, 256_000),
    maxEventsPerMinute: integer(
      limitsInput.maxEventsPerMinute,
      "runtimeMap.limits.maxEventsPerMinute",
      1,
      10_000,
    ),
    flushIntervalMs: integer(limitsInput.flushIntervalMs, "runtimeMap.limits.flushIntervalMs", 250, 60_000),
    requestTimeoutMs: integer(limitsInput.requestTimeoutMs, "runtimeMap.limits.requestTimeoutMs", 250, 30_000),
  });
  if (limits.maxBatchSize > limits.maxQueueSize) {
    throw new TypeError("runtimeMap.limits.maxBatchSize cannot exceed maxQueueSize");
  }
  if (limits.maxEventBytes > limits.maxPayloadBytes) {
    throw new TypeError("runtimeMap.limits.maxEventBytes cannot exceed maxPayloadBytes");
  }

  const declarations = new Map<string, string>();
  const allBindings = [
    ...targets.flatMap((target) => [
      target.events.click,
      target.events.change,
      target.events.submit,
      target.events.deadClick,
      target.events.rageClick,
      target.events.correction,
    ]),
    ...routes.flatMap((route) => [route.start, route.complete]),
    systemEvents.sessionEnd,
    systemEvents.runtimeError,
    systemEvents.lcp,
    systemEvents.inp,
    systemEvents.cls,
  ].filter((candidate): candidate is ObservationEventBinding => candidate !== undefined);
  for (const declaration of allBindings) {
    const signature = `${declaration.kind}|${declaration.nodeId}|${declaration.surfaceId ?? ""}`;
    const previous = declarations.get(declaration.eventName);
    if (previous !== undefined && previous !== signature) {
      throw new TypeError(
        `Event '${declaration.eventName}' cannot point to multiple product nodes or kinds`,
      );
    }
    declarations.set(declaration.eventName, signature);
  }

  return Object.freeze({
    schemaVersion: "living.observation-runtime/v1",
    application,
    collector,
    targets: Object.freeze(targets),
    routes: Object.freeze(routes),
    systemEvents,
    signals,
    limits,
  });
}

const INSTRUMENTATION_CLIENT_SOURCE = `// Generated by @living-software/observer. Do not edit by hand.
type LivingObserverModule = typeof import("./living-observer.generated");
type NavigationType = "push" | "replace" | "traverse";

let livingObserverModule: Promise<LivingObserverModule | undefined> | undefined;

function loadLivingObserver(): Promise<LivingObserverModule | undefined> | undefined {
  if (typeof window === "undefined") return undefined;
  livingObserverModule ??= import("./living-observer.generated").catch(() => undefined);
  return livingObserverModule;
}

// Next executes this file directly. Defer import and initialization so the
// instrumentation adds no synchronous work to hydration.
try {
  if (typeof window !== "undefined") {
    queueMicrotask(() => {
      void loadLivingObserver()?.then((observer) => observer?.startLivingObserver());
    });
  }
} catch {
  // Observation must never prevent the host application from starting.
}

export function onRouterTransitionStart(
  url: string,
  navigationType: NavigationType,
): void {
  void navigationType;
  try {
    void loadLivingObserver()?.then((observer) => {
      observer?.recordLivingRouterTransitionStart(url);
    });
  } catch {
    // Router instrumentation must never affect navigation.
  }
}
`;

export function generateNextObserverFiles(input: unknown): GeneratedNextObserverFiles {
  const runtimeMap = normalizeRuntimeMap(input);
  const serializedMap = JSON.stringify(runtimeMap, null, 2);
  const browserModule = `// Generated by @living-software/observer. Do not edit by hand.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- generated dependency-free runtime is intentionally type-isolated.
// @ts-nocheck -- this dependency-free runtime is validated by the generator.
"use client";

const LIVING_RUNTIME_MAP = ${serializedMap};

${BROWSER_RUNTIME_SOURCE}

let livingObserverController;

function ensureLivingObserver() {
  livingObserverController ??= startGeneratedLivingObserver(
    LIVING_RUNTIME_MAP,
    globalThis,
  );
  return livingObserverController;
}

export async function startLivingObserver() {
  try {
    ensureLivingObserver();
  } catch {
    // The observer is intentionally isolated from its host.
  }
}

export function recordLivingRouterTransitionStart(candidate) {
  try {
    ensureLivingObserver()?.routeStart(candidate);
  } catch {
    // Router instrumentation must never affect navigation.
  }
}

export async function stopLivingObserver() {
  try {
    await livingObserverController?.stop();
  } catch {
    // The observer is intentionally isolated from its host.
  } finally {
    livingObserverController = undefined;
  }
}
`;

  return Object.freeze({
    instrumentationClient: Object.freeze({
      relativePath: "src/instrumentation-client.ts" as const,
      content: INSTRUMENTATION_CLIENT_SOURCE,
    }),
    browserModule: Object.freeze({
      relativePath: "src/living-observer.generated.ts" as const,
      content: browserModule,
    }),
    runtimeMap,
  });
}
