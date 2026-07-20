import assert from "node:assert/strict";
import test from "node:test";

import { parseWorkflowEvent } from "@living-software/contracts";

import { generateNextObserverFiles } from "./generator.js";
import { OBSERVATION_METADATA_KEYS } from "./metadata.js";
import { BROWSER_RUNTIME_SOURCE } from "./runtime-source.js";
import type {
  BrowserObserverController,
  ObservationEventBinding,
  ObservationRuntimeMap,
} from "./types.js";

function eventBinding(
  eventName: string,
  kind: ObservationEventBinding["kind"],
  nodeId = "node.crm",
): ObservationEventBinding {
  return { eventName, kind, nodeId, surfaceId: "surface.crm" };
}

function runtimeMap(overrides: {
  synthetic?: boolean;
  routes?: ObservationRuntimeMap["routes"];
  maxEventsPerMinute?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
} = {}): ObservationRuntimeMap {
  return {
    schemaVersion: "living.observation-runtime/v1",
    application: {
      appId: "surus.crm",
      environment: "development",
      releaseRevision: "test-revision",
      manifestHash: `sha256:${"a".repeat(64)}`,
      synthetic: overrides.synthetic ?? false,
    },
    collector: { endpoint: "/api/living/events" },
    targets: [
      {
        token: "target.deal-save",
        locators: [
          { strategy: "living-id", value: "deal.save" },
          { strategy: "test-id", match: "prefix", value: "Deal-Save-" },
          {
            strategy: "structure",
            tag: "button",
            ancestorTags: ["form"],
            ordinalWithinParent: 0,
          },
        ],
        events: {
          click: eventBinding("deal.save.click", "action", "action.deal-save"),
          change: eventBinding("deal.save.change", "action", "action.deal-save"),
          submit: eventBinding("deal.save.submit", "action", "action.deal-save"),
          deadClick: eventBinding("deal.save.dead-click", "outcome", "action.deal-save"),
          rageClick: eventBinding("deal.save.rage-click", "outcome", "action.deal-save"),
          correction: eventBinding("deal.save.correction", "outcome", "action.deal-save"),
        },
      },
    ],
    routes:
      overrides.routes ??
      [
        {
          pattern: "/deals/:dealId",
          start: eventBinding("route.deal.start", "navigation", "route.deal"),
          complete: eventBinding("route.deal.complete", "navigation", "route.deal"),
        },
      ],
    systemEvents: {
      sessionEnd: eventBinding("observer.session-end", "system", "system.observer"),
      runtimeError: eventBinding("observer.runtime-error", "error", "system.observer"),
      lcp: eventBinding("observer.vital-lcp", "system", "system.observer"),
      inp: eventBinding("observer.vital-inp", "system", "system.observer"),
      cls: eventBinding("observer.vital-cls", "system", "system.observer"),
    },
    signals: {
      deadClickDelayMs: 500,
      rageClickWindowMs: 1_000,
      rageClickCount: 3,
      correctionWindowMs: 2_000,
    },
    limits: {
      maxBatchSize: overrides.maxBatchSize ?? 50,
      maxQueueSize: overrides.maxQueueSize ?? 100,
      maxEventBytes: 8_192,
      maxPayloadBytes: 64_000,
      maxEventsPerMinute: overrides.maxEventsPerMinute ?? 500,
      flushIntervalMs: 10_000,
      requestTimeoutMs: 2_000,
    },
  };
}

class FakeEventTarget {
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(eventType: string, callback: (event: unknown) => void): void {
    const callbacks = this.listeners.get(eventType) ?? new Set();
    callbacks.add(callback);
    this.listeners.set(eventType, callbacks);
  }

  removeEventListener(eventType: string, callback: (event: unknown) => void): void {
    this.listeners.get(eventType)?.delete(callback);
  }

  dispatch(eventType: string, event: unknown = {}): void {
    for (const callback of this.listeners.get(eventType) ?? []) callback(event);
  }
}

