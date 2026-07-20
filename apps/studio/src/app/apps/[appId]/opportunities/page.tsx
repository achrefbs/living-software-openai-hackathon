import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import {
  Badge,
  EvidenceRef,
  KeyValueList,
  PageHeader,
  Panel,
  ProgressBar,
  SurfaceState,
  TechnicalDetails,
} from "@/components/ui";
import { journeyStages } from "@/lib/journey";
import { getPreviewMode, getStudioDataset } from "@/lib/studio-data";
import { studioAppHref } from "@/lib/studio-routes";

export const metadata: Metadata = { title: "Opportunity Feed" };

export default async function OpportunitiesPage({
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
  const opportunities = dataset.opportunities;
  const primary = opportunities[0];
  const others = opportunities.slice(1);

  if (previewMode !== "data") {
    return (
      <SurfaceState
        kind={previewMode}
        returnHref={studioAppHref(appId, "opportunities")}
      />
    );
  }

  const stage = journeyStages(dataset)[2];
  const totalCases = dataset.workflows.observedCases;
  const revisitSignal = primary?.signals.find((signal) =>
    /revisit/i.test(signal.label),
  );
  const isBacktracking =
    primary !== undefined && /backtracking/i.test(primary.detector);
  const lead =
    primary === undefined
      ? null
      : isBacktracking && revisitSignal && /^\d+$/.test(revisitSignal.value)
        ? `${primary.affectedCases} of ${totalCases} captured cases crossed the backtracking threshold, producing ${revisitSignal.value} revisits of screens already visited.`
        : primary.summary;

  return (
    <>
      <PageHeader
        stage={stage && { step: 3, title: "Detect", status: stage.status }}
        title="Where the evidence shows friction"
        description={
          <p>
            Deterministic detectors watch the captured cases for measurable
            patterns and report only when a rule's threshold is crossed. They
            do not decide what users mean or what the software should become.
          </p>
        }
      />

      {primary === undefined ? (
        <Panel
          title="The evidence is valid, but no threshold was crossed"
          action={<Badge tone="positive">Analysis complete</Badge>}
        >
          <p className="detail-summary">
            Studio will not invent an improvement when the deterministic
            detector returns no result. Continue collecting evidence and
            analyze another captured window.
          </p>
        </Panel>
      ) : (
        <article aria-labelledby="detection-title" className="panel detection-hero">
          <div className="detection-topline">
            <Badge tone="critical">Detected</Badge>
            <span className="detection-detector">
              by rule, not by model · {primary.detector}
            </span>
          </div>
          <h2 id="detection-title">{primary.title}</h2>
          <p className="detection-lead">{lead}</p>

          <dl className="signal-grid">
            {primary.signals.map((signal) => (
              <div className="signal-card" key={signal.label}>
                <dt>{signal.label}</dt>
                <dd>{signal.value}</dd>
              </div>
            ))}
            <div className="signal-card">
              <dt>Deterministic confidence</dt>
              <dd>{Math.round(primary.confidence * 100)}%</dd>
            </div>
          </dl>
          <ProgressBar
            label="Deterministic confidence"
            value={primary.confidence}
          />
          <p className="detection-confidence-note">
            Confidence is computed from fixed rules over the captured events —
            it is a measure of evidence strength, not a model's opinion.
          </p>

          <div className="detection-actions">
            <Link
              className="button button-secondary"
              href={studioAppHref(appId, "workflows")}
            >
              <Icon name="return" />
              See the journeys behind this evidence
            </Link>
          </div>

          <TechnicalDetails summary="Detector and evidence provenance">
            <KeyValueList
              items={[
                {
                  term: "Detector",
                  value: primary.detector + "@" + primary.detectorVersion,
                  code: true,
                },
                { term: "Affected cases", value: String(primary.affectedCases) },
                ...primary.evidenceRefs.map((reference, index) => ({
                  term: index === 0 ? "Evidence bundle" : "Event-set hash",
                  value: reference,
                  code: true,
                })),
                { term: "Model interpretation", value: "Not run" },
                { term: "Raw user content", value: "Excluded by design" },
              ]}
            />
          </TechnicalDetails>
        </article>
      )}

      {others.length > 0 && (
        <Panel title="Other signals in this capture">
          <ul className="watch-list">
            {others.map((opportunity) => (
              <li key={opportunity.id}>
                <div>
                  <strong>{opportunity.title}</strong>
                  <p>{opportunity.summary}</p>
                </div>
                <span className="watch-meta">
                  <Badge
                    tone={
                      opportunity.status === "detected" ? "critical" : "warning"
                    }
                  >
                    {opportunity.status === "watching"
                      ? "Watching — below threshold"
                      : "Detected"}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <aside aria-labelledby="principle-title" className="panel principle-panel">
        <Icon name="warning" />
        <div>
          <h2 id="principle-title">A pattern is not an instruction.</h2>
          <p>
            The detector can establish repetition, delay, and outcome
            correlation. A model may propose an explanation next, but a person
            must correct and confirm it before any capability contract exists.
          </p>
        </div>
      </aside>

      {primary !== undefined && (
        <Panel
          className="bridge-panel"
          title="What happens next"
          action={
            dataset.evolution === null ? (
              <Badge tone="locked">Review is locked</Badge>
            ) : (
              <Badge tone="info">Evidence ready</Badge>
            )
          }
        >
          <p className="detail-summary">
            The permitted next step is a bounded GPT-5.6 interpretation of this
            evidence package. That interpretation{" "}
            <strong>has not run for this snapshot</strong>
            {dataset.evolution === null
              ? ", so Studio shows the review stage locked rather than inventing a proposal."
              : ", so the review below stops at the evidence stage."}
          </p>
          <div className="detection-actions">
            <Link
              className="button button-primary"
              href={studioAppHref(appId, "evolutions")}
            >
              {dataset.evolution === null
                ? "See what review would require"
                : "Open the review"}
              <Icon name="arrow" />
            </Link>
          </div>
        </Panel>
      )}
    </>
  );
}
