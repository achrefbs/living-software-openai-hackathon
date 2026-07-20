import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { MapExplorer } from "@/components/map-explorer";
import {
  Badge,
  FactStrip,
  PageHeader,
  SurfaceState,
  TechnicalDetails,
} from "@/components/ui";
import { journeyStages } from "@/lib/journey";
import { getPreviewMode, getStudioDataset } from "@/lib/studio-data";
import { studioAppHref } from "@/lib/studio-routes";

export const metadata: Metadata = { title: "Product Map" };

export default async function ProductMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string }>;
  searchParams: Promise<{ preview?: string | string[] }>;
}) {
  const { appId } = await params;
  const { preview } = await searchParams;
  const previewMode = getPreviewMode(preview);
  const dataset = await getStudioDataset();
  const { nodes, edges, totalNodes, totalEdges, omittedNodes } =
    dataset.productMap;

  if (previewMode !== "data") {
    return (
      <SurfaceState
        kind={previewMode}
        returnHref={studioAppHref(appId, "map")}
      />
    );
  }

  const scanned = nodes.filter((node) => node.provenance === "scanned").length;
  const declared = nodes.filter((node) => node.provenance === "declared").length;
  const inferred = nodes.filter((node) => node.provenance === "inferred").length;
  const stages = journeyStages(dataset);
  const mapStage = stages[0];

  return (
    <>
      <PageHeader
        stage={mapStage && { step: 1, title: "Map", status: mapStage.status }}
        title="What this software can do"
        description={
          <p>
            Living Software analyzed <strong>{dataset.app.name}</strong> and
            mapped {totalNodes} nodes in the versioned manifest. Of those,{" "}
            {nodes.length} are explorable product capabilities — screens,
            actions, interfaces,
            and data entities, each traced to its exact source.
            {omittedNodes > 0 &&
              ` ${omittedNodes} non-product test node${omittedNodes === 1 ? " is" : "s are"} excluded from the four product layers.`}{" "}
            This map is the foundation the rest of the evidence
            builds on.
          </p>
        }
      />

      <section aria-labelledby="pipeline-story-title" className="panel story-panel">
        <h2 id="pipeline-story-title">How the story unfolds</h2>
        <p className="story-lede">
          Living Software installs into a supported application, maps what the
          product can do, observes privacy-safe workflows, detects recurring
          friction, and prepares a bounded improvement for human review. This
          snapshot has progressed to:
        </p>
        <ol className="story-steps">
          {stages.map((stage) => (
            <li className={"story-step story-" + stage.status} key={stage.id}>
              <Link href={studioAppHref(appId, stage.id)}>
                <span className="story-step-status" aria-hidden="true">
                  {stage.status === "complete" ? (
                    <Icon name="check" />
                  ) : stage.status === "locked" ? (
                    <Icon name="lock" />
                  ) : (
                    <span className="story-step-now" />
                  )}
                </span>
                <span className="story-step-text">
                  <strong>{stage.title}</strong>
                  <span>{stage.summary}</span>
                  <span className="visually-hidden">
                    {stage.status === "locked"
                      ? " — locked. " + (stage.lockReason ?? "")
                      : " — " + stage.status}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <FactStrip
        facts={[
          {
            label: "Explorable capabilities",
            value: String(nodes.length),
            note: `Of ${totalNodes} total manifest nodes`,
            tone: "accent",
          },
          {
            label: "Manifest relationships",
            value: String(totalEdges),
            note:
              edges.length === totalEdges
                ? "All connect explorable product nodes"
                : `${edges.length} relationship${edges.length === 1 ? "" : "s"} connect${edges.length === 1 ? "s" : ""} explorable product nodes`,
          },
          {
            label: "High confidence",
            value: String(scanned + declared),
            note: "Scanned from source or host-declared",
          },
          {
            label: "Needs confirmation",
            value: String(inferred),
            note: "Inferred — kept explicitly separate",
            tone: "warm",
          },
        ]}
      />

      <section aria-labelledby="topology-title" className="panel">
        <div className="panel-heading">
          <div>
            <h2 id="topology-title">Capability topology</h2>
            <p className="panel-subtitle">
              Surfaces lead to actions, actions call interfaces, interfaces
              read and write entities. Select any node to follow its
              connections.
            </p>
          </div>
          <div className="legend" aria-hidden="true">
            <span>
              <i className="legend-dot dot-scanned" />
              Scanned
            </span>
            <span>
              <i className="legend-dot dot-declared" />
              Declared
            </span>
            <span>
              <i className="legend-dot dot-inferred" />
              Inferred
            </span>
          </div>
        </div>
        <MapExplorer
          edges={edges}
          nodes={nodes}
          omittedNodes={omittedNodes}
          totalEdges={totalEdges}
          totalNodes={totalNodes}
        />
      </section>

      <section aria-labelledby="provenance-title" className="panel">
        <div className="panel-heading">
          <div>
            <h2 id="provenance-title">Why you can trust this map</h2>
            <p className="panel-subtitle">
              Confidence is not certainty — each node carries its origin.
            </p>
          </div>
        </div>
        <div className="provenance-columns">
          <div>
            <Badge tone="positive">{scanned} scanned</Badge>
            <p>Extracted from route and interface structure in the manifest.</p>
          </div>
          <div>
            <Badge tone="info">{declared} declared</Badge>
            <p>Business meaning explicitly supplied by the manifest source.</p>
          </div>
          <div>
            <Badge tone="warning">{inferred} inferred</Badge>
            <p>Suggested relationships a developer would still confirm.</p>
          </div>
        </div>
        <TechnicalDetails summary="Manifest provenance">
          <p>
            {dataset.app.source.noticeTitle} {dataset.app.source.notice}
          </p>
          <p>{dataset.notice}</p>
          <dl className="key-value-list">
            <div>
              <dt>Release revision</dt>
              <dd>
                <code>{dataset.app.version}</code>
              </dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>{dataset.app.environment}</dd>
            </div>
          </dl>
        </TechnicalDetails>
      </section>
    </>
  );
}