class FakeElement {
  parentElement: FakeElement | null = null;
  previousElementSibling: FakeElement | null = null;
  disabled = false;
  readonly attributes = new Map<string, string>();
  readonly localName: string;

  // Deliberately sensitive bait: the observer must never read or emit these.
  textContent = "PRIVATE CUSTOMER ALPHA";
  value = "private-value-991";
  name = "private-name-991";
  id = "private-id-991";
  className = "private-class-991";

  constructor(localName: string, attributes: Record<string, string> = {}) {
    this.localName = localName;
    for (const [key, value] of Object.entries(attributes)) this.attributes.set(key, value);
  }

  getAttribute(attributeName: string): string | null {
    return this.attributes.get(attributeName) ?? null;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 31.4, top: 85.8, width: 160.2, height: 41.6 };
  }
}

interface FetchCall {
  readonly endpoint: string;
  readonly options: Record<string, unknown>;
}

interface FakeScope extends FakeEventTarget {
  document: FakeEventTarget & {
    documentElement: FakeElement & { clientWidth: number; clientHeight: number };
    visibilityState: string;
  };
  fetchCalls: FetchCall[];
  beaconCalls: Array<{ endpoint: string; body: Blob }>;
  sessionStorageCalls: number;
  advanceClock(milliseconds: number): void;
  runTimeouts(): void;
  performanceObservers: Map<string, { callback: (entries: { getEntries(): unknown[] }) => void }>;
  [key: string]: unknown;
}

function createScope(options: {
  rejectFetch?: boolean;
  acceptBeacon?: boolean;
  fetchOkSequence?: readonly boolean[];
} = {}): FakeScope {
  const windowTarget = new FakeEventTarget() as FakeScope;
  const documentTarget = new FakeEventTarget() as FakeScope["document"];
  const root = new FakeElement("html") as FakeScope["document"]["documentElement"];
  root.clientWidth = 1440;
  root.clientHeight = 900;
  documentTarget.documentElement = root;
  documentTarget.visibilityState = "visible";
  windowTarget.document = documentTarget;

  let clock = 1_000;
  let timerSequence = 0;
  const timeouts = new Map<number, { callback: () => void; delay: number }>();
  const intervals = new Set<number>();
  const storage = new Map<string, string>();
  let randomSequence = 0;
  const location = { origin: "https://crm.test", pathname: "/deals/private-route-42" };
  const performanceObservers = new Map<
    string,
    { callback: (entries: { getEntries(): unknown[] }) => void }
  >();

  class FakePerformanceObserver {
    static supportedEntryTypes = ["largest-contentful-paint", "event", "layout-shift"];
    readonly callback: (entries: { getEntries(): unknown[] }) => void;

    constructor(callback: (entries: { getEntries(): unknown[] }) => void) {
      this.callback = callback;
    }

    observe(observation: { type: string }): void {
      performanceObservers.set(observation.type, this);
    }

    disconnect(): void {}
  }

  Object.assign(windowTarget, {
    AbortController,
    Blob,
    Date,
    Math,
    PerformanceObserver: FakePerformanceObserver,
    TextEncoder,
    URL,
    crypto: {
      randomUUID: () => {
        randomSequence += 1;
        return `00000000-0000-4000-8000-${String(randomSequence).padStart(12, "0")}`;
      },
    },
    devicePixelRatio: 2,
    fetchCalls: [] as FetchCall[],
    beaconCalls: [] as Array<{ endpoint: string; body: Blob }>,
    sessionStorageCalls: 0,
    advanceClock: (milliseconds: number) => {
      clock += milliseconds;
    },
    getComputedStyle: () => ({ position: "sticky" }),
    history: {
      pushState(_state: unknown, _title: string, candidate: string): void {
        location.pathname = new URL(candidate, location.origin).pathname;
      },
      replaceState(_state: unknown, _title: string, candidate: string): void {
        location.pathname = new URL(candidate, location.origin).pathname;
      },
    },
    innerHeight: 900,
    innerWidth: 1440,
    location,
    navigator: {
      sendBeacon: (endpoint: string, body: Blob) => {
        windowTarget.beaconCalls.push({ endpoint, body });
        return options.acceptBeacon ?? false;
      },
    },
    performance: { now: () => clock },
    performanceObservers,
    queueMicrotask: (callback: () => void) => callback(),
    scrollX: 11,
    scrollY: 250,
    sessionStorage: {
      getItem: (key: string) => {
        windowTarget.sessionStorageCalls += 1;
        return storage.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        windowTarget.sessionStorageCalls += 1;
        storage.set(key, value);
      },
    },
    setInterval: () => {
      timerSequence += 1;
      intervals.add(timerSequence);
      return timerSequence;
    },
    clearInterval: (handle: number) => intervals.delete(handle),
    setTimeout: (callback: () => void, delay: number) => {
      timerSequence += 1;
      timeouts.set(timerSequence, { callback, delay });
      return timerSequence;
    },
    clearTimeout: (handle: number) => timeouts.delete(handle),
    runTimeouts: () => {
      while (timeouts.size > 0) {
        const pending = [...timeouts.entries()];
        timeouts.clear();
        for (const [, timer] of pending) {
          clock += timer.delay;
          timer.callback();
        }
      }
    },
  });

  let fetchAttempt = 0;
  windowTarget.fetch = async (endpoint: string, fetchOptions: Record<string, unknown>) => {
    windowTarget.fetchCalls.push({ endpoint, options: fetchOptions });
    if (options.rejectFetch) throw new Error("offline");
    const ok = options.fetchOkSequence?.[fetchAttempt] ?? true;
    fetchAttempt += 1;
    return { ok };
  };

  return windowTarget;
}

