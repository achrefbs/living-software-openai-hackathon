import { createHash } from "node:crypto";
import { metricCatalogSchema, parseDiscoveryResult, parseLivingConfig, parseObservationRuntimeMap, parseProductManifest, } from "@living-software/contracts";
import { generateNextObserverFiles, OBSERVATION_METADATA_KEYS, } from "@living-software/observer";
import { AutomaticBundleError, } from "./types.js";
const DEFAULT_LIMITS = Object.freeze({
    maxBatchSize: 10,
    maxQueueSize: 500,
    maxEventBytes: 8_192,
    maxPayloadBytes: 128_000,
    maxEventsPerMinute: 600,
    flushIntervalMs: 1_000,
    requestTimeoutMs: 5_000,
});
const DEFAULT_SIGNALS = Object.freeze({
    deadClickDelayMs: 1_000,
    rageClickWindowMs: 1_500,
    rageClickCount: 3,
    correctionWindowMs: 5_000,
});
function hashSegment(value) {
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
function stableEventName(category, identity, phase) {
    return `observed.${category}.${hashSegment(identity)}.${phase}`;
}
function stableMetricId(identity) {
    return `metric:observed:${hashSegment(identity)}`;
}
function json(content) {
    return `${JSON.stringify(content, null, 2)}\n`;
}
function strictObject(properties, required) {
    for (const key of Object.keys(properties)) {
        if (!OBSERVATION_METADATA_KEYS.includes(key)) {
            throw new AutomaticBundleError("metadata-key-not-allowlisted", `Generated observation metadata key is not allowlisted: ${key}`);
        }
    }
    return {
        type: "object",
        additionalProperties: false,
        properties,
        required: [...required],
    };
}
const TARGET_GEOMETRY_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number", minimum: 0 },
        height: { type: "number", minimum: 0 },
    },
    required: ["x", "y", "width", "height"],
};
const VIEWPORT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        width: { type: "number", minimum: 0 },
        height: { type: "number", minimum: 0 },
        scrollX: { type: "number" },
        scrollY: { type: "number" },
        pixelRatio: { type: "number", minimum: 0.25, maximum: 8 },
    },
    required: ["width", "height", "scrollX", "scrollY", "pixelRatio"],
};
const VISIBILITY_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        ratio: { type: "number", minimum: 0, maximum: 1 },
        inViewport: { type: "boolean" },
    },
    required: ["ratio", "inViewport"],
};
const POSITION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        layout: { type: "string", enum: ["flow", "fixed", "sticky"] },
        documentX: { type: "number" },
        documentY: { type: "number" },
    },
    required: ["layout", "documentX", "documentY"],
};
const STATE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: { disabled: { type: "boolean" } },
    required: ["disabled"],
};
function geometryProperties() {
    return {
        targetGeometry: TARGET_GEOMETRY_SCHEMA,
        viewport: VIEWPORT_SCHEMA,
        visibility: VISIBILITY_SCHEMA,
        position: POSITION_SCHEMA,
        state: STATE_SCHEMA,
    };
}
function eventDefinition(kind, profile) {
    switch (profile) {
        case "interaction":
            return {
                kind,
                metadataSchema: strictObject({
                    interaction: {
                        type: "string",
                        enum: ["click", "change", "submit"],
                    },
                    ...geometryProperties(),
                }, ["interaction", "targetGeometry", "viewport", "visibility", "position", "state"]),
            };
        case "signal":
            return {
                kind,
                metadataSchema: strictObject({
                    signal: {
                        type: "string",
                        enum: ["dead-click", "rage-click", "correction"],
                    },
                    ...geometryProperties(),
                }, ["signal", "targetGeometry", "viewport", "visibility", "position", "state"]),
            };
        case "route-start":
            return {
                kind,
                metadataSchema: strictObject({ routePhase: { type: "string", const: "start" } }, ["routePhase"]),
            };
        case "route-complete":
            return {
                kind,
                metadataSchema: strictObject({ routePhase: { type: "string", const: "complete" } }, ["routePhase"]),
            };
        case "session-end":
            return {
                kind,
                metadataSchema: strictObject({ lifecycle: { type: "string", const: "pagehide" } }, ["lifecycle"]),
            };
        case "runtime-error":
            return {
                kind,
                metadataSchema: strictObject({
                    errorCategory: {
                        type: "string",
                        enum: ["script-runtime", "promise-rejection"],
                    },
                    sanitized: { type: "boolean", const: true },
                }, ["errorCategory", "sanitized"]),
            };
        case "lcp":
        case "inp":
        case "cls":
            return {
                kind,
                metadataSchema: strictObject({
                    metric: { type: "string", const: profile },
                    value: { type: "number" },
                    unit: {
                        type: "string",
                        const: profile === "cls" ? "score" : "millisecond",
                    },
                }, ["metric", "value", "unit"]),
            };
    }
}
function ownerSurfaceId(manifest, nodeId, diagnostics, token) {
    const nodeKinds = new Map(manifest.nodes.map((node) => [node.id, node.kind]));
    const reverse = new Map();
    for (const edge of manifest.edges) {
        if (edge.relation !== "renders" && edge.relation !== "exposes")
            continue;
        const owners = reverse.get(edge.to) ?? [];
        owners.push(edge.from);
        reverse.set(edge.to, owners);
    }
    for (const owners of reverse.values())
        owners.sort();
    const queue = [{ id: nodeId, distance: 0 }];
    const seen = new Set([nodeId]);
    const routes = new Map();
    const surfaces = new Map();
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined)
            break;
        for (const owner of reverse.get(current.id) ?? []) {
            if (seen.has(owner))
                continue;
            seen.add(owner);
            const distance = current.distance + 1;
            const kind = nodeKinds.get(owner);
            if (kind === "route")
                routes.set(owner, distance);
            if (kind === "surface")
                surfaces.set(owner, distance);
            queue.push({ id: owner, distance });
        }
    }
    if (routes.size === 1)
        return [...routes.keys()][0];
    if (routes.size > 1) {
        diagnostics.push({
            severity: "warning",
            code: "ambiguous-route-owner",
            message: "Observation scope was omitted because multiple routes can render this target",
            nodeId,
            token,
        });
        return undefined;
    }
    if (surfaces.size > 0) {
        const minimumDistance = Math.min(...surfaces.values());
        const nearest = [...surfaces.entries()]
            .filter(([, distance]) => distance === minimumDistance)
            .map(([id]) => id)
            .sort();
        if (nearest.length === 1)
            return nearest[0];
        diagnostics.push({
            severity: "warning",
            code: "ambiguous-surface-owner",
            message: "Observation scope was omitted because the nearest product surface is ambiguous",
            nodeId,
            token,
        });
    }
    return undefined;
}
function routePattern(locator) {
    const source = locator.match.kind === "route-template" || locator.match.kind === "exact"
        ? locator.match.value
        : undefined;
    if (source === undefined || !source.startsWith("/"))
        return undefined;
    return source.replace(/\*[^/]+/gu, "*");
}
function targetLocator(locator, diagnostics) {
    if (locator.strategy === "data-living-id") {
        if (locator.match.kind !== "exact" || locator.dynamic) {
            diagnostics.push({
                severity: "warning",
                code: "unsupported-locator-match",
                message: `Living-id locator match '${locator.match.kind}' was skipped`,
                nodeId: locator.nodeId,
                token: locator.token,
            });
            return undefined;
        }
        if (!/^[A-Za-z0-9][A-Za-z0-9._:/_-]*$/u.test(locator.match.value)) {
            diagnostics.push({
                severity: "warning",
                code: "unsafe-locator-value",
                message: "Living-id locator was skipped because its static value is outside the safe grammar",
                nodeId: locator.nodeId,
                token: locator.token,
            });
            return undefined;
        }
        return { strategy: "living-id", value: locator.match.value };
    }
    if (locator.strategy !== "data-testid")
        return undefined;
    if (locator.match.kind !== "exact" &&
        locator.match.kind !== "prefix" &&
        locator.match.kind !== "suffix") {
        diagnostics.push({
            severity: "warning",
            code: "unsupported-locator-match",
            message: `Test-id locator match '${locator.match.kind}' was skipped`,
            nodeId: locator.nodeId,
            token: locator.token,
        });
        return undefined;
    }
    const value = locator.match.value.trim().toLowerCase();
    if (value.length > 128 || !/^[a-z0-9._:/-]+$/u.test(value)) {
        diagnostics.push({
            severity: "warning",
            code: "unsafe-locator-value",
            message: "Test-id locator was skipped because its normalized fragment is outside the safe grammar",
            nodeId: locator.nodeId,
            token: locator.token,
        });
        return undefined;
    }
    return { strategy: "test-id", match: locator.match.kind, value };
}
function artifact(path, content) {
    return Object.freeze({ path, content });
}
function canonicalDiagnostics(diagnostics) {
    const unique = new Map();
    for (const diagnostic of diagnostics) {
        const key = JSON.stringify([
            diagnostic.code,
            diagnostic.nodeId ?? "",
            diagnostic.token ?? "",
        ]);
        if (!unique.has(key)) {
            unique.set(key, diagnostic);
        }
    }
    return Object.freeze([...unique.values()]
        .sort((left, right) => left.code.localeCompare(right.code) ||
        (left.nodeId ?? "").localeCompare(right.nodeId ?? "") ||
        (left.token ?? "").localeCompare(right.token ?? "") ||
        left.severity.localeCompare(right.severity) ||
        left.message.localeCompare(right.message))
        .map((diagnostic) => Object.freeze({ ...diagnostic })));
}
function addDerivedMetric(metrics, binding, kind, fields, trigger) {
    metrics.push({
        id: stableMetricId(`${binding.eventName}\0${binding.nodeId}`),
        eventName: binding.eventName,
        kind,
        targetNodeId: binding.nodeId,
        trigger,
        fields: [...fields],
        provenance: "inferred",
    });
}
function isGenericCatchAllFamily(value) {
    return (typeof value === "string" &&
        value.trim().replaceAll("{*}", "*") === "*");
}
export function buildAutomaticInstallBundle(discoveryInput, options) {
    if (typeof options !== "object" || options === null) {
        throw new AutomaticBundleError("options-required", "Automatic install options are required");
    }
    if (typeof options.synthetic !== "boolean") {
        throw new AutomaticBundleError("synthetic-mode-required", "Automatic installation requires an explicit synthetic boolean");
    }
    const discovery = parseDiscoveryResult(discoveryInput);
    parseProductManifest(discoveryInput.manifest);
    const manifest = discoveryInput.manifest;
    const actionNodeIds = new Set(manifest.nodes
        .filter((node) => node.kind === "action")
        .map((node) => node.id));
    const genericActionNode = manifest.nodes.find((node) => node.kind === "action" &&
        isGenericCatchAllFamily(node.attributes?.["locatorValue"] ?? node.displayName));
    const genericActionLocator = discovery.runtimeLocatorMap.locators.find((locator) => actionNodeIds.has(locator.nodeId) &&
        isGenericCatchAllFamily(locator.normalizedValue));
    if (genericActionNode !== undefined || genericActionLocator !== undefined) {
        throw new AutomaticBundleError("generic-action-family", "Automatic installation refused a generic wildcard action without a stable locator prefix or suffix");
    }
    const diagnostics = [];
    const registeredBindings = [];
    const semanticDefinitions = new Map();
    const metricEventNames = new Map();
    function register(binding, profile) {
        const definition = eventDefinition(binding.kind, profile);
        const existing = semanticDefinitions.get(binding.eventName);
        if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(definition)) {
            throw new AutomaticBundleError("event-name-collision", `Generated event name collision: ${binding.eventName}`);
        }
        semanticDefinitions.set(binding.eventName, definition);
        registeredBindings.push({ binding, profile });
        return binding;
    }
    const targets = [];
    const locatorSignatures = new Set();
    const targetTokens = new Set();
    const targetLocators = [...discovery.runtimeLocatorMap.locators]
        .filter((locator) => locator.strategy !== "route")
        .sort((left, right) => `${left.token}\0${left.nodeId}`.localeCompare(`${right.token}\0${right.nodeId}`));
    for (const locator of targetLocators) {
        const normalizedLocator = targetLocator(locator, diagnostics);
        if (normalizedLocator === undefined)
            continue;
        const signature = JSON.stringify(normalizedLocator);
        if (locatorSignatures.has(signature)) {
            diagnostics.push({
                severity: "warning",
                code: "duplicate-runtime-locator",
                message: "Duplicate runtime locator was skipped to prevent ambiguous event ownership",
                nodeId: locator.nodeId,
                token: locator.token,
            });
            continue;
        }
        if (targetTokens.has(locator.token)) {
            diagnostics.push({
                severity: "warning",
                code: "duplicate-target-token",
                message: "Duplicate observation target token was skipped",
                nodeId: locator.nodeId,
                token: locator.token,
            });
            continue;
        }
        const captures = new Set(locator.captures);
        if (!captures.has("activate") &&
            !captures.has("change") &&
            !captures.has("submit")) {
            diagnostics.push({
                severity: "info",
                code: "noninteractive-locator-skipped",
                message: "Static locator has no delegated interaction supported by the browser observer",
                nodeId: locator.nodeId,
                token: locator.token,
            });
            continue;
        }
        const identity = `${locator.token}\0${locator.nodeId}`;
        const surfaceId = ownerSurfaceId(manifest, locator.nodeId, diagnostics, locator.token);
        const base = {
            nodeId: locator.nodeId,
            ...(surfaceId === undefined ? {} : { surfaceId }),
        };
        const events = {};
        if (captures.has("activate")) {
            events.click = register({
                eventName: stableEventName("action", identity, "click"),
                kind: "action",
                ...base,
            }, "interaction");
            events.deadClick = register({
                eventName: stableEventName("signal", identity, "dead-click"),
                kind: "outcome",
                ...base,
            }, "signal");
            events.rageClick = register({
                eventName: stableEventName("signal", identity, "rage-click"),
                kind: "outcome",
                ...base,
            }, "signal");
            metricEventNames.set(`${locator.nodeId}\0action.activate`, events.click.eventName);
            metricEventNames.set(`${locator.nodeId}\0layout.geometry`, events.click.eventName);
        }
        if (captures.has("change")) {
            events.change = register({
                eventName: stableEventName("action", identity, "change"),
                kind: "action",
                ...base,
            }, "interaction");
            events.correction = register({
                eventName: stableEventName("signal", identity, "correction"),
                kind: "outcome",
                ...base,
            }, "signal");
            metricEventNames.set(`${locator.nodeId}\0action.change`, events.change.eventName);
            if (!metricEventNames.has(`${locator.nodeId}\0layout.geometry`)) {
                metricEventNames.set(`${locator.nodeId}\0layout.geometry`, events.change.eventName);
            }
        }
        if (captures.has("submit")) {
            events.submit = register({
                eventName: stableEventName("action", identity, "submit"),
                kind: "action",
                ...base,
            }, "interaction");
            metricEventNames.set(`${locator.nodeId}\0action.submit`, events.submit.eventName);
            if (!metricEventNames.has(`${locator.nodeId}\0layout.geometry`)) {
                metricEventNames.set(`${locator.nodeId}\0layout.geometry`, events.submit.eventName);
            }
        }
        locatorSignatures.add(signature);
        targetTokens.add(locator.token);
        targets.push({ token: locator.token, locators: [normalizedLocator], events });
    }
    const routes = [];
    const routePatterns = new Set();
    const routeLocators = [...discovery.runtimeLocatorMap.locators]
        .filter((locator) => locator.strategy === "route")
        .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
    for (const locator of routeLocators) {
        const pattern = routePattern(locator);
        if (pattern === undefined) {
            diagnostics.push({
                severity: "warning",
                code: "unsupported-route-pattern",
                message: "Route locator was skipped because its normalized pattern is unsupported",
                nodeId: locator.nodeId,
                token: locator.token,
            });
            continue;
        }
        if (routePatterns.has(pattern)) {
            diagnostics.push({
                severity: "warning",
                code: "duplicate-route-pattern",
                message: "Duplicate route pattern was skipped",
                nodeId: locator.nodeId,
                token: locator.token,
            });
            continue;
        }
        const identity = `${locator.token}\0${locator.nodeId}`;
        const start = register({
            eventName: stableEventName("route", identity, "start"),
            kind: "navigation",
            nodeId: locator.nodeId,
            surfaceId: locator.nodeId,
        }, "route-start");
        const complete = register({
            eventName: stableEventName("route", identity, "complete"),
            kind: "navigation",
            nodeId: locator.nodeId,
            surfaceId: locator.nodeId,
        }, "route-complete");
        metricEventNames.set(`${locator.nodeId}\0navigation.view`, complete.eventName);
        routePatterns.add(pattern);
        routes.push({ pattern, start, complete });
    }
    const systemAnchor = [...manifest.nodes]
        .filter((node) => node.kind === "integration" || node.kind === "route")
        .sort((left, right) => {
        const kindOrder = Number(left.kind !== "integration") - Number(right.kind !== "integration");
        return kindOrder === 0 ? left.id.localeCompare(right.id) : kindOrder;
    })[0];
    if (systemAnchor === undefined) {
        throw new AutomaticBundleError("system-anchor-missing", "Automatic observation requires a manifest integration or route node for system events");
    }
    diagnostics.push({
        severity: "info",
        code: "system-event-anchor",
        message: `System events are explicitly anchored to the first stable ${systemAnchor.kind} node`,
        nodeId: systemAnchor.id,
    });
    const systemIdentity = `system\0${systemAnchor.id}`;
    const systemEvents = {
        sessionEnd: register({
            eventName: stableEventName("system", systemIdentity, "session-end"),
            kind: "system",
            nodeId: systemAnchor.id,
        }, "session-end"),
        runtimeError: register({
            eventName: stableEventName("system", systemIdentity, "runtime-error"),
            kind: "error",
            nodeId: systemAnchor.id,
        }, "runtime-error"),
        lcp: register({
            eventName: stableEventName("system", systemIdentity, "lcp"),
            kind: "system",
            nodeId: systemAnchor.id,
        }, "lcp"),
        inp: register({
            eventName: stableEventName("system", systemIdentity, "inp"),
            kind: "system",
            nodeId: systemAnchor.id,
        }, "inp"),
        cls: register({
            eventName: stableEventName("system", systemIdentity, "cls"),
            kind: "system",
            nodeId: systemAnchor.id,
        }, "cls"),
    };
    const runtimeCandidate = {
        schemaVersion: "living.observation-runtime/v1",
        application: {
            appId: manifest.appId,
            environment: options.environment ?? "development",
            releaseRevision: manifest.release.revision,
            manifestHash: manifest.contentHash,
            synthetic: options.synthetic,
        },
        collector: { endpoint: "/api/living/events" },
        targets: targets.sort((left, right) => left.token.localeCompare(right.token)),
        routes: [...routes].sort((left, right) => left.pattern.localeCompare(right.pattern)),
        systemEvents,
        signals: { ...DEFAULT_SIGNALS, ...options.signals },
        limits: { ...DEFAULT_LIMITS, ...options.limits },
    };
    const generatedObserver = generateNextObserverFiles(runtimeCandidate);
    const observationRuntimeMap = parseObservationRuntimeMap(generatedObserver.runtimeMap);
    const adapters = [
        ...discovery.config.adapters.filter((adapter) => adapter.id !== "next-browser-observer"),
        {
            id: "next-browser-observer",
            version: "0.1.0",
            options: {
                runtimeMapPath: ".living/observation-runtime.json",
                synthetic: options.synthetic,
            },
        },
    ].sort((left, right) => `${left.id}\0${left.version}`.localeCompare(`${right.id}\0${right.version}`));
    const generatedSemantics = Object.fromEntries([...semanticDefinitions.entries()].sort(([left], [right]) => left.localeCompare(right)));
    const config = parseLivingConfig({
        ...discovery.config,
        adapters,
        collector: {
            ...discovery.config.collector,
            endpoint: "/api/living/events",
        },
        semantics: {
            events: {
                ...discovery.config.semantics.events,
                ...generatedSemantics,
            },
        },
    });
    const observationPlannedEvents = new Set([
        "action.activate",
        "action.change",
        "action.submit",
        "layout.geometry",
        "navigation.view",
    ]);
    const normalizedMetrics = [];
    for (const metric of discovery.metricCatalog.metrics) {
        const remappedEventName = metricEventNames.get(`${metric.targetNodeId}\0${metric.eventName}`);
        if (remappedEventName !== undefined) {
            normalizedMetrics.push({
                ...metric,
                eventName: remappedEventName,
                fields: remappedEventName.startsWith("observed.route.")
                    ? ["routePhase"]
                    : [
                        "interaction",
                        "targetGeometry",
                        "viewport",
                        "visibility",
                        "position",
                        "state",
                    ],
            });
            continue;
        }
        if (observationPlannedEvents.has(metric.eventName) ||
            metric.fields.includes("locatorId")) {
            diagnostics.push({
                severity: "info",
                code: "unobserved-metric-omitted",
                message: "Planned metric was omitted because no supported runtime observation binding was generated",
                nodeId: metric.targetNodeId,
            });
            continue;
        }
        normalizedMetrics.push(metric);
    }
    normalizedMetrics.sort((left, right) => left.id.localeCompare(right.id));
    for (const { binding, profile } of registeredBindings) {
        if (profile === "signal") {
            addDerivedMetric(normalizedMetrics, binding, "outcome", ["signal", "targetGeometry", "viewport", "visibility", "position"], "Generated friction signal emitted by the browser observer");
        }
        else if (profile === "route-start") {
            addDerivedMetric(normalizedMetrics, binding, "workflow", ["routePhase"], "Observed route transition started");
        }
    }
    addDerivedMetric(normalizedMetrics, systemEvents.runtimeError, "reliability", ["errorCategory"], "Sanitized browser runtime error");
    addDerivedMetric(normalizedMetrics, systemEvents.lcp, "layout", ["metric", "value", "unit"], "Largest Contentful Paint session value");
    addDerivedMetric(normalizedMetrics, systemEvents.inp, "reliability", ["metric", "value", "unit"], "Interaction to Next Paint session value");
    addDerivedMetric(normalizedMetrics, systemEvents.cls, "layout", ["metric", "value", "unit"], "Cumulative Layout Shift session value");
    const metricCatalog = metricCatalogSchema.parse({
        schemaVersion: "living.metric-catalog/v1",
        metrics: normalizedMetrics
            .filter((metric, index, all) => all.findIndex((candidate) => candidate.id === metric.id) === index)
            .sort((left, right) => left.id.localeCompare(right.id)),
    });
    const artifacts = Object.freeze([
        artifact(".living/config.json", json(config)),
        artifact(".living/product-manifest.json", json(manifest)),
        artifact(".living/observation-runtime.json", json(observationRuntimeMap)),
        artifact(".living/metric-catalog.json", json(metricCatalog)),
        artifact(".living/.gitignore", "# Local observation evidence is intentionally not committed.\ndata/\n*.tmp\n"),
        artifact(generatedObserver.instrumentationClient.relativePath, generatedObserver.instrumentationClient.content),
        artifact(generatedObserver.browserModule.relativePath, generatedObserver.browserModule.content),
    ]);
    const rawSelectors = discovery.runtimeLocatorMap.locators
        .filter((locator) => locator.strategy !== "route" && locator.selector.startsWith("["))
        .map((locator) => locator.selector);
    for (const rawSelector of rawSelectors) {
        if (artifacts.some((candidate) => candidate.content.includes(rawSelector))) {
            throw new AutomaticBundleError("raw-selector-leak", "Automatic artifact generation refused to serialize a raw discovery selector");
        }
    }
    return Object.freeze({
        schemaVersion: "living.automatic-install-bundle/v1",
        config,
        manifest,
        observationRuntimeMap,
        metricCatalog,
        artifacts,
        diagnostics: canonicalDiagnostics(diagnostics),
    });
}
//# sourceMappingURL=bundle.js.map