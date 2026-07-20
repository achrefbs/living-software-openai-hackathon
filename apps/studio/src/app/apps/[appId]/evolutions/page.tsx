import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { RecordedGpt56Brief } from "@/components/recorded-gpt56-brief";
import {
  Badge,
  EvidenceRef,
  PageHeader,
  Panel,
  SurfaceState,
} from "@/components/ui";
import { journeyStages } from "@/lib/journey";
import { evolutionPreviewStages } from "@/lib/lifecycle-preview";
import {
  getCommittedGpt56Run,
  recordedRunLinkageNote,
  relateGpt56RunToDataset,
} from "@/lib/gpt56-proof";
import { getPreviewMode, getStudioDataset } from "@/lib/studio-data";
import { studioAppHref } from "@/lib/studio-routes";

export const metadata: Metadata = { title: "Evolution Review" };

export default async function EvolutionsPage({
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
        returnHref={studioAppHref(appId, "evolutions")}
      />
    );
  }

  const recordedRun = await getCommittedGpt56Run();
  const recordedRunRelation = relateGpt56RunToDataset(recordedRun, dataset);
  const recordedRunPanel = (
    <RecordedGpt56Brief
      currentAppId={dataset.app.id}
      currentAppName={dataset.app.name}
      relation={recordedRunRelation}
      run={recordedRun}
    />
  );

  const evolution = dataset.evolution;
  if (evolution === null) {
    const stage = journeyStages(dataset)[3];
    const detection = dataset.opportunities.find(
      (opportunity) => opportunity.status === "detected",
    );
    const previewStages = evolutionPreviewStages(detection !== undefined);
    return (
      <>
        <PageHeader
          stage={stage && { step: 4, title: "Review", status: stage.status }}
          title={
            detection === undefined
              ? "Review is locked — no proposal exists"
              : "Review is locked — honestly"
          }
          description={
            detection === undefined ? (
              <p>
                Deterministic workflow analysis completed, but no opportunity
                crossed its threshold. Without detected evidence there is
                nothing for GPT-5.6 or a human to review, so the downstream
                lifecycle remains locked.
              </p>
            ) : (
              <p>
                This is where a human would govern a proposed change. The
                prerequisite is a GPT-5.6 interpretation of the detected
                evidence, and <strong>no model has run on this snapshot</strong>,
                so every stage below is shown as it would be — not as if it had
                happened.
              </p>
            )
          }
        >
          <Badge tone="locked">
            {detection === undefined ? "No proposal" : "Not connected"}
          </Badge>
        </PageHeader>

        {recordedRunPanel}

        <section
          aria-labelledby="locked-lifecycle-title"
          className="panel lifecycle-preview"
        >
          <div className="panel-heading">
            <div>
              <h2 id="locked-lifecycle-title">
                The governed lifecycle, stage by stage
              </h2>
              <p className="panel-subtitle">
                What each stage would do once connected — and why none of them
                have run.
              </p>
            </div>
          </div>
          <ol className="locked-lifecycle">
            {previewStages.map((step) => (
              <li className={"locked-stage locked-" + step.state} key={step.id}>
                <span aria-hidden="true" className="locked-stage-icon">
                  <Icon name={step.icon} />
                </span>
                <div className="locked-stage-body">
                  <div className="locked-stage-top">
                    <h3>{step.title}</h3>
                    <Badge
                      tone={
                        step.state === "available"
                          ? "positive"
                          : step.state === "missing"
                            ? "warning"
                            : "locked"
                      }
                    >
                      {step.status}
                    </Badge>
                  </div>
                  <p>{step.detail}</p>
                  {step.id === "evidence" && detection !== undefined && (
                    <Link
                      className="button button-secondary button-inline"
                      href={studioAppHref(appId, "opportunities")}
                    >
                      <Icon name="return" />
                      Back to the detected evidence
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <Panel
          className="boundary-panel"
          title="What this snapshot actually contains"
          action={<Badge tone="neutral">Honest boundary</Badge>}
        >
          <p>
            A Product Manifest, verified workflow analysis, and metrics.
            {detection === undefined ? (
              <>
                {" "}No deterministic opportunity crossed its configured
                threshold.
              </>
            ) : (
              <>
                {" "}The snapshot also contains one deterministic opportunity
                (<EvidenceRef>{detection.detector}</EvidenceRef>).
              </>
            )}{" "}
            The active lifecycle snapshot contains no attached GPT-5.6
            interpretation, capability contract, proof result, approval,
            generated artifact, or activation state.{" "}
            {recordedRunLinkageNote(recordedRunRelation)}
          </p>
        </Panel>
      </>
    );
  }
  const opportunity = dataset.opportunities.find(
    (item) => item.id === evolution.opportunityId,
  );

  return (
    <>
      <PageHeader
        title="Evolution Review"
        description={
          <p>
            Evidence, interpretation, contract, proof, approval, and activation
            remain separate decisions.
          </p>
        }
      >
        <Badge tone="info">Evidence ready</Badge>
      </PageHeader>

      {recordedRunPanel}

      <Panel className="lifecycle-panel">
        <ol className="lifecycle">
          {evolution.lifecycle.map((step, index) => (
            <li
              className={"lifecycle-step lifecycle-" + step.status}
              key={step.id}
            >
              <span className="lifecycle-marker">
                {step.status === "complete" ? (
                  <Icon name="check" />
                ) : step.status === "locked" ? (
                  <Icon name="lock" />
                ) : (
                  String(index + 1)
                )}
              </span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="review-grid">
        <div className="review-main">
          <Panel
            eyebrow="Stage 1 · deterministic"
            title="Evidence package"
            action={<Badge tone="positive">Available</Badge>}
          >
            <p className="detail-summary">{opportunity?.summary}</p>
            <dl className="signal-grid">
              {opportunity?.signals.map((signal) => (
                <div className="signal-card" key={signal.label}>
                  <dt>{signal.label}</dt>
                  <dd>{signal.value}</dd>
                </div>
              ))}
            </dl>
            <div className="evidence-ref-list">
              {opportunity?.evidenceRefs.map((reference) => (
                <EvidenceRef key={reference}>{reference}</EvidenceRef>
              ))}
            </div>
          </Panel>

          <Panel
            eyebrow="Stage 2 · model proposal"
            title="Interpretation"
            action={<Badge tone="neutral">Not run for this fixture</Badge>}
          >
            <div className="not-run-panel">
              <span className="not-run-icon">
                <Icon name="spark" />
              </span>
              <div>
                <h3>No GPT-5.6 interpretation exists for this fixture.</h3>
                <p>
                  The future request is bounded to{" "}
                  {evolution.hypothesis.promptInput.toLowerCase()} Raw
                  user-entered content remains excluded.
                </p>
              </div>
            </div>
            <button className="button button-primary" disabled type="button">
              Run interpretation
            </button>
            <p className="control-note">
              Disabled in the fixture-only shell. The separate recorded run
              above does not unlock this fixture. Even an exact evidence match
              would only label the draft related; this read-only slice has no
              lifecycle action that can enable the control.
            </p>
          </Panel>

          <Panel
            eyebrow="Stage 3 · human-confirmed boundary"
            title="Capability contract"
            action={<Badge tone="neutral">Not created</Badge>}
          >
            <div className="contract-columns">
              <div>
                <p className="eyebrow">Potential inputs</p>
                <ul className="check-list neutral-list">
                  {evolution.contract.requestedInputs.map((item) => (
                    <li key={item}>
                      <Icon name="database" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow">Potential effects</p>
                <ul className="check-list neutral-list">
                  {evolution.contract.requestedEffects.map((item) => (
                    <li key={item}>
                      <Icon name="arrow" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow">Prohibitions</p>
                <ul className="check-list prohibition-list">
                  {evolution.contract.prohibitions.map((item) => (
                    <li key={item}>
                      <Icon name="lock" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="control-note">
              These are fixture placeholders, not an approved contract. A
              person must correct the interpretation before confirming them.
            </p>
          </Panel>
        </div>

        <aside className="review-aside">
          <Panel eyebrow="Proof matrix" title="Mandatory gates">
            <div className="gate-list">
              {evolution.gates.map((gate) => (
                <div className="gate-row" key={gate.id}>
                  <span className="gate-icon">
                    <Icon name="clock" />
                  </span>
                  <div>
                    <strong>{gate.label}</strong>
                    <small>{gate.description}</small>
                  </div>
                  <Badge tone="neutral">{gate.status}</Badge>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            className="authority-panel"
            eyebrow="Human authority"
            title="Activation"
          >
            <div className="authority-lock">
              <Icon name="lock" />
              <p>
                Activation is locked until the contract is confirmed, every
                mandatory gate passes, and a human approves the artifact.
              </p>
            </div>
            <button
              className="button button-primary button-full"
              disabled
              type="button"
            >
              Approve and activate
            </button>
            <button
              className="button button-secondary button-full"
              disabled
              type="button"
            >
              Roll back
            </button>
            <p className="control-note">
              Both controls stay disabled until a confirmed contract and
              passing gates exist.
            </p>
          </Panel>

          <Panel
            className="state-panel"
            eyebrow="Current state"
            title={evolution.title}
          >
            <dl className="compact-definition-list">
              <div>
                <dt>Evolution</dt>
                <dd>{evolution.id}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{evolution.state.replace("_", " ")}</dd>
              </div>
              <div>
                <dt>Artifact</dt>
                <dd>None</dd>
              </div>
              <div>
                <dt>Approval</dt>
                <dd>Not requested</dd>
              </div>
            </dl>
          </Panel>
        </aside>
      </div>
    </>
  );
}