function startRuntime(
  config: ObservationRuntimeMap,
  scope: FakeScope,
): BrowserObserverController {
  const factory = new Function(
    `${BROWSER_RUNTIME_SOURCE}\nreturn startGeneratedLivingObserver;`,
  )() as (runtime: ObservationRuntimeMap, browserScope: FakeScope) => BrowserObserverController;
  return factory(config, scope);
}

function allEvents(scope: FakeScope): unknown[] {
  return scope.fetchCalls.flatMap((call) => {
    const body = call.options.body;
    assert.equal(typeof body, "string");
    return (JSON.parse(body) as { events: unknown[] }).events;
  });
}

test("generates Next 15.3+ instrumentation and a dependency-free runtime", () => {
  const generated = generateNextObserverFiles(runtimeMap());
  assert.equal(generated.instrumentationClient.relativePath, "src/instrumentation-client.ts");
  assert.doesNotMatch(generated.instrumentationClient.content, /function register/);
  assert.match(generated.instrumentationClient.content, /queueMicrotask\(\(\) =>/);
  assert.match(generated.instrumentationClient.content, /loadLivingObserver\(\)\?\.then/);
  assert.match(generated.instrumentationClient.content, /export function onRouterTransitionStart/);
  assert.match(generated.instrumentationClient.content, /void navigationType;/);
  assert.doesNotMatch(generated.instrumentationClient.content, /_navigationType/);
  assert.match(generated.instrumentationClient.content, /recordLivingRouterTransitionStart\(url\)/);
  assert.match(generated.instrumentationClient.content, /import\("\.\/living-observer\.generated"\)/);
  assert.match(generated.browserModule.content, /listen\(doc, "click"/);
  assert.match(generated.browserModule.content, /listen\(doc, "change"/);
  assert.match(generated.browserModule.content, /listen\(doc, "submit"/);
  assert.match(generated.browserModule.content, /"pagehide"/);
  assert.match(generated.browserModule.content, /"unhandledrejection"/);
  assert.match(generated.browserModule.content, /largest-contentful-paint/);
  assert.match(generated.browserModule.content, /"Content-Type": "application\/json"/);
  assert.match(generated.browserModule.content, /new scope\.Blob\(\[payload\]/);
  assert.match(
    generated.browserModule.content,
    /eslint-disable-next-line @typescript-eslint\/ban-ts-comment[^\n]*\n\/\/ @ts-nocheck/,
  );
  assert.doesNotMatch(generated.browserModule.content, /eslint-disable(?!-next-line)/);
  assert.doesNotMatch(generated.browserModule.content, /\barguments\b/);
  assert.match(generated.browserModule.content, /function \(\.\.\.args\)/);
  assert.equal(
    generated.runtimeMap.targets[0]?.locators[1]?.strategy,
    "test-id",
  );
  assert.equal(
    generated.runtimeMap.targets[0]?.locators[1]?.value,
    "deal-save-",
  );
});

test("generated source contains no prohibited content-capture paths or listeners", () => {
  const source = generateNextObserverFiles(runtimeMap()).browserModule.content;
  const forbidden = [
    ".textContent",
    ".innerHTML",
    ".outerHTML",
    "FormData",
    "document.cookie",
    ".className",
    ".classList",
    'getAttribute("value")',
    'getAttribute("name")',
    'getAttribute("id")',
    'getAttribute("aria-label")',
    'listen(doc, "input"',
    'listen(doc, "keydown"',
    'listen(doc, "paste"',
    "clipboard",
    "screenshot",
    ".searchParams",
    ".hash",
    "sessionStorage",
    "localStorage",
  ];
  for (const candidate of forbidden) {
    assert.equal(source.includes(candidate), false, `found prohibited source path: ${candidate}`);
  }
});

test("delegated observation emits valid bounded events without raw locators or content", async () => {
  const scope = createScope();
  const config = runtimeMap({ synthetic: true });
  const controller = startRuntime(config, scope);
  const form = new FakeElement("form");
  const button = new FakeElement("button", {
    "data-testid": "DEAL-SAVE-private-customer-42",
  });
  button.parentElement = form;

  scope.document.dispatch("click", { target: button });
  scope.history.pushState({}, "ignored", "/deals/secret-deal-991?token=private#private");
  scope.dispatch("error", { message: "PRIVATE ERROR MESSAGE", error: new Error("PRIVATE STACK") });
  await controller.flush();

  assert.ok(scope.fetchCalls.length > 0);
  for (const call of scope.fetchCalls) {
    assert.equal(call.endpoint, "/api/living/events");
    assert.deepEqual(call.options.headers, { "Content-Type": "application/json" });
    const serialized = String(call.options.body);
    for (const privateValue of [
      "private-customer-42",
      "secret-deal-991",
      "token=private",
      "PRIVATE CUSTOMER ALPHA",
      "private-value-991",
      "private-name-991",
      "private-id-991",
      "private-class-991",
      "PRIVATE ERROR MESSAGE",
      "PRIVATE STACK",
    ]) {
      assert.equal(serialized.includes(privateValue), false, `leaked ${privateValue}`);
    }
  }

  const events = allEvents(scope).map(parseWorkflowEvent);
  const click = events.find((event) => event.name === "deal.save.click");
  assert.ok(click);
  assert.equal(click.product?.nodeId, "action.deal-save");
  assert.equal(click.provenance.synthetic, true);
  assert.equal(click.metadata.interaction, "click");
  assert.deepEqual(click.metadata.targetGeometry, { x: 31, y: 86, width: 160, height: 42 });
  const allowedMetadata = new Set<string>(OBSERVATION_METADATA_KEYS);
  for (const event of events) {
    for (const key of Object.keys(event.metadata)) assert.ok(allowedMetadata.has(key));
  }
  assert.match(controller.snapshot().sessionId, /^tab-/);
  await controller.stop();
});

test("resolves existing living ids before test-id and structural fallbacks", async () => {
  const scope = createScope();
  const controller = startRuntime(runtimeMap(), scope);
  const button = new FakeElement("button", {
    "data-living-id": "deal.save",
    "data-testid": "unrelated-private-value",
  });
  scope.document.dispatch("click", { target: button });
  await controller.flush();
  const events = allEvents(scope).map(parseWorkflowEvent);
  assert.ok(events.some((event) => event.name === "deal.save.click"));
});

test("detects dead clicks, rage clicks, and corrections without reading values", async () => {
  const scope = createScope();
  const controller = startRuntime(runtimeMap(), scope);
  const target = new FakeElement("button", { "data-living-id": "deal.save" });

  scope.document.dispatch("click", { target });
  scope.runTimeouts();
  scope.document.dispatch("click", { target });
  scope.document.dispatch("click", { target });
  scope.document.dispatch("click", { target });
  scope.document.dispatch("change", { target });
  scope.document.dispatch("change", { target });
  scope.runTimeouts();
  await controller.flush();

  const names = new Set(allEvents(scope).map(parseWorkflowEvent).map((event) => event.name));
  assert.ok(names.has("deal.save.dead-click"));
  assert.ok(names.has("deal.save.rage-click"));
  assert.ok(names.has("deal.save.correction"));
});

test("emits supported vitals and session end through an application/json beacon", async () => {
  const scope = createScope({ acceptBeacon: true });
  startRuntime(runtimeMap(), scope);
  scope.performanceObservers.get("largest-contentful-paint")?.callback({
    getEntries: () => [{ startTime: 1234.5 }],
  });
  scope.performanceObservers.get("event")?.callback({
    getEntries: () => [{ interactionId: 7, duration: 187.2 }],
  });
  scope.performanceObservers.get("layout-shift")?.callback({
    getEntries: () => [{ hadRecentInput: false, value: 0.17 }],
  });
  scope.dispatch("pagehide");
  await Promise.resolve();
  await Promise.resolve();

  assert.ok(scope.beaconCalls.length > 0);
  const beacon = scope.beaconCalls[0];
  assert.ok(beacon);
  assert.equal(beacon.endpoint, "/api/living/events");
  assert.equal(beacon.body.type, "application/json");
  const batch = JSON.parse(await beacon.body.text()) as { events: unknown[] };
  const names = new Set(batch.events.map(parseWorkflowEvent).map((event) => event.name));
  assert.ok(names.has("observer.vital-lcp"));
  assert.ok(names.has("observer.vital-inp"));
  assert.ok(names.has("observer.vital-cls"));
  assert.ok(names.has("observer.session-end"));
});

test("collector failures are swallowed and bounded events are retained", async () => {
  const scope = createScope({ rejectFetch: true });
  const controller = startRuntime(runtimeMap({ routes: [] }), scope);
  const target = new FakeElement("button", { "data-living-id": "deal.save" });
  scope.document.dispatch("click", { target });
  await assert.doesNotReject(controller.flush());
  assert.equal(controller.snapshot().queued, 1);
});

test("same-origin transport retries an HTTP-rejected batch without losing evidence", async () => {
  const scope = createScope({ fetchOkSequence: [false, true] });
  const controller = startRuntime(runtimeMap({ routes: [] }), scope);
  const target = new FakeElement("button", { "data-living-id": "deal.save" });
  scope.document.dispatch("click", { target });

  await assert.doesNotReject(controller.flush());
  assert.equal(scope.fetchCalls.length, 1);
  const rejected = scope.fetchCalls[0];
  assert.ok(rejected);
  assert.equal(rejected.endpoint, "/api/living/events");
  assert.equal(rejected.options.credentials, "same-origin");
  assert.equal(controller.snapshot().queued, 1);

  await assert.doesNotReject(controller.flush());
  assert.equal(scope.fetchCalls.length, 2);
  const accepted = scope.fetchCalls[1];
  assert.ok(accepted);
  assert.equal(accepted.endpoint, "/api/living/events");
  assert.equal(accepted.options.body, rejected.options.body);
  assert.equal(controller.snapshot().queued, 0);
});

test("each document boot uses a fresh anonymous session without persistent identifiers", async () => {
  const scope = createScope();
  const config = runtimeMap();
  const first = startRuntime(config, scope);
  const firstSession = first.snapshot().sessionId;
  await first.stop();
  scope.fetchCalls.length = 0;

  const second = startRuntime(config, scope);
  const secondSession = second.snapshot().sessionId;
  assert.match(firstSession, /^tab-[A-Za-z0-9-]+$/);
  assert.match(secondSession, /^tab-[A-Za-z0-9-]+$/);
  assert.notEqual(secondSession, firstSession);
  assert.equal(scope.sessionStorageCalls, 0);

  scope.history.pushState({}, "ignored", "/deals/another-private-route");
  await second.flush();
  const sessions = new Set(allEvents(scope).map(parseWorkflowEvent).map((event) => event.sessionId));
  assert.deepEqual([...sessions], [secondSession]);
  await second.stop();
});

test("deduplicates route phases across Next signals while preserving later revisits", async () => {
  const scope = createScope();
  const controller = startRuntime(runtimeMap(), scope);
  await controller.flush();
  scope.fetchCalls.length = 0;

  controller.routeStart("/deals/private-a");
  controller.routeStart("/deals/private-a");
  scope.history.pushState({}, "ignored", "/deals/private-a");
  scope.history.replaceState({}, "ignored", "/deals/private-a");
  await controller.flush();

  let routeEvents = allEvents(scope)
    .map(parseWorkflowEvent)
    .filter((event) => event.name === "route.deal.start" || event.name === "route.deal.complete");
  assert.equal(routeEvents.filter((event) => event.metadata.routePhase === "start").length, 1);
  assert.equal(routeEvents.filter((event) => event.metadata.routePhase === "complete").length, 1);

  scope.advanceClock(251);
  controller.routeStart("/deals/private-b");
  scope.history.pushState({}, "ignored", "/deals/private-b");
  await controller.flush();
  routeEvents = allEvents(scope)
    .map(parseWorkflowEvent)
    .filter((event) => event.name === "route.deal.start" || event.name === "route.deal.complete");
  assert.equal(routeEvents.filter((event) => event.metadata.routePhase === "start").length, 2);
  assert.equal(routeEvents.filter((event) => event.metadata.routePhase === "complete").length, 2);
  assert.equal(new Set(routeEvents.map((event) => event.sessionId)).size, 1);
  await controller.stop();
});

test("per-minute rate limits drop excess events without affecting the host", async () => {
  const scope = createScope();
  const controller = startRuntime(
    runtimeMap({
      routes: [],
      maxEventsPerMinute: 1,
      maxBatchSize: 1,
      maxQueueSize: 1,
    }),
    scope,
  );
  const target = new FakeElement("button", { "data-living-id": "deal.save" });
  assert.doesNotThrow(() => {
    scope.document.dispatch("click", { target });
    scope.document.dispatch("click", { target });
    scope.document.dispatch("click", { target });
  });
  await controller.flush();
  assert.ok(controller.snapshot().dropped >= 2);
});

test("generator rejects unsafe endpoints, unknown fields, and duplicate locators", () => {
  const wrongEndpoint = structuredClone(runtimeMap()) as unknown as Record<string, unknown>;
  (wrongEndpoint.collector as Record<string, unknown>).endpoint = "https://collector.invalid";
  assert.throws(() => generateNextObserverFiles(wrongEndpoint), /must be \/api\/living\/events/);

  const extraField = structuredClone(runtimeMap()) as unknown as Record<string, unknown>;
  extraField.secret = "must-not-be-embedded";
  assert.throws(() => generateNextObserverFiles(extraField), /is not supported/);

  const duplicate = structuredClone(runtimeMap());
  duplicate.targets.push(structuredClone(duplicate.targets[0]!));
  duplicate.targets[1]!.token = "target.duplicate";
  assert.throws(() => generateNextObserverFiles(duplicate), /globally unique/);
});
