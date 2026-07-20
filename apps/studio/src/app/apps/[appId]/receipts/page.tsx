import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import {
  Badge,
  EvidenceRef,
  PageHeader,
  Panel,
  StatCard,
  SurfaceState,
  TechnicalDetails,
} from "@/components/ui";
import { journeyStages } from "@/lib/journey";
import { getPreviewMode, getStudioDataset } from "@/lib/studio-data";
import { studioAppHref } from "@/lib/studio-routes";

export const metadata: Metadata = { title: "Receipts" };

const timeFormatter = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const previewReceipts: Array<{
  id: string;
  icon: IconName;
  type: string;
  title: string;
  detail: string;
}> = [
  {
    id: "interpretation",
    icon: "spark",
    type: "interpretation.recorded",
    title: "Model interpretation receipt",
    detail:
      "Would record exactly what GPT-5.6 was asked and what it proposed, referenced by content hash — so the proposal can never be quietly rewritten.",
  },
  {
    id: "contract",
    icon: "file",
    type: "contract.confirmed",
    title: "Contract confirmation receipt",
    detail:
      "Would record the human-corrected capability boundary: permitted inputs, permitted effects, and explicit prohibitions.",
  },
  {
    id: "proof",
    icon: "shield",
    type: "proof.completed",
    title: "Proof gate receipt",
    detail:
      "Would record every deterministic gate the generated artifact faced and each result, before any human approval was requested.",
  },
  {
    id: "approval",
    icon: "user",
    type: "approval.granted",
    title: "Human approval receipt",
    detail:
      "Would record who reviewed the artifact and proofs, and the decision they made. Authority stays with people.",
  },
  {
    id: "activation",
    icon: "evolution",
    type: "activation.applied",
    title: "Activation receipt",
    detail:
      "Would record the moment the bounded capability went live, together with its rollback pointer.",
  },
  {
    id: "rollback",
    icon: "undo",
    type: "rollback.applied",
    title: "Rollback receipt (when used)",
    detail:
      "Would record a human reversing the change — the audit trail keeps the reversal as visible as the activation.",
  },
];

