const NODE_LIMIT = 120;
const EDGE_LIMIT = 240;
const OPERATION_LIMIT = 64;
const EXTENSION_POINT_LIMIT = 64;
const EVENT_LIMIT = 256;
const BYTE_LIMIT = 256_000;
function byKey(key) {
    return (left, right) => key(left).localeCompare(key(right), "en");
}
function eventOrder(left, right) {
    return Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
        left.sequence - right.sequence || left.eventId.localeCompare(right.eventId, "en");
}
export function buildEvidenceAliasEntries(events) {
    return [...events].sort(eventOrder).map((event, index) => ({
        alias: `evidence-${String(index + 1).padStart(3, "0")}`,
        eventId: event.eventId,
    }));
}
function evidenceScope(origin) {
    return {
        origin,
        claimScope: origin === "synthetic"
            ? "synthetic-only"
            : origin === "mixed"
                ? "mixed-evidence-only"
                : "observed-window-only",
        productionGeneralizationAllowed: false,
    };
}
function normalizedEvents(events, sampleIds) {
    const ordered = [...events].sort(eventOrder);
    const aliasById = new Map(buildEvidenceAliasEntries(events).map((entry) => [entry.eventId, entry.alias]));
    const samples = new Set(sampleIds);
    const selected = [
        ...ordered.filter((event) => samples.has(event.eventId)),
        ...ordered.filter((event) => !samples.has(event.eventId)),
    ].slice(0, EVENT_LIMIT).sort(eventOrder);
    return selected.map((event, ordinal) => ({
        ordinal,
        citationAlias: aliasById.get(event.eventId),
        name: event.name,
        kind: event.kind,
        status: event.status,
        environment: event.environment,
        sequence: event.sequence,
        productNodeId: event.product?.nodeId ?? null,
        surfaceId: event.product?.surfaceId ?? null,
        durationMs: event.durationMs ?? null,
        source: event.provenance.source,
        synthetic: event.provenance.synthetic,
    }));
}
export function boundProductContext(manifest, opportunity, events) {
    const nodeById = new Map(manifest.nodes.map((node) => [node.id, node]));
    const evidenceNodeIds = [...new Set(events.flatMap((event) => event.product === undefined ? [] : [event.product.nodeId]))].sort((left, right) => left.localeCompare(right, "en"));
    const missingEvidenceNodeId = evidenceNodeIds.find((id) => !nodeById.has(id));
    if (missingEvidenceNodeId !== undefined) {
        throw new Error(`Evidence-linked product node is absent from the manifest: ${missingEvidenceNodeId}`);
    }
    if (evidenceNodeIds.length === 0) {
        throw new Error("At least one evidence event must link to a product node");
    }
    if (evidenceNodeIds.length > NODE_LIMIT) {
        throw new Error("Evidence-linked product nodes exceed the hard product-context node limit");
    }
    const evidenceNodeIdSet = new Set(evidenceNodeIds);
    const neighborNodeIds = [...new Set(manifest.edges.flatMap((edge) => {
            if (evidenceNodeIdSet.has(edge.from))
                return [edge.to];
            if (evidenceNodeIdSet.has(edge.to))
                return [edge.from];
            return [];
        }))]
        .filter((id) => !evidenceNodeIdSet.has(id))
        .sort((left, right) => left.localeCompare(right, "en"));
    const relevantNodeIdSet = new Set([...evidenceNodeIds, ...neighborNodeIds]);
    const lexicalFillNodeIds = [...nodeById.keys()]
        .filter((id) => !relevantNodeIdSet.has(id))
        .sort((left, right) => left.localeCompare(right, "en"));
    const selectedNodeIds = [
        ...evidenceNodeIds,
        ...neighborNodeIds,
        ...lexicalFillNodeIds,
    ].slice(0, NODE_LIMIT);
    const operations = [...(manifest.hostInterface?.operations ?? [])]
        .sort(byKey((operation) => `${operation.id}@${operation.version}`))
        .slice(0, OPERATION_LIMIT)
        .map(({ id, effect, requiresUserConfirmation }) => ({ id, effect, requiresUserConfirmation }));
    const extensionPoints = [...(manifest.hostInterface?.extensionPoints ?? [])]
        .sort(byKey((point) => point.id))
        .slice(0, EXTENSION_POINT_LIMIT)
        .map(({ id, surfaceNodeId, presentation }) => ({ id, surfaceNodeId, presentation }));
    const evidenceEvents = normalizedEvents(events, opportunity.evidence.sampleEventIds);
    const aliasById = new Map(buildEvidenceAliasEntries(events).map((entry) => [entry.eventId, entry.alias]));
    const sampleEvidenceAliases = opportunity.evidence.sampleEventIds.map((eventId) => {
        const alias = aliasById.get(eventId);
        if (alias === undefined)
            throw new Error("Sample evidence id is absent from the supplied events");
        return alias;
    });
    const makeContext = () => {
        const nodes = selectedNodeIds
            .map((id) => nodeById.get(id))
            .map((node) => ({ id: node.id, kind: node.kind }))
            .sort(byKey((node) => node.id));
        const nodeIds = new Set(nodes.map((node) => node.id));
        const edges = [...manifest.edges]
            .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
            .sort(byKey((edge) => `${edge.from}:${edge.relation}:${edge.to}`))
            .slice(0, EDGE_LIMIT)
            .map(({ from, to, relation }) => ({ from, to, relation }));
        const includedCount = nodes.length + edges.length + operations.length + extensionPoints.length + evidenceEvents.length;
        const totalCount = manifest.nodes.length + manifest.edges.length + events.length +
            (manifest.hostInterface?.operations.length ?? 0) +
            (manifest.hostInterface?.extensionPoints.length ?? 0);
        return {
            schemaVersion: "living.intelligence-context/v1",
            appId: manifest.appId,
            manifestHash: manifest.contentHash,
            totals: {
                nodes: manifest.nodes.length,
                edges: manifest.edges.length,
                operations: manifest.hostInterface?.operations.length ?? 0,
                extensionPoints: manifest.hostInterface?.extensionPoints.length ?? 0,
                evidenceEvents: events.length,
            },
            included: { nodes: [...nodes], edges, operations, extensionPoints, evidenceEvents },
            truncated: includedCount < totalCount,
            relevantProductNodeIds: selectedNodeIds
                .filter((id) => relevantNodeIdSet.has(id))
                .sort((left, right) => left.localeCompare(right, "en")),
            sampleEvidenceAliases,
            evidenceScope: evidenceScope(opportunity.evidence.dataOrigin),
        };
    };
    let context = makeContext();
    while (Buffer.byteLength(JSON.stringify(context), "utf8") > BYTE_LIMIT &&
        selectedNodeIds.length > evidenceNodeIds.length) {
        selectedNodeIds.pop();
        context = makeContext();
    }
    if (Buffer.byteLength(JSON.stringify(context), "utf8") > BYTE_LIMIT) {
        throw new Error("Unable to construct product context within the hard byte limit");
    }
    return context;
}
export const PRODUCT_CONTEXT_LIMITS = Object.freeze({
    nodes: NODE_LIMIT,
    edges: EDGE_LIMIT,
    operations: OPERATION_LIMIT,
    extensionPoints: EXTENSION_POINT_LIMIT,
    evidenceEvents: EVENT_LIMIT,
    bytes: BYTE_LIMIT,
});
//# sourceMappingURL=context.js.map