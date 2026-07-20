"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, EvidenceRef, ProgressBar } from "@/components/ui";
import type {
  ProductEdge,
  ProductNode,
  ProductNodeKind,
} from "@/lib/studio-types";

const lanes: Array<{
  kind: ProductNodeKind;
  label: string;
  plain: string;
}> = [
  { kind: "surface", label: "Surfaces", plain: "Screens people see" },
  { kind: "action", label: "Actions", plain: "Things people trigger" },
  { kind: "api", label: "Interfaces", plain: "Connections and storage" },
  { kind: "entity", label: "Entities", plain: "Data the app manages" },
];

const provenanceCopy: Record<
  ProductNode["provenance"],
  { label: string; tone: "positive" | "info" | "warning"; detail: string }
> = {
  scanned: {
    label: "Scanned",
    tone: "positive",
    detail: "Extracted directly from the application's source structure.",
  },
  declared: {
    label: "Declared",
    tone: "info",
    detail: "Business meaning explicitly supplied by the manifest source.",
  },
  inferred: {
    label: "Inferred",
    tone: "warning",
    detail: "Suggested by analysis; a developer would still need to confirm it.",
  },
};

export function MapExplorer({
  nodes,
  edges,
  totalNodes,
  totalEdges,
  omittedNodes,
}: {
  nodes: ProductNode[];
  edges: ProductEdge[];
  totalNodes: number;
  totalEdges: number;
  omittedNodes: number;
}) {
  const [query, setQuery] = useState("");
  const [layer, setLayer] = useState<ProductNodeKind | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const visible = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return nodes.filter((node) => {
      if (layer !== "all" && node.kind !== layer) return false;
      if (trimmed === "") return true;
      return (
        node.label.toLowerCase().includes(trimmed) ||
        node.source.toLowerCase().includes(trimmed)
      );
    });
  }, [nodes, query, layer]);

  const visibleIds = useMemo(
    () => new Set(visible.map((node) => node.id)),
    [visible],
  );

  const selected = selectedId === null ? null : (nodeById.get(selectedId) ?? null);
  const related = useMemo(() => {
    if (selected === null) return { outgoing: [], incoming: [] };
    return {
      outgoing: edges.filter((edge) => edge.from === selected.id),
      incoming: edges.filter((edge) => edge.to === selected.id),
    };
  }, [edges, selected]);

  const filtersActive = layer !== "all" || query.trim() !== "";

  return (
    <div className="map-explorer">
      <div className="map-toolbar">
        <div className="map-search">
          <Icon name="search" aria-hidden="true" />
          <input
            aria-label="Search mapped capabilities by name or source path"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search capabilities…"
            type="search"
            value={query}
          />
          {query !== "" && (
            <button
              aria-label="Clear search"
              className="map-search-clear"
              onClick={() => setQuery("")}
              type="button"
            >
              <Icon name="close" />
            </button>
          )}
        </div>
        <div
          aria-label="Filter by product layer"
          className="layer-filter"
          role="group"
        >
          <button
            aria-pressed={layer === "all"}
            className="filter-chip"
            onClick={() => setLayer("all")}
            type="button"
          >
            All layers
          </button>
          {lanes.map((lane) => (
            <button
              aria-pressed={layer === lane.kind}
              className="filter-chip"
              key={lane.kind}
              onClick={() =>
                setLayer((current) => (current === lane.kind ? "all" : lane.kind))
              }
              type="button"
            >
              {lane.label}
              <span className="filter-count">
                {nodes.filter((node) => node.kind === lane.kind).length}
              </span>
            </button>
          ))}
        </div>
        <p aria-live="polite" className="map-scope">
          {filtersActive
            ? `Showing ${visible.length} of ${nodes.length} explorable product capabilities`
            : `Showing all ${nodes.length} explorable product capabilities`}
          {omittedNodes > 0 &&
            ` · ${totalNodes} manifest nodes total; ${omittedNodes} non-product test node${omittedNodes === 1 ? "" : "s"} excluded from the lanes`}
        </p>
      </div>

      <div className="map-body">
        <div className="map-lanes">
          {lanes
            .filter((lane) => layer === "all" || lane.kind === layer)
            .map((lane) => {
              const laneNodes = visible.filter((node) => node.kind === lane.kind);
              return (
                <section className="map-lane" key={lane.kind}>
                  <header className="map-lane-heading">
                    <h3>{lane.label}</h3>
                    <p>{lane.plain}</p>
                  </header>
                  {laneNodes.length === 0 ? (
                    <p className="map-lane-empty">No matches in this layer.</p>
                  ) : (
                    <ul className="map-node-list">
                      {laneNodes.map((node) => (
                        <li key={node.id}>
                          <button
                            aria-pressed={node.id === selectedId}
                            className={
                              "map-node node-" +
                              node.provenance +
                              (node.id === selectedId ? " map-node-selected" : "")
                            }
                            onClick={() =>
                              setSelectedId((current) =>
                                current === node.id ? null : node.id,
                              )
                            }
                            type="button"
                          >
                            <span
                              aria-hidden="true"
                              className={"provenance-dot dot-" + node.provenance}
                            />
                            <span className="map-node-label">{node.label}</span>
                            <span className="visually-hidden">
                              {", " + provenanceCopy[node.provenance].label + ", "}
                            </span>
                            <span className="map-node-confidence">
                              {Math.round(node.confidence * 100)}%
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
        </div>

        <aside aria-live="polite" className="map-detail">
          {selected === null ? (
            <div className="map-detail-empty">
              <Icon name="layers" />
              <h3>Select a capability</h3>
              <p>
                Pick any node to see what it is, how confident the scan is, and
                which other capabilities it connects to across {edges.length}{" "}
                explorable relationship{edges.length === 1 ? "" : "s"}
                {totalEdges === edges.length ? "." : ` (${totalEdges} manifest relationships overall).`}
              </p>
            </div>
          ) : (
            <div className="map-detail-body">
              <div className="map-detail-top">
                <Badge tone={provenanceCopy[selected.provenance].tone}>
                  {provenanceCopy[selected.provenance].label}
                </Badge>
                <button
                  aria-label="Close capability details"
                  className="map-detail-close"
                  onClick={() => setSelectedId(null)}
                  type="button"
                >
                  <Icon name="close" />
                </button>
              </div>
              <h3>{selected.label}</h3>
              <p className="map-detail-kind">
                {lanes.find((lane) => lane.kind === selected.kind)?.plain}
              </p>
              <p className="map-detail-description">
                {provenanceCopy[selected.provenance].detail}
              </p>
              <div className="map-detail-confidence">
                <span>Scan confidence</span>
                <strong>{Math.round(selected.confidence * 100)}%</strong>
              </div>
              <ProgressBar
                label={selected.label + " scan confidence"}
                value={selected.confidence}
              />

              <div className="map-relations">
                <h4>Connections</h4>
                {related.outgoing.length === 0 && related.incoming.length === 0 ? (
                  <p className="map-relations-empty">
                    No observed relationships touch this node.
                  </p>
                ) : (
                  <ul>
                    {related.outgoing.map((edge) => {
                      const target = nodeById.get(edge.to);
                      if (target === undefined) return null;
                      return (
                        <li key={"out" + edge.to + edge.relation}>
                          <span className="relation-verb">
                            this {edge.relation}
                          </span>
                          <button
                            className="relation-node"
                            onClick={() => setSelectedId(target.id)}
                            type="button"
                          >
                            {target.label}
                            <Icon name="arrow" />
                          </button>
                        </li>
                      );
                    })}
                    {related.incoming.map((edge) => {
                      const source = nodeById.get(edge.from);
                      if (source === undefined) return null;
                      return (
                        <li key={"in" + edge.from + edge.relation}>
                          <button
                            className="relation-node"
                            onClick={() => setSelectedId(source.id)}
                            type="button"
                          >
                            {source.label}
                            <Icon name="arrow" />
                          </button>
                          <span className="relation-verb">
                            {edge.relation} this
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <details className="tech-details">
                <summary>
                  <Icon name="chevron" />
                  Source provenance
                </summary>
                <div className="tech-details-body">
                  <p>Captured in the versioned Product Manifest from:</p>
                  <EvidenceRef>{selected.source}</EvidenceRef>
                </div>
              </details>
              {visibleIds.has(selected.id) ? null : (
                <p className="map-detail-note">
                  This node is outside the current filter.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
