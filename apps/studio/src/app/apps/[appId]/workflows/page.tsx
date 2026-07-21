import type { Metadata } from "next";
import { CaseTable, WorkflowExplorer } from "@/components/workflow-explorer";
import {
  Badge,
  FactStrip,
  Glossary,
  PageHeader,
  SurfaceState,
} from "@/components/ui";
import { journeyStages } from "@/lib/journey";
import {
  formatDuration,
  getPreviewMode,
  getStudioDataset,
} from "@/lib/studio-data";
import { studioAppHref } from "@/lib/studio-routes";
import {
  workflowSignalCopy,
  workflowSignalFactNote,
  workflowSignalFootnote,
} from "@/lib/workflow-signal";

export const metadata: Metadata = { title: "Workflow Explorer" };

export default async function WorkflowsPage({
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
  const workflows = dataset.workflows;

  if (previewMode !== "data") {
    return (
      <SurfaceState
        kind={previewMode}
        returnHref={studioAppHref(appId, "workflows")}
      />
    );
  }

  if (workflows.variants.length === 0) {
    return (
      <SurfaceState
        kind="empty"
        returnHref={studioAppHref(appId, "workflows")}
      />
    );
  }

  const defaultVariant =
    workflows.variants.find((variant) => variant.tone === "friction") ??
    workflows.variants[0];
  const succeeded = workflows.evidenceCases.filter(
    (item) => item.outcome === "succeeded" || item.outcome === "resolved",
  ).length;
  const totalEvents = workflows.evidenceCases.reduce(
    (sum, item) => sum + item.eventCount,
    0,
  );
  const frictionCount = workflows.variants.filter(
    (variant) => variant.tone === "friction",
  ).length;
  const origin =
    dataset.app.source.dataOrigin === "fixture"
      ? "synthetic fixture"
      : dataset.app.source.dataOrigin;
  const stage = journeyStages(dataset)[1];
  const activeOpportunity = dataset.opportunities.find(
    (opportunity) => opportunity.status === "detected",
  );
  const signalKind = activeOpportunity?.signalKind ?? null;
  const signalCopy = workflowSignalCopy(signalKind);

  return (
    <>
      <PageHeader
        stage={stage && { step: 2, title: "Observe", status: stage.status }}
        title="What people actually did"
        description={
          <p>
            Studio replays <strong>{workflows.observedCases} captured cases</strong>{" "}
            of {origin} activity and groups them into journey shapes — without
            assigning intent the evidence cannot prove. This is a validated
            export, not live telemetry, and {workflows.observedCases} cases is
            a demonstration, not a statistic.
          </p>
        }
      >
        <Badge tone="info">{dataset.app.source.label}</Badge>
      </PageHeader>

      <section aria-labelledby="workflow-terms" className="panel glossary-panel">
        <h2 className="visually-hidden" id="workflow-terms">
          How to read this page
        </h2>
        <Glossary
          items={[
            {
              term: "Case",
              definition: "One captured journey from start to finish.",
            },
            {
              term: "Variant",
              definition: "A journey shape — cases that took the same path.",
            },
            {
              term: "Outcome",
              definition:
                "How a case ended. Only a recorded success event counts.",
            },
            {
              term: signalCopy.term,
              definition: signalCopy.definition,
            },
          ]}
        />
      </section>

      <FactStrip
        facts={[
          {
            label: "Captured cases",
            value: String(workflows.observedCases),
            note: `Grouped into ${workflows.variants.length} journey shape${workflows.variants.length === 1 ? "" : "s"}`,
            tone: "accent",
          },
          {
            label: "Recorded events",
            value: String(totalEvents),
            note: "Aggregate counts only — no content",
          },
          {
            label: workflows.durationLabel,
            value: formatDuration(workflows.durationSeconds),
            note: "Across all captured cases",
          },
          {
            label: "Reached success",
            value: `${succeeded} of ${workflows.observedCases}`,
            note: workflowSignalFactNote({
              kind: signalKind,
              affectedCases: activeOpportunity?.affectedCases ?? 0,
              totalCases: workflows.observedCases,
              frictionVariants: frictionCount,
              totalVariants: workflows.variants.length,
            }),
            tone: succeeded < workflows.observedCases ? "warm" : "default",
          },
        ]}
        footnote={
          "Counts describe this " +
          origin +
          " capture only. They are far too few to generalize from — their job is to demonstrate that detection works." +
          (activeOpportunity === undefined
            ? ""
            : workflowSignalFootnote({
                kind: activeOpportunity.signalKind,
                affectedCases: activeOpportunity.affectedCases,
                totalCases: workflows.observedCases,
              }))
        }
      />

      <WorkflowExplorer
        defaultVariantId={defaultVariant?.id ?? ""}
        evidenceCases={workflows.evidenceCases}
        signalKind={signalKind}
        variants={workflows.variants}
      />

      <section aria-labelledby="case-table-title" className="panel">
        <div className="panel-heading">
          <div>
            <h2 id="case-table-title">Every captured case</h2>
            <p className="panel-subtitle">
              The complete evidence set behind the variants above — aggregate
              numbers and pseudonymous identifiers only.
            </p>
          </div>
        </div>
        <CaseTable
          evidenceCases={workflows.evidenceCases}
          variants={workflows.variants}
        />
      </section>
    </>
  );
}