export default async function ReceiptsPage({
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

  if (previewMode !== "data") {
    return (
      <SurfaceState
        kind={previewMode}
        returnHref={studioAppHref(appId, "receipts")}
      />
    );
  }

  const receipts = dataset.receipts;
  if (receipts === null) {
    const stage = journeyStages(dataset)[4];
    const hasDetectedEvidence = dataset.opportunities.some(
      (opportunity) => opportunity.status === "detected",
    );
    return (
      <>
        <PageHeader
          stage={stage && { step: 5, title: "Audit", status: stage.status }}
          title="The audit trail — before anything has run"
          description={
            <p>
              Every action in a governed evolution would leave a hash-linked
              receipt here.{" "}
              <strong>
                Zero lifecycle receipts exist for this snapshot
              </strong>{" "}
              because no interpretation, contract, proof, approval, or
              activation has happened — and Studio will not render records that
              were never written.
            </p>
          }
        >
          <Badge tone="locked">No lifecycle has run</Badge>
        </PageHeader>

        <section
          aria-labelledby="receipt-preview-title"
          className="panel lifecycle-preview"
        >
          <div className="panel-heading">
            <div>
              <h2 id="receipt-preview-title">
                What a governed evolution would leave behind
              </h2>
              <p className="panel-subtitle">
                Six receipt types, written in order, each linking to the
                previous one by content hash. All of them are still unwritten.
              </p>
            </div>
          </div>
          <ol className="locked-lifecycle">
            {previewReceipts.map((receipt) => (
              <li className="locked-stage locked-locked" key={receipt.id}>
                <span aria-hidden="true" className="locked-stage-icon">
                  <Icon name={receipt.icon} />
                </span>
                <div className="locked-stage-body">
                  <div className="locked-stage-top">
                    <h3>{receipt.title}</h3>
                    <Badge tone="locked">Not created</Badge>
                  </div>
                  <p>{receipt.detail}</p>
                  <EvidenceRef>{receipt.type}</EvidenceRef>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <Panel
          className="boundary-panel"
          title="What is verifiable today"
          action={<Badge tone="positive">Evidence chain valid</Badge>}
        >
          <p>
            The captured analysis proves its own evidence chain — Studio
            validated it before rendering anything. That chain covers the
            capture, not a governed lifecycle, so it lives in provenance rather
            than pretending to be a receipt stream.
          </p>
          <TechnicalDetails summary="Capture evidence chain">
            <p>{dataset.notice}</p>
          </TechnicalDetails>
          {hasDetectedEvidence && (
            <div className="detection-actions">
              <Link
                className="button button-secondary"
                href={studioAppHref(appId, "opportunities")}
              >
                <Icon name="return" />
                Back to the detected evidence
              </Link>
            </div>
          )}
        </Panel>
      </>
    );
  }
  const selectedReceipt = receipts.at(-1);

  return (
    <>
      <PageHeader
        title="Receipts"
        description={
          <p>
            A future evidence store will link lifecycle actions by content
            hash. These fixture records are visibly unverified.
          </p>
        }
      >
        <Badge tone="fixture">Fixture display only</Badge>
      </PageHeader>

      <div className="stat-grid">
        <StatCard
          icon="receipt"
          label="Receipt records"
          value={String(receipts.length)}
          detail="All from synthetic fixture"
          tone="accent"
        />
        <StatCard
          icon="branch"
          label="Linked transitions"
          value={String(Math.max(0, receipts.length - 1))}
          detail="Reference chain only"
        />
        <StatCard
          icon="check"
          label="Verified digests"
          value="0"
          detail="Evidence store not connected"
          tone="warm"
        />
        <StatCard
          icon="evolution"
          label="Activations"
          value="0"
          detail="No capability exists"
        />
      </div>

      <Panel className="integrity-callout">
        <span className="integrity-icon">
          <Icon name="warning" />
        </span>
        <div>
          <p className="eyebrow">Integrity status</p>
          <h2>Unverified synthetic chain</h2>
          <p>
            These records demonstrate information hierarchy only. They are not
            cryptographic proof and must not be described as immutable or
            production evidence.
          </p>
        </div>
        <Badge tone="warning">Not verified</Badge>
      </Panel>

      <div className="receipt-layout">
        <Panel eyebrow="Oldest to newest" title="Evidence timeline">
          <ol className="receipt-timeline">
            {receipts.map((receipt, index) => (
              <li className="receipt-item" key={receipt.id}>
                <span className="receipt-marker">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="receipt-line" />
                <article>
                  <div className="receipt-title-row">
                    <div>
                      <Badge tone="fixture">{receipt.type}</Badge>
                      <h3>{receipt.title}</h3>
                    </div>
                    <time dateTime={receipt.timestamp}>
                      {timeFormatter.format(new Date(receipt.timestamp))} UTC
                    </time>
                  </div>
                  <p>{receipt.detail}</p>
                  <div className="receipt-refs">
                    <EvidenceRef>{receipt.id}</EvidenceRef>
                    <span>Object</span>
                    <EvidenceRef>{receipt.objectRef}</EvidenceRef>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </Panel>

        <aside className="receipt-aside">
          {selectedReceipt === undefined ? (
            <Panel eyebrow="Selected record" title="No receipt selected">
              <p className="detail-summary">
                This dataset contains no receipt records.
              </p>
            </Panel>
          ) : (
            <Panel eyebrow="Selected record" title={selectedReceipt.title}>
              <dl className="receipt-definition-list">
                <div>
                  <dt>Receipt ID</dt>
                  <dd>
                    <EvidenceRef>{selectedReceipt.id}</EvidenceRef>
                  </dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>Synthetic fixture</dd>
                </div>
                <div>
                  <dt>Object reference</dt>
                  <dd>
                    <EvidenceRef>{selectedReceipt.objectRef}</EvidenceRef>
                  </dd>
                </div>
                <div>
                  <dt>Previous record</dt>
                  <dd>
                    <EvidenceRef>{selectedReceipt.previousReceipt}</EvidenceRef>
                  </dd>
                </div>
                <div>
                  <dt>Integrity</dt>
                  <dd>
                    <Badge tone="warning">Unverified</Badge>
                  </dd>
                </div>
              </dl>
            </Panel>
          )}

          <Panel
            className="future-receipt"
            eyebrow="Connected evidence store"
            title="What a real receipt adds"
          >
            <ul className="check-list neutral-list">
              <li>
                <Icon name="database" />
                Evidence content digest
              </li>
              <li>
                <Icon name="branch" />
                Previous receipt digest
              </li>
              <li>
                <Icon name="spark" />
                Model and Codex provenance
              </li>
              <li>
                <Icon name="check" />
                Gate results and human decision
              </li>
              <li>
                <Icon name="evolution" />
                Activation or rollback state
              </li>
            </ul>
          </Panel>
        </aside>
      </div>
    </>
  );
}
