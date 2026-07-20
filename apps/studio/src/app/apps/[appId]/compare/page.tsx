import type { Metadata } from "next";
import Link from "next/link";
import { EvolutionComparisonStatus } from "@/components/evolution-comparison-status";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { getStudioDataset } from "@/lib/studio-data";
import { studioAppHref } from "@/lib/studio-routes";

export const metadata: Metadata = { title: "Current vs Proposed CRM" };
export const dynamic = "force-dynamic";

const DEFAULT_HOST_URL = "http://127.0.0.1:3000/leads/lead-01";
const DEFAULT_PREVIEW_URL = "http://127.0.0.1:3002/leads/lead-01";
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
    detail: "The simulator exercises the CRM and Living records route and action evidence.",
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
    title: "Prepare",
    detail: "A person starts GPT interpretation; a deterministic adapter prepares and proves the patch.",
  },
  {
    title: "Approve and apply",
    detail: "A person reviews, approves, then separately applies the exact bytes to the CRM.",
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
  const revisitSignal = opportunity?.signals.find((signal) =>
    /revisit/i.test(signal.label),
  );
  const totalCases = dataset.workflows.observedCases;
  const affectedCases = opportunity?.affectedCases ?? 0;
  const revisits = revisitSignal?.value ?? "—";
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
        title="Add Previous and Next controls to lead pages"
        description={
          <p>
            Living detected repeated list backtracking and prepared one
            verified change. <strong>The real CRM is still unchanged.</strong>
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
          <p className="eyebrow">Why Living suggested this</p>
          <h2>{affectedCases} of {totalCases} workflows hit the same friction</h2>
          <p>
            Lead list → Open lead → Back to list → Open another lead. Living
            counted <strong>{revisits} backtracking revisits</strong>, crossing
            the deterministic detector threshold.
          </p>
          <small>
            {dataset.app.source.dataOrigin === "synthetic"
              ? "Synthetic demo evidence—not production telemetry. "
              : "Captured product evidence. "}
            No code changed automatically.
          </small>
        </article>
        <article className="comparison-change-summary">
          <p className="eyebrow">The only product change</p>
          <h2>Review leads without returning to the list</h2>
          <dl>
            <div><dt>Before</dt><dd>Return to Leads before opening another lead.</dd></div>
            <div><dt>After</dt><dd>Use Previous lead · 1 of 36 · Next lead on the lead page.</dd></div>
          </dl>
          <code>src/app/leads/[id]/page.tsx</code>
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
          Approval records your decision; it does not change the CRM. Applying
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
            <strong>Mapping, capture, and deterministic detection</strong>
          </div>
          <div>
            <span>Human boundary</span>
            <strong>Prepare, approve, apply, and roll back</strong>
          </div>
        </div>
      </details>
    </>
  );
}
