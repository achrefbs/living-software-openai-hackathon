/**
 * Dependency-free browser source embedded verbatim in generated host files.
 * Keep this as JavaScript-valid TypeScript so the exact shipped runtime can be
 * executed against minimal browser fakes in tests.
 */
export const BROWSER_RUNTIME_SOURCE = String.raw`
const startGeneratedLivingObserver = (runtimeConfig, injectedScope) => {
  "use strict";

  const scope = injectedScope;
  const doc = scope && scope.document;
  const emptyController = {
    flush: async () => {},
    routeStart: () => {},
    stop: async () => {},
    snapshot: () => Object.freeze({ queued: 0, dropped: 0, sessionId: "unavailable" }),
  };

  if (!scope || !doc || typeof doc.addEventListener !== "function") {
    return emptyController;
  }

  try {
    const config = runtimeConfig;
    const targetByToken = new Map();
    const targetByLivingId = new Map();
    const targetByExactTestId = new Map();
    const testIdPrefixes = [];
    const testIdSuffixes = [];
    const structuralTargets = [];
    for (const target of config.targets) {
      targetByToken.set(target.token, target);
      for (const locator of target.locators) {
        if (locator.strategy === "living-id") targetByLivingId.set(locator.value, target);
        if (locator.strategy === "test-id" && locator.match === "exact") {
          targetByExactTestId.set(locator.value, target);
        }
        if (locator.strategy === "test-id" && locator.match === "prefix") {
          testIdPrefixes.push({ locator, target });
        }
        if (locator.strategy === "test-id" && locator.match === "suffix") {
          testIdSuffixes.push({ locator, target });
        }
        if (locator.strategy === "structure") structuralTargets.push({ locator, target });
      }
    }
    testIdPrefixes.sort((left, right) => right.locator.value.length - left.locator.value.length);
    testIdSuffixes.sort((left, right) => right.locator.value.length - left.locator.value.length);
    structuralTargets.sort((left, right) => {
      const leftScore = (left.locator.ancestorTags || []).length * 2 +
        (left.locator.ordinalWithinParent === undefined ? 0 : 1);
      const rightScore = (right.locator.ancestorTags || []).length * 2 +
        (right.locator.ordinalWithinParent === undefined ? 0 : 1);
      return rightScore - leftScore;
    });

    const listeners = [];
    const timeoutHandles = new Set();
    const observers = [];
    const pendingDeadChecks = new Set();
    const clickHistory = new Map();
    const changeHistory = new Map();
    const queue = [];
    let intervalHandle;
    let stopped = false;
    let ended = false;
    let dropped = 0;
    let sequence = 0;
    let batchSequence = 0;
    let activeSend;
    let activityVersion = 0;
    let rateWindowStartedAt = 0;
    let rateWindowEvents = 0;
    let lastLcp = null;
    let lastInp = null;
    let cumulativeCls = 0;
    let clsSupported = false;
    let routeTransitionSequence = 0;
    const recentRouteTransitions = new Map();
    const routeTransitionDedupeMs = 250;

    const now = () => {
      try {
        if (scope.performance && typeof scope.performance.now === "function") {
          return scope.performance.now();
        }
      } catch {}
      return scope.Date.now();
    };

    const clampNumber = (candidate, minimum, maximum) => {
      const numeric = Number(candidate);
      if (!Number.isFinite(numeric)) return 0;
      return Math.min(maximum, Math.max(minimum, numeric));
    };

    const rounded = (candidate, minimum, maximum, decimals) => {
      const multiplier = Math.pow(10, decimals);
      return Math.round(clampNumber(candidate, minimum, maximum) * multiplier) / multiplier;
    };

    const randomPart = () => {
      try {
        if (scope.crypto && typeof scope.crypto.randomUUID === "function") {
          return scope.crypto.randomUUID().replace(/[^A-Za-z0-9-]/g, "");
        }
        if (scope.crypto && typeof scope.crypto.getRandomValues === "function") {
          const bytes = new Uint8Array(16);
          scope.crypto.getRandomValues(bytes);
          let encoded = "";
          for (const byte of bytes) encoded += byte.toString(16).padStart(2, "0");
          return encoded;
        }
      } catch {}
      try {
        return String(scope.Math.random()).slice(2) + String(scope.Date.now());
      } catch {
        return String(scope.Date.now());
      }
    };

    // A document lifecycle owns one anonymous session. A reload/HMR boot must
    // not reuse an id with counters reset to zero, which would collide at the
    // append-only collector. SPA transitions keep using this controller id.
    const sessionId = "tab-" + randomPart();

    const later = (callback, delay) => {
      if (typeof scope.setTimeout !== "function") return undefined;
      const handle = scope.setTimeout(() => {
        timeoutHandles.delete(handle);
        try {
          callback();
        } catch {}
      }, delay);
      timeoutHandles.add(handle);
      return handle;
    };

    const defer = (callback) => {
      try {
        if (typeof scope.queueMicrotask === "function") {
          scope.queueMicrotask(() => {
            try {
              callback();
            } catch {}
          });
          return;
        }
      } catch {}
      later(callback, 0);
    };

    const listen = (target, eventType, callback, options) => {
      try {
        if (!target || typeof target.addEventListener !== "function") return;
        target.addEventListener(eventType, callback, options);
        listeners.push([target, eventType, callback, options]);
      } catch {}
    };

    const byteLength = (serialized) => {
      try {
        if (typeof scope.TextEncoder === "function") {
          return new scope.TextEncoder().encode(serialized).byteLength;
        }
      } catch {}
      return serialized.length * 2;
    };

    const eventTimestamp = () => {
      try {
        return new scope.Date().toISOString();
      } catch {
        return new Date().toISOString();
      }
    };

    const geometryFor = (element) => {
      let rect = { left: 0, top: 0, width: 0, height: 0 };
      try {
        if (element && typeof element.getBoundingClientRect === "function") {
          rect = element.getBoundingClientRect();
        }
      } catch {}

      const viewportWidth = rounded(
        scope.innerWidth || (doc.documentElement && doc.documentElement.clientWidth) || 0,
        0,
        100000,
        0,
      );
      const viewportHeight = rounded(
        scope.innerHeight || (doc.documentElement && doc.documentElement.clientHeight) || 0,
        0,
        100000,
        0,
      );
      const scrollX = rounded(scope.scrollX || 0, -10000000, 10000000, 0);
      const scrollY = rounded(scope.scrollY || 0, -10000000, 10000000, 0);
      const left = rounded(rect.left, -100000, 100000, 0);
      const top = rounded(rect.top, -100000, 100000, 0);
      const width = rounded(rect.width, 0, 100000, 0);
      const height = rounded(rect.height, 0, 100000, 0);
      const intersectionWidth = Math.max(0, Math.min(left + width, viewportWidth) - Math.max(left, 0));
      const intersectionHeight = Math.max(0, Math.min(top + height, viewportHeight) - Math.max(top, 0));
      const area = width * height;
      const visibilityRatio = area <= 0 ? 0 : rounded((intersectionWidth * intersectionHeight) / area, 0, 1, 3);
      let layout = "flow";
      try {
        const computed = scope.getComputedStyle(element);
        if (computed.position === "fixed" || computed.position === "sticky") layout = computed.position;
      } catch {}
      let disabled = false;
      try {
        disabled = typeof element.disabled === "boolean" ? element.disabled : false;
      } catch {}

      return {
        targetGeometry: { x: left, y: top, width, height },
        viewport: {
          width: viewportWidth,
          height: viewportHeight,
          scrollX,
          scrollY,
          pixelRatio: rounded(scope.devicePixelRatio || 1, 0.25, 8, 2),
        },
        visibility: { ratio: visibilityRatio, inViewport: visibilityRatio > 0 },
        position: {
          layout,
          documentX: rounded(left + scrollX, -10000000, 10000000, 0),
          documentY: rounded(top + scrollY, -10000000, 10000000, 0),
        },
        state: { disabled },
      };
    };

    const makeEvent = (binding, status, metadata) => {
      const product = {
        manifestHash: config.application.manifestHash,
        nodeId: binding.nodeId,
      };
      if (binding.surfaceId !== undefined) product.surfaceId = binding.surfaceId;
      return {
        schemaVersion: "living.workflow-event/v1",
        eventId: "evt-" + randomPart(),
        appId: config.application.appId,
        environment: config.application.environment,
        releaseRevision: config.application.releaseRevision,
        occurredAt: eventTimestamp(),
        sequence: sequence++,
        name: binding.eventName,
        kind: binding.kind,
        status,
        sessionId,
        product,
        metadata,
        provenance: {
          source: "technical-telemetry",
          synthetic: config.application.synthetic,
        },
      };
    };

    const withinRateLimit = () => {
      const timestamp = now();
      if (rateWindowStartedAt === 0 || timestamp - rateWindowStartedAt >= 60000) {
        rateWindowStartedAt = timestamp;
        rateWindowEvents = 0;
      }
      if (rateWindowEvents >= config.limits.maxEventsPerMinute) return false;
      rateWindowEvents += 1;
      return true;
    };

    const enqueue = (event) => {
      if (stopped || !withinRateLimit()) {
        dropped += 1;
        return;
      }
      let serialized;
      try {
        serialized = JSON.stringify(event);
      } catch {
        dropped += 1;
        return;
      }
      if (byteLength(serialized) > config.limits.maxEventBytes || queue.length >= config.limits.maxQueueSize) {
        dropped += 1;
        return;
      }
      queue.push(event);
      if (queue.length >= config.limits.maxBatchSize) void flush(false);
    };

    const emit = (binding, status, metadata) => {
      if (!binding) return;
      try {
        enqueue(makeEvent(binding, status, metadata));
      } catch {
        dropped += 1;
      }
    };

    const takeBatch = () => {
      while (queue.length > 0) {
        const selected = [];
        let payload = "";
        const maximum = Math.min(config.limits.maxBatchSize, queue.length);
        for (let index = 0; index < maximum; index += 1) {
          const candidate = queue[index];
          const next = selected.concat([candidate]);
          const candidatePayload = JSON.stringify({
            schemaVersion: "living.event-batch/v1",
            sequence: batchSequence,
            events: next,
          });
          if (byteLength(candidatePayload) > config.limits.maxPayloadBytes) break;
          selected.push(candidate);
          payload = candidatePayload;
        }
        if (selected.length === 0) {
          queue.shift();
          dropped += 1;
          continue;
        }
        queue.splice(0, selected.length);
        return { events: selected, payload };
      }
      return null;
    };

    const sendPayload = async (payload, preferBeacon) => {
      if (
        preferBeacon &&
        scope.navigator &&
        typeof scope.navigator.sendBeacon === "function" &&
        typeof scope.Blob === "function"
      ) {
        try {
          const body = new scope.Blob([payload], { type: "application/json" });
          if (scope.navigator.sendBeacon(config.collector.endpoint, body)) return;
        } catch {}
      }

      if (typeof scope.fetch !== "function") throw new Error("collector unavailable");
      let abortController;
      let abortHandle;
      try {
        if (typeof scope.AbortController === "function") {
          abortController = new scope.AbortController();
          abortHandle = later(() => abortController.abort(), config.limits.requestTimeoutMs);
        }
        const response = await scope.fetch(config.collector.endpoint, {
          method: "POST",
          body: payload,
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          keepalive: Boolean(preferBeacon),
          ...(abortController === undefined ? {} : { signal: abortController.signal }),
        });
        if (response && response.ok === false) throw new Error("collector rejected batch");
      } finally {
        if (abortHandle !== undefined && typeof scope.clearTimeout === "function") {
          try {
            scope.clearTimeout(abortHandle);
            timeoutHandles.delete(abortHandle);
          } catch {}
        }
      }
    };

    async function flush(preferBeacon) {
      if (activeSend !== undefined) return activeSend;
      activeSend = (async () => {
        while (queue.length > 0) {
          const batch = takeBatch();
          if (batch === null) break;
          try {
            await sendPayload(batch.payload, preferBeacon);
            batchSequence += 1;
          } catch {
            const available = Math.max(0, config.limits.maxQueueSize - queue.length);
            const restored = batch.events.slice(0, available);
            queue.unshift(...restored);
            dropped += batch.events.length - restored.length;
            break;
          }
        }
      })()
        .catch(() => {})
        .finally(() => {
          activeSend = undefined;
        });
      return activeSend;
    }

    const elementChain = (nativeTarget) => {
      const elements = [];
      try {
        let element =
          nativeTarget && typeof nativeTarget.getAttribute === "function"
            ? nativeTarget
            : nativeTarget && nativeTarget.parentElement;
        for (let depth = 0; element && depth < 10; depth += 1) {
          elements.push(element);
          element = element.parentElement;
        }
      } catch {}
      return elements;
    };

    const attribute = (element, attributeName) => {
      try {
        if (!element || typeof element.getAttribute !== "function") return null;
        const candidate = element.getAttribute(attributeName);
        if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 256) {
          return null;
        }
        return candidate;
      } catch {
        return null;
      }
    };

    const normalizedTestId = (element) => {
      const candidate = attribute(element, "data-testid");
      return candidate === null ? null : candidate.trim().toLowerCase();
    };

    const ordinalFor = (element) => {
      try {
        const tag = String(element.localName || "").toLowerCase();
        let ordinal = 0;
        let sibling = element.previousElementSibling;
        for (let scanned = 0; sibling && scanned < 51; scanned += 1) {
          if (String(sibling.localName || "").toLowerCase() === tag) ordinal += 1;
          sibling = sibling.previousElementSibling;
        }
        return ordinal;
      } catch {
        return -1;
      }
    };

    const ancestorsMatch = (element, expectedTags) => {
      if (!expectedTags || expectedTags.length === 0) return true;
      try {
        let ancestor = element.parentElement;
        for (const expected of expectedTags) {
          let found = false;
          for (let depth = 0; ancestor && depth < 10; depth += 1) {
            if (String(ancestor.localName || "").toLowerCase() === expected) {
              found = true;
              ancestor = ancestor.parentElement;
              break;
            }
            ancestor = ancestor.parentElement;
          }
          if (!found) return false;
        }
        return true;
      } catch {
        return false;
      }
    };

    const mappedTarget = (nativeTarget) => {
      const elements = elementChain(nativeTarget);
      for (const element of elements) {
        const token = attribute(element, "data-living-node");
        const target = token === null ? undefined : targetByToken.get(token);
        if (target !== undefined) return { element, target };
      }
      for (const element of elements) {
        const livingId = attribute(element, "data-living-id");
        const target = livingId === null ? undefined : targetByLivingId.get(livingId);
        if (target !== undefined) return { element, target };
      }
      for (const element of elements) {
        const testId = normalizedTestId(element);
        if (testId === null) continue;
        const target = targetByExactTestId.get(testId);
        if (target !== undefined) return { element, target };
      }
      for (const element of elements) {
        const testId = normalizedTestId(element);
        if (testId === null) continue;
        for (const candidate of testIdPrefixes) {
          if (testId.startsWith(candidate.locator.value)) {
            return { element, target: candidate.target };
          }
        }
        for (const candidate of testIdSuffixes) {
          if (testId.endsWith(candidate.locator.value)) {
            return { element, target: candidate.target };
          }
        }
      }
      for (const element of elements) {
        const tag = String(element.localName || "").toLowerCase();
        for (const candidate of structuralTargets) {
          if (candidate.locator.tag !== tag) continue;
          if (
            candidate.locator.ordinalWithinParent !== undefined &&
            ordinalFor(element) !== candidate.locator.ordinalWithinParent
          ) {
            continue;
          }
          if (!ancestorsMatch(element, candidate.locator.ancestorTags)) continue;
          return { element, target: candidate.target };
        }
      }
      return null;
    };

    const signalMetadata = (signal, element) => ({
      signal,
      ...geometryFor(element),
    });

    const scheduleDeadClickCheck = (mapped, expectedActivityVersion) => {
      if (!mapped.target.events.deadClick || pendingDeadChecks.size >= 20) return;
      const check = { changed: false, observer: undefined };
      pendingDeadChecks.add(check);
      try {
        if (typeof scope.MutationObserver === "function" && doc.documentElement) {
          check.observer = new scope.MutationObserver(() => {
            check.changed = true;
          });
          check.observer.observe(doc.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
          });
        }
      } catch {}
      later(() => {
        pendingDeadChecks.delete(check);
        try {
          if (check.observer) check.observer.disconnect();
        } catch {}
        if (!check.changed && activityVersion === expectedActivityVersion) {
          emit(
            mapped.target.events.deadClick,
            "succeeded",
            signalMetadata("dead-click", mapped.element),
          );
        }
      }, config.signals.deadClickDelayMs);
    };

    const detectRageClick = (mapped, timestamp) => {
      const rageBinding = mapped.target.events.rageClick;
      if (!rageBinding) return;
      const previous = clickHistory.get(mapped.target.token) || [];
      const recent = previous.filter(
        (item) => timestamp - item <= config.signals.rageClickWindowMs,
      );
      recent.push(timestamp);
      if (recent.length >= config.signals.rageClickCount) {
        clickHistory.delete(mapped.target.token);
        activityVersion += 1;
        emit(rageBinding, "succeeded", signalMetadata("rage-click", mapped.element));
      } else {
        clickHistory.set(mapped.target.token, recent);
      }
    };

    const detectCorrection = (mapped, timestamp) => {
      const correctionBinding = mapped.target.events.correction;
      if (!correctionBinding) return;
      const previous = changeHistory.get(mapped.target.token);
      changeHistory.set(mapped.target.token, timestamp);
      if (previous !== undefined && timestamp - previous <= config.signals.correctionWindowMs) {
        emit(
          correctionBinding,
          "succeeded",
          signalMetadata("correction", mapped.element),
        );
      }
    };

    const interaction = (interactionType, nativeEvent) => {
      const mapped = mappedTarget(nativeEvent && nativeEvent.target);
      if (mapped === null) return;
      const eventBinding = mapped.target.events[interactionType];
      if (!eventBinding) return;
      const timestamp = now();
      if (interactionType === "change" || interactionType === "submit") {
        activityVersion += 1;
      }
      emit(eventBinding, interactionType === "submit" ? "started" : "succeeded", {
        interaction: interactionType,
        ...geometryFor(mapped.element),
      });
      if (interactionType === "click") {
        const expectedActivityVersion = activityVersion;
        detectRageClick(mapped, timestamp);
        scheduleDeadClickCheck(mapped, expectedActivityVersion);
      }
      if (interactionType === "change") detectCorrection(mapped, timestamp);
    };

    const pathSegments = (pathname) => {
      if (pathname === "/") return [];
      return pathname.split("/").filter((segment) => segment.length > 0);
    };

    const routeMatches = (pattern, pathname) => {
      const expected = pathSegments(pattern);
      const actual = pathSegments(pathname);
      const wildcardIndex = expected.indexOf("*");
      if (wildcardIndex === -1 && expected.length !== actual.length) return false;
      if (wildcardIndex !== -1 && actual.length < wildcardIndex) return false;
      for (let index = 0; index < expected.length; index += 1) {
        const expectedSegment = expected[index];
        if (expectedSegment === "*") return true;
        const actualSegment = actual[index];
        if (actualSegment === undefined) return false;
        if (expectedSegment.startsWith(":")) continue;
        if (expectedSegment !== actualSegment) return false;
      }
      return expected.length === actual.length;
    };

    const safePathname = (candidate) => {
      try {
        if (candidate === undefined || candidate === null || candidate === "") {
          return scope.location.pathname;
        }
        const parsed = new scope.URL(String(candidate), scope.location.origin);
        if (parsed.origin !== scope.location.origin) return null;
        return parsed.pathname;
      } catch {
        return null;
      }
    };

    const mappedRoute = (candidate) => {
      const pathname = safePathname(candidate);
      if (pathname === null) return null;
      for (const route of config.routes) {
        if (routeMatches(route.pattern, pathname)) return route;
      }
      return null;
    };

    const emitVitals = () => {
      if (lastLcp !== null) {
        emit(config.systemEvents.lcp, "succeeded", {
          metric: "lcp",
          value: rounded(lastLcp, 0, 3600000, 1),
          unit: "millisecond",
        });
      }
      if (lastInp !== null) {
        emit(config.systemEvents.inp, "succeeded", {
          metric: "inp",
          value: rounded(lastInp, 0, 3600000, 1),
          unit: "millisecond",
        });
      }
      if (clsSupported) {
        emit(config.systemEvents.cls, "succeeded", {
          metric: "cls",
          value: rounded(cumulativeCls, 0, 1000, 4),
          unit: "score",
        });
      }
      lastLcp = null;
      lastInp = null;
      cumulativeCls = 0;
    };

    const routeTransition = (route, register) => {
      const timestamp = now();
      const key = route.start.eventName + "\u0000" + route.complete.eventName;
      const recent = recentRouteTransitions.get(key);
      const elapsed = recent ? timestamp - recent.startedAt : Infinity;
      if (register && recent && elapsed >= 0 && elapsed <= routeTransitionDedupeMs) {
        return { transition: recent, created: false };
      }
      const transition = {
        id: ++routeTransitionSequence,
        route,
        startedAt: timestamp,
        emittedPhases: new Set(),
      };
      if (register) recentRouteTransitions.set(key, transition);
      return { transition, created: true };
    };

    const emitRoutePhase = (transition, phase) => {
      if (!transition) return;
      const route = transition.route;
      const binding = phase === "start" ? route.start : route.complete;
      const key = binding.eventName + "\u0000" + phase;
      if (transition.emittedPhases.has(key)) return;
      transition.emittedPhases.add(key);
      emit(binding, phase === "start" ? "started" : "succeeded", { routePhase: phase });
    };

    const beginRoute = (candidate) => {
      const route = mappedRoute(candidate);
      if (route === null) return null;
      const resolved = routeTransition(route, true);
      if (resolved.created) {
        emitVitals();
        activityVersion += 1;
      }
      emitRoutePhase(resolved.transition, "start");
      return resolved.transition;
    };

    const completeRoute = (transition) => {
      emitRoutePhase(transition, "complete");
    };

    const installHistoryObservation = () => {
      const history = scope.history;
      if (!history) return () => {};
      const originalPush = history.pushState;
      const originalReplace = history.replaceState;
      let wrappedPush;
      let wrappedReplace;
      try {
        if (typeof originalPush === "function") {
          wrappedPush = function (...args) {
            const route = beginRoute(args[2]);
            const result = originalPush.apply(this, args);
            defer(() => completeRoute(route));
            return result;
          };
          history.pushState = wrappedPush;
        }
        if (typeof originalReplace === "function") {
          wrappedReplace = function (...args) {
            const route = beginRoute(args[2]);
            const result = originalReplace.apply(this, args);
            defer(() => completeRoute(route));
            return result;
          };
          history.replaceState = wrappedReplace;
        }
      } catch {}
      return () => {
        try {
          if (wrappedPush && history.pushState === wrappedPush) history.pushState = originalPush;
          if (wrappedReplace && history.replaceState === wrappedReplace) history.replaceState = originalReplace;
        } catch {}
      };
    };

    const installVitals = () => {
      try {
        const Observer = scope.PerformanceObserver;
        if (typeof Observer !== "function") return;
        const supported = Array.isArray(Observer.supportedEntryTypes)
          ? Observer.supportedEntryTypes
          : [];
        if (supported.includes("largest-contentful-paint")) {
          const lcpObserver = new Observer((entryList) => {
            try {
              for (const entry of entryList.getEntries()) {
                lastLcp = Math.max(lastLcp || 0, Number(entry.startTime) || 0);
              }
            } catch {}
          });
          lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
          observers.push(lcpObserver);
        }
        if (supported.includes("event")) {
          const inpObserver = new Observer((entryList) => {
            try {
              for (const entry of entryList.getEntries()) {
                if (Number(entry.interactionId) > 0) {
                  lastInp = Math.max(lastInp || 0, Number(entry.duration) || 0);
                }
              }
            } catch {}
          });
          inpObserver.observe({ type: "event", buffered: true, durationThreshold: 40 });
          observers.push(inpObserver);
        }
        if (supported.includes("layout-shift")) {
          clsSupported = true;
          const clsObserver = new Observer((entryList) => {
            try {
              for (const entry of entryList.getEntries()) {
                if (!entry.hadRecentInput) cumulativeCls += Number(entry.value) || 0;
              }
            } catch {}
          });
          clsObserver.observe({ type: "layout-shift", buffered: true });
          observers.push(clsObserver);
        }
      } catch {}
    };

    const finishSession = () => {
      if (ended) return;
      ended = true;
      emitVitals();
      emit(config.systemEvents.sessionEnd, "succeeded", { lifecycle: "pagehide" });
      void flush(true);
    };

    const restoreHistory = installHistoryObservation();
    listen(doc, "click", (event) => interaction("click", event), true);
    listen(doc, "change", (event) => interaction("change", event), true);
    listen(doc, "submit", (event) => interaction("submit", event), true);
    listen(scope, "popstate", () => {
      const route = beginRoute(undefined);
      defer(() => completeRoute(route));
    });
    listen(scope, "error", () => {
      activityVersion += 1;
      emit(config.systemEvents.runtimeError, "failed", {
        errorCategory: "script-runtime",
        sanitized: true,
      });
    });
    listen(scope, "unhandledrejection", () => {
      activityVersion += 1;
      emit(config.systemEvents.runtimeError, "failed", {
        errorCategory: "promise-rejection",
        sanitized: true,
      });
    });
    listen(scope, "pagehide", finishSession);
    listen(doc, "visibilitychange", () => {
      try {
        if (doc.visibilityState === "hidden") {
          emitVitals();
          void flush(false);
        }
      } catch {}
    });

    try {
      if (typeof scope.setInterval === "function") {
        intervalHandle = scope.setInterval(() => {
          void flush(false);
        }, config.limits.flushIntervalMs);
      }
    } catch {}

    defer(() => {
      installVitals();
      const initialRoute = mappedRoute(undefined);
      if (initialRoute !== null) {
        completeRoute(routeTransition(initialRoute, false).transition);
      }
    });

    return {
      flush: async () => {
        try {
          await flush(false);
        } catch {}
      },
      routeStart: (candidate) => {
        try {
          beginRoute(candidate);
        } catch {}
      },
      stop: async () => {
        if (stopped) return;
        try {
          emitVitals();
          await flush(false);
        } catch {}
        stopped = true;
        try {
          restoreHistory();
        } catch {}
        for (const item of listeners) {
          try {
            item[0].removeEventListener(item[1], item[2], item[3]);
          } catch {}
        }
        for (const handle of timeoutHandles) {
          try {
            scope.clearTimeout(handle);
          } catch {}
        }
        timeoutHandles.clear();
        if (intervalHandle !== undefined) {
          try {
            scope.clearInterval(intervalHandle);
          } catch {}
        }
        for (const observer of observers) {
          try {
            observer.disconnect();
          } catch {}
        }
        for (const check of pendingDeadChecks) {
          try {
            if (check.observer) check.observer.disconnect();
          } catch {}
        }
        pendingDeadChecks.clear();
      },
      snapshot: () => Object.freeze({ queued: queue.length, dropped, sessionId }),
    };
  } catch {
    return emptyController;
  }
};
`;
