import { findBacktrackingRevisitIndexes, projectWorkflowJourneySteps, } from "@living-software/core";
/** A target is small when either rendered CSS dimension is below 44px. */
export const SMALL_TARGET_THRESHOLD_CSS_PIXELS = 44;
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function average(values) {
    return values.reduce((total, value) => total + value, 0) / values.length;
}
function viewportClass(event) {
    const viewport = event.metadata.viewport;
    if (!isRecord(viewport) || typeof viewport.width !== "number")
        return undefined;
    if (viewport.width < 640)
        return "small";
    return viewport.width < 1024 ? "medium" : "large";
}
function productNodeId(event) {
    return event.product?.nodeId;
}
function ownerRouteNodeId(event) {
    return event.product?.surfaceId;
}
function isInteraction(event) {
    return (event.metadata.interaction === "click" ||
        event.metadata.interaction === "change" ||
        event.metadata.interaction === "submit");
}
function caseHasBacktracking(workflowCase) {
    return (findBacktrackingRevisitIndexes(projectWorkflowJourneySteps(workflowCase.events)).length > 0);
}
function scopeFields(scope) {
    return {
        ...(scope.productNodeId === undefined
            ? {}
            : { productNodeId: scope.productNodeId }),
        ...(scope.routeNodeId === undefined
            ? {}
            : { routeNodeId: scope.routeNodeId }),
        ...(scope.viewportClass === undefined
            ? {}
            : { viewportClass: scope.viewportClass }),
    };
}
function scopeKey(scope) {
    return `${scope.productNodeId ?? ""}|${scope.routeNodeId ?? ""}|${scope.viewportClass ?? ""}`;
}
function metricKey(metric) {
    return `${metric.id}|${metric.productNodeId ?? ""}|${metric.routeNodeId ?? ""}|${metric.viewportClass ?? ""}`;
}
function numberGroup(groups, scope) {
    const key = scopeKey(scope);
    const existing = groups.get(key);
    if (existing !== undefined)
        return existing;
    const created = { ...scopeFields(scope), values: [] };
    groups.set(key, created);
    return created;
}
function countGroup(groups, scope) {
    const key = scopeKey(scope);
    const existing = groups.get(key);
    if (existing !== undefined)
        return existing;
    const created = { ...scopeFields(scope), count: 0 };
    groups.set(key, created);
    return created;
}
function pushAverage(output, id, unit, group) {
    if (group.values.length === 0)
        return;
    output.push({
        id,
        unit,
        value: average(group.values),
        samples: group.values.length,
        ...scopeFields(group),
    });
}
function ordered(events) {
    return [...events].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
        left.sequence - right.sequence ||
        left.eventId.localeCompare(right.eventId));
}
function hasRepeatedSubmit(workflowCase) {
    const submitsByControl = new Map();
    for (const event of workflowCase.events) {
        if (event.metadata.interaction !== "submit")
            continue;
        const control = productNodeId(event);
        if (control === undefined)
            continue;
        const count = (submitsByControl.get(control) ?? 0) + 1;
        if (count >= 2)
            return true;
        submitsByControl.set(control, count);
    }
    return false;
}
function baseMetrics(events, cases, variants) {
    const output = [
        { id: "workflow.event-count", unit: "count", value: events.length, samples: events.length },
        {
            id: "workflow.session-count",
            unit: "count",
            value: new Set(events.map((event) => event.sessionId)).size,
            samples: events.length,
        },
        { id: "workflow.case-count", unit: "count", value: cases.length, samples: cases.length },
        { id: "workflow.variant-count", unit: "count", value: variants.length, samples: cases.length },
        {
            id: "workflow.error-ratio",
            unit: "ratio",
            value: events.filter((event) => event.status === "failed").length / events.length,
            samples: events.length,
        },
        {
            id: "workflow.backtracking-ratio",
            unit: "ratio",
            value: cases.filter(caseHasBacktracking).length / cases.length,
            samples: cases.length,
        },
        {
            id: "workflow.case-duration-average",
            unit: "milliseconds",
            value: average(cases.map((entry) => entry.durationMs)),
            samples: cases.length,
        },
    ];
    const knownOutcomeCases = cases.filter((entry) => entry.outcome !== "unknown");
    if (knownOutcomeCases.length > 0) {
        output.push({
            id: "workflow.abandonment-ratio",
            unit: "ratio",
            value: knownOutcomeCases.filter((entry) => entry.outcome === "abandoned")
                .length / knownOutcomeCases.length,
            samples: knownOutcomeCases.length,
        });
    }
    const interactions = events.filter(isInteraction);
    if (interactions.length > 0) {
        output.push({
            id: "workflow.actions-per-case-average",
            unit: "count",
            value: average(cases.map((entry) => entry.events.filter(isInteraction).length)),
            samples: cases.length,
        });
    }
    const durations = events
        .map((event) => event.durationMs)
        .filter((value) => value !== undefined);
    if (durations.length > 0) {
        output.push({
            id: "performance.duration-average",
            unit: "milliseconds",
            value: average(durations),
            samples: durations.length,
        });
    }
    if (interactions.some((event) => event.metadata.interaction === "submit")) {
        output.push({
            id: "workflow.repeated-submit-case-ratio",
            unit: "ratio",
            value: cases.filter(hasRepeatedSubmit).length / cases.length,
            samples: cases.length,
        });
    }
    for (const signal of ["dead-click", "rage-click", "correction"]) {
        const matching = events.filter((event) => event.metadata.signal === signal);
        if (matching.length === 0)
            continue;
        output.push({
            id: `friction.${signal}-count`,
            unit: "count",
            value: matching.length,
            samples: matching.length,
        }, {
            id: `friction.${signal}-case-ratio`,
            unit: "ratio",
            value: cases.filter((entry) => entry.events.some((event) => event.metadata.signal === signal)).length / cases.length,
            samples: cases.length,
        });
    }
    const errors = events.filter((event) => event.metadata.sanitized === true &&
        (event.metadata.errorCategory === "script-runtime" ||
            event.metadata.errorCategory === "promise-rejection"));
    if (errors.length > 0) {
        output.push({
            id: "reliability.runtime-error-count",
            unit: "count",
            value: errors.length,
            samples: errors.length,
        });
    }
    return output;
}
function geometryPoint(event) {
    const target = event.metadata.targetGeometry;
    const position = event.metadata.position;
    const viewport = event.metadata.viewport;
    if (!isRecord(target) || !isRecord(position) || !isRecord(viewport)) {
        return undefined;
    }
    const width = finite(target.width);
    const height = finite(target.height);
    const documentX = finite(position.documentX);
    const documentY = finite(position.documentY);
    const scrollY = finite(viewport.scrollY);
    if (width === undefined ||
        height === undefined ||
        documentX === undefined ||
        documentY === undefined ||
        scrollY === undefined) {
        return undefined;
    }
    return {
        centerX: documentX + width / 2,
        centerY: documentY + height / 2,
        scrollY,
        occurredAt: event.occurredAt,
        sequence: event.sequence,
    };
}
function scopedMetrics(events) {
    const output = [];
    const controlFrequency = new Map();
    const routeFrequency = new Map();
    const visibility = new Map();
    const targetArea = new Map();
    const smallTarget = new Map();
    const movement = new Map();
    for (const event of events) {
        if (event.metadata.routePhase === "complete") {
            const route = productNodeId(event);
            if (route !== undefined)
                countGroup(routeFrequency, { routeNodeId: route }).count += 1;
        }
        if (!isInteraction(event))
            continue;
        const product = productNodeId(event);
        const route = ownerRouteNodeId(event);
        const responsiveClass = viewportClass(event);
        if (product !== undefined && route !== undefined && responsiveClass !== undefined) {
            const scope = {
                productNodeId: product,
                routeNodeId: route,
                viewportClass: responsiveClass,
            };
            countGroup(controlFrequency, scope).count += 1;
            const visibilityMetadata = event.metadata.visibility;
            if (isRecord(visibilityMetadata)) {
                const ratio = finite(visibilityMetadata.ratio);
                if (ratio !== undefined)
                    numberGroup(visibility, scope).values.push(ratio);
            }
            const target = event.metadata.targetGeometry;
            const viewport = event.metadata.viewport;
            if (isRecord(target)) {
                const width = finite(target.width);
                const height = finite(target.height);
                if (width !== undefined && height !== undefined) {
                    numberGroup(smallTarget, scope).values.push(width < SMALL_TARGET_THRESHOLD_CSS_PIXELS ||
                        height < SMALL_TARGET_THRESHOLD_CSS_PIXELS
                        ? 1
                        : 0);
                    if (isRecord(viewport)) {
                        const viewportWidth = finite(viewport.width);
                        const viewportHeight = finite(viewport.height);
                        if (viewportWidth !== undefined &&
                            viewportHeight !== undefined &&
                            viewportWidth > 0 &&
                            viewportHeight > 0) {
                            numberGroup(targetArea, scope).values.push(Math.min(1, Math.max(0, (width * height) / (viewportWidth * viewportHeight))));
                        }
                    }
                }
            }
        }
        if (route !== undefined && responsiveClass !== undefined) {
            const point = geometryPoint(event);
            if (point !== undefined) {
                const key = `${event.sessionId}|${route}|${responsiveClass}`;
                const sequence = movement.get(key) ?? {
                    scope: { routeNodeId: route, viewportClass: responsiveClass },
                    points: [],
                };
                sequence.points.push(point);
                movement.set(key, sequence);
            }
        }
    }
    for (const group of routeFrequency.values()) {
        output.push({
            id: "navigation.route-complete-frequency",
            unit: "count",
            value: group.count,
            samples: group.count,
            ...scopeFields(group),
        });
    }
    for (const group of controlFrequency.values()) {
        output.push({
            id: "interaction.control-frequency",
            unit: "count",
            value: group.count,
            samples: group.count,
            ...scopeFields(group),
        });
    }
    for (const group of visibility.values()) {
        pushAverage(output, "layout.visibility-average", "ratio", group);
    }
    for (const group of targetArea.values()) {
        pushAverage(output, "layout.target-area-ratio-average", "ratio", group);
    }
    for (const group of smallTarget.values()) {
        pushAverage(output, "layout.small-target-ratio", "ratio", group);
    }
    const scrollBurden = new Map();
    const targetDistance = new Map();
    for (const sequence of movement.values()) {
        sequence.points.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
            left.sequence - right.sequence);
        for (let index = 1; index < sequence.points.length; index += 1) {
            const previous = sequence.points[index - 1];
            const current = sequence.points[index];
            if (previous === undefined || current === undefined)
                continue;
            // Scroll burden = absolute scrollY delta in CSS pixels between consecutive
            // controls within one session + owner route + viewport class.
            numberGroup(scrollBurden, sequence.scope).values.push(Math.abs(current.scrollY - previous.scrollY));
            // Target distance = Euclidean center-to-center document-space distance.
            numberGroup(targetDistance, sequence.scope).values.push(Math.hypot(current.centerX - previous.centerX, current.centerY - previous.centerY));
        }
    }
    for (const group of scrollBurden.values()) {
        pushAverage(output, "layout.scroll-burden-average", "pixels", group);
    }
    for (const group of targetDistance.values()) {
        pushAverage(output, "layout.target-distance-average", "pixels", group);
    }
    return output;
}
function routeTransitions(events) {
    const pendingStarts = new Map();
    const durations = new Map();
    for (const event of ordered(events)) {
        const phase = event.metadata.routePhase;
        if (phase !== "start" && phase !== "complete")
            continue;
        const route = productNodeId(event);
        const timestamp = Date.parse(event.occurredAt);
        if (route === undefined || !Number.isFinite(timestamp))
            continue;
        const key = `${event.sessionId}|${route}`;
        if (phase === "start") {
            pendingStarts.set(key, [...(pendingStarts.get(key) ?? []), timestamp]);
            continue;
        }
        const startedAt = pendingStarts.get(key)?.shift();
        if (startedAt === undefined)
            continue;
        numberGroup(durations, { routeNodeId: route }).values.push(Math.max(0, timestamp - startedAt));
    }
    const output = [];
    for (const group of durations.values()) {
        pushAverage(output, "performance.route-transition-average", "milliseconds", group);
    }
    return output;
}
function vitals(events) {
    const groups = new Map();
    for (const event of events) {
        const metric = event.metadata.metric;
        const value = finite(event.metadata.value);
        if (value !== undefined &&
            (metric === "lcp" || metric === "inp" || metric === "cls")) {
            groups.set(metric, [...(groups.get(metric) ?? []), value]);
        }
    }
    return [...groups.entries()].map(([metric, samples]) => ({
        id: `performance.${metric}-average`,
        unit: metric === "cls" ? "ratio" : "milliseconds",
        value: average(samples),
        samples: samples.length,
    }));
}
export function buildMetricValues(events, cases, variants) {
    return [
        ...baseMetrics(events, cases, variants),
        ...scopedMetrics(events),
        ...routeTransitions(events),
        ...vitals(events),
    ].sort((left, right) => metricKey(left).localeCompare(metricKey(right)));
}
