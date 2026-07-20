import type { Metadata } from "next";
import Link from "next/link";
import { EvolutionComparisonStatus } from "@/components/evolution-comparison-status";
import { Badge, PageHeader, Panel } from "@/components/ui";
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

const logicSteps = [
  {
    title: "Evidence",
    detail: "Captured workflow events reveal repeated lead backtracking.",
  },
  {
    title: "GPT interpretation",
    detail: "GPT-5.6 explains the friction and suggests a product direction; it does not write the patch.",
  },
  {
    title: "Deterministic adapter",
    detail: "The engine's single eligible adapter owns the exact source transformation.",
  },
  {
    title: "Static proof",
    detail: "The bounded postimage is checked and bound to content hashes before review.",
  },
  {
    title: "Exact human approval",
    detail: "A person must approve the specific artifact and proof hashes. Previewing grants no authority.",
  },
  {
    title: "Apply or roll back",
    detail: "Only the approved bytes can replace the host source, and the exact preimage remains recoverable.",
  },
] as const;

export default async function ComparePage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
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
        eyebrow="Prepared change comparison"
        title="Current CRM vs proposed CRM"
        description={
          <p>
            Studio verifies the isolated process against the governed postimage
            hash before it renders either side. Lifecycle-aware labels prevent
            an applied CRM from being presented as the old version.
          </p>
        }
      >
        <Link className="button button-secondary" href={studioAppHref(appId, "evolutions")}>
          Back to evolution review
        </Link>
      </PageHeader>

      <EvolutionComparisonStatus hostUrl={hostUrl} previewUrl={previewUrl} />

      <Panel
        className="comparison-logic"
        eyebrow="Why this version exists"
        title="The logic behind the proposed change"
        action={<Badge tone="positive">Human-governed</Badge>}
      >
        <ol className="comparison-flow">
          {logicSteps.map((step, index) => (
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
            <span>Model suggestion</span>
            <strong>Interpret the evidence and explain a direction</strong>
          </div>
          <div>
            <span>Code ownership</span>
            <strong>Deterministic adapter, static proof, and exact-hash lifecycle</strong>
          </div>
        </div>
      </Panel>
    </>
  );
}
