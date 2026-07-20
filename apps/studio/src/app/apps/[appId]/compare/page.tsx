import type { Metadata } from "next";
import Link from "next/link";
import { EvolutionComparisonStatus } from "@/components/evolution-comparison-status";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { getStudioDataset } from "@/lib/studio-data";
import { studioAppHref } from "@/lib/studio-routes";

export const metadata: Metadata = { title: "Current vs Proposed Application" };
export const dynamic = "force-dynamic";

const DEFAULT_HOST_URL = "http://127.0.0.1:3000/";
const DEFAULT_PREVIEW_URL = "http://127.0.0.1:3002/";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

function safeLoopbackHttpUrl(
  value: string | undefined,
  fallback: string,
  expectedPort: "3000" | "3002",
): string {
  try {
    const url = new URL(value ?? fallback);
    return url.protocol === "http:" &&
      LOOPBACK_HOSTS.has(url.hostname) &&
      url.port === expectedPort &&
      url.username === "" &&
      url.password === ""
        ? url.toString()
        : fallback;
  } catch {
    return fallback;
  }
}

const triggerSteps = [
  {
    title: "Install",
    detail: "Living maps the Node.js codebase and installs bounded event capture.",
  },
  {
    title: "Observe",
    detail: "People or test automation use the application while Living records bounded route and action evidence.",
  },
  {
    title: "Analyze",
    detail: "In this MVP, an operator reruns analysis and syncs the result to Studio.",
  },
  {
    title: "Detect",
    detail: "A deterministic threshold—not a model opinion—creates the opportunity.",
  },
  {
    title: "Author and validate",
    detail: "A person starts the run. GPT-5.6 interprets the evidence, receives only bounded eligible UI source, and authors exact edits. Living validates and proves the resulting patch.",
  },
  {
    title: "Approve and apply",
    detail: "A person reviews, approves, then separately applies the exact bytes to the connected application.",
  },
] as const;

export default async function ComparePage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const dataset = await getStudioDataset();
  const opportunity = dataset.opportunities.find(
    (item) => item.status === "detected",
  );
  const totalCases = dataset.workflows.observedCases;
  const affectedCases = opportunity?.affectedCases ?? 0;
  const hostUrl = safeLoopbackHttpUrl(
    process.env.LIVING_STUDIO_HOST_URL,
    DEFAULT_HOST_URL,
    "3000",
  );
  const previewUrl = safeLoopbackHttpUrl(
    process.env.LIVING_STUDIO_PREVIEW_URL,
    DEFAULT_PREVIEW_URL,
    "3002",
  );

  return (
    <>
      <PageHeader
        eyebrow="Ready for your decision"
        title="Review GPT-5.6's proposed source change"
        description={
          <p>
            Living detected a workflow opportunity, GPT-5.6 authored bounded
            source edits, and Living proved the exact result.{" "}
            <strong>The connected application is still unchanged.</strong>
          </p>
        }
      >
        <Link
          className="button button-primary"
          href={`${studioAppHref(appId, "evolutions")}#approve-change`}
        >
          Continue to approval
        </Link>
      </PageHeader>

      <section aria-label="Change summary" className="comparison-story">
        <article>
          <p className="eyebrow">What Living detected</p>
          <h2>{affectedCases} of {totalCases} workflows crossed the detector threshold</h2>
          <p>
            {opportunity?.summary ??
              "The captured evidence produced a deterministic workflow opportunity."}
          </p>
          <small>
            {dataset.app.source.dataOrigin === "synthetic"
              ? "Synthetic demo evidence—not production telemetry. "
              : "Captured product evidence. "}
            No code changed automatically.
          </small>
        </article>
        <article className="comparison-change-summary">
          <p className="eyebrow">What GPT-5.6 authored</p>
          <h2>A bounded source proposal, not a prewritten recipe</h2>
          <p>
            The exact summary, rationale, target file, and diff are loaded from
            the governed proposal below. Living independently checks every
            edit before presenting it.
          </p>
        </article>
      </section>

      <EvolutionComparisonStatus hostUrl={hostUrl} previewUrl={previewUrl} />

      <Panel
        className="comparison-decision"
        eyebrow="What happens after this screen"
        title="Approval and application are two separate actions"
        action={<Badge tone="warning">Not live</Badge>}
      >
        <p>
          Approval records your decision; it does not change the application. Applying
          the approved artifact is the next, separate source-write step.
        </p>
        <Link
          className="button button-primary"
          href={`${studioAppHref(appId, "evolutions")}#approve-change`}
        >
          Continue to approval
        </Link>
      </Panel>

      <details className="panel comparison-logic">
        <summary>How Living reached this proposal</summary>
        <ol className="comparison-flow">
          {triggerSteps.map((step, index) => (
            <li key={step.title}>
              <span aria-hidden="true">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="comparison-authority">
          <div>
            <span>Automatic boundary</span>
            <strong>Mapping, capture, detection, GPT authorship, and validation</strong>
          </div>
          <div>
            <span>Human boundary</span>
            <strong>Approve, apply, and roll back</strong>
          </div>
        </div>
      </details>
    </>
  );
}
