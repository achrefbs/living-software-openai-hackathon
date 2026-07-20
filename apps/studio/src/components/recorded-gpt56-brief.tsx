import { Icon } from "@/components/icons";
import {
  Badge,
  EvidenceRef,
  KeyValueList,
  TechnicalDetails,
} from "@/components/ui";
import type {
  RecordedGpt56Run,
  RecordedGpt56RunRelation,
} from "@/lib/gpt56-proof";

const recordedAtFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function titleCase(value: string): string {
  return value
    .replaceAll(/[-_.:]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .replace(/^./u, (character) => character.toUpperCase());
}

function metricValue(name: string, observed: number): string {
  if (name.endsWith("_ratio")) return `${Math.round(observed * 100)}%`;
  return new Intl.NumberFormat("en").format(observed);
}

function relationDetail(relation: RecordedGpt56RunRelation): string {
  if (relation.kind === "exact") {
    return "App, manifest, opportunity, and event-set identities match this snapshot.";
  }
  return (
    "Separate — " +
    relation.mismatches.map((field) => titleCase(field)).join(", ") +
    " differ."
  );
}

export function RecordedGpt56Brief({
  currentAppId,
  currentAppName,
  relation,
  run,
}: {
  currentAppId: string;
  currentAppName: string;
  relation: RecordedGpt56RunRelation;
  run: RecordedGpt56Run;
}) {
  const draft = run.draft;
  const isSeparate = relation.kind === "separate";

  return (
    <section
      aria-labelledby="recorded-gpt56-title"
      className="panel model-proof-panel"
    >
      <div className="panel-heading model-proof-heading">
        <div>
          <p className="eyebrow">Recorded model-run evidence</p>
          <h2 id="recorded-gpt56-title">{draft.title}</h2>
        </div>
        <div className="model-proof-badges">
          <Badge tone="positive">
            Codex CLI run · GPT-5.6 Terra requested
          </Badge>
          <Badge tone="fixture">
            {titleCase(run.evidence.dataOrigin)} evidence
          </Badge>
        </div>
      </div>

      <div
        className={
          "model-proof-boundary model-proof-boundary-" + relation.kind
        }
      >
        <span aria-hidden="true" className="model-proof-boundary-icon">
          <Icon name={isSeparate ? "warning" : "shield"} />
        </span>
        <div>
          <strong>
            {isSeparate
              ? "Separate neutral evidence run — not attached to " + currentAppId
              : "Evidence identity matches the active snapshot"}
          </strong>
          <p>
            {isSeparate
              ? `This committed run belongs to ${run.evidence.appId}. Studio shows it beside ${currentAppName} as independent product evidence; it does not unlock this snapshot, create a capability contract, or become a lifecycle receipt.`
              : "The recorded app, manifest, opportunity, and event-set identities match. The output is still a draft that requires human review and grants no lifecycle authority."}
          </p>
        </div>
      </div>

      <p className="model-proof-interpretation">{draft.interpretation}</p>

      <dl className="signal-grid model-proof-facts">
        <div className="signal-card">
          <dt>Transport model requested</dt>
          <dd>{run.request.transportRequestedModel}</dd>
        </div>
        <div className="signal-card">
          <dt>Evidence scope</dt>
          <dd>
            {run.evidence.subjectCount} subjects · {run.evidence.sessionCount} sessions
            {" "}· {run.evidence.eventCount} events
          </dd>
        </div>
        <div className="signal-card">
          <dt>Actual response model</dt>
          <dd>Not reported by Codex CLI</dd>
        </div>
        <div className="signal-card">
          <dt>Local validation</dt>
          <dd>
            Schema {run.localValidation.schema} · References{" "}
            {run.localValidation.references} · Governance{" "}
            {run.localValidation.governance}
          </dd>
        </div>
        <div className="signal-card">
          <dt>Proposal state</dt>
          <dd>Draft · human review required</dd>
        </div>
      </dl>

      <div className="model-proof-grid">
        <section className="model-proof-card">
          <p className="eyebrow">What the recorded run proposed</p>
          <h3>{titleCase(draft.proposedChange.kind)}</h3>
          <p>{draft.proposedChange.summary}</p>
          <div className="model-proof-value">
            <Icon name="spark" />
            <div>
              <strong>Potential user value</strong>
              <p>{draft.proposedChange.userValue}</p>
            </div>
          </div>
          <div className="model-proof-node-list" aria-label="Affected product nodes">
            {draft.proposedChange.affectedProductNodeIds.map((nodeId) => (
              <EvidenceRef key={nodeId}>{nodeId}</EvidenceRef>
            ))}
          </div>
        </section>

        <section className="model-proof-card">
          <p className="eyebrow">What remains forbidden</p>
          <h3>No capability exists yet</h3>
          <ul className="model-proof-list model-proof-prohibitions">
            {draft.proposedChange.excludedWork.map((item) => (
              <li key={item}>
                <Icon name="lock" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="model-proof-grid">
        <section className="model-proof-card">
          <p className="eyebrow">Evidence cited by the model</p>
          <h3>{draft.evidenceCitations.sampleEventCount} sampled events</h3>
          <dl className="model-proof-metrics">
            {draft.evidenceCitations.metrics.map((metric) => (
              <div key={metric.name}>
                <dt>{titleCase(metric.name)}</dt>
                <dd>{metricValue(metric.name, metric.observed)}</dd>
              </div>
            ))}
          </dl>
          <EvidenceRef>{run.evidence.eventSetHash}</EvidenceRef>
        </section>

        <section className="model-proof-card">
          <p className="eyebrow">How the hypothesis would be tested</p>
          <h3>Success criteria</h3>
          <ul className="model-proof-list">
            {draft.successCriteria.map((criterion) => (
              <li key={criterion.metric}>
                <Icon name="check" />
                <span>
                  <strong>
                    {titleCase(criterion.metric)} · {criterion.direction}
                  </strong>
                  {criterion.target} {criterion.measurementWindow}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <details className="model-proof-caveats">
        <summary>
          Risks, open questions, and limits
          <Icon name="chevron" />
        </summary>
        <div className="model-proof-caveat-grid">
          <div>
            <h3>Risks</h3>
            <ul>
              {draft.risks.map((risk) => <li key={risk}>{risk}</li>)}
            </ul>
          </div>
          <div>
            <h3>Open questions</h3>
            <ul>
              {draft.openQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Limitations</h3>
            <ul>
              {draft.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <div className="model-proof-authority">
        <span aria-hidden="true" className="model-proof-authority-icon">
          <Icon name="lock" />
        </span>
        <div>
          <strong>Activation blocked</strong>
          <p>
            This is a validated model proposal, not an approved contract or
            generated artifact. Human review is required and activation remains
            forbidden.
          </p>
        </div>
        <Badge tone="locked">Human authority</Badge>
      </div>

      <TechnicalDetails summary="Recorded model and evidence provenance">
        <KeyValueList
          items={[
            { term: "Relation to snapshot", value: relationDetail(relation) },
            { term: "Proof application", value: run.evidence.appId, code: true },
            {
              term: "Proof manifest",
              value: run.evidence.manifestHash,
              code: true,
            },
            {
              term: "Proof opportunity",
              value: run.evidence.opportunityId,
              code: true,
            },
            {
              term: "Recorded at",
              value: recordedAtFormatter.format(new Date(run.recordedAt)) + " UTC",
            },
            {
              term: "Logical boundary model",
              value: run.request.boundaryRequestedModel,
              code: true,
            },
            {
              term: "Transport model requested",
              value: run.request.transportRequestedModel,
              code: true,
            },
            {
              term: "Actual response model",
              value: "Not reported by Codex CLI",
            },
            { term: "Source commit", value: run.sourceCommit, code: true },
            {
              term: "Codex thread",
              value: run.provenance.codexThreadId,
              code: true,
            },
            {
              term: "Token usage",
              value:
                `${run.provenance.tokenUsage.inputTokens.toLocaleString("en")} input · ` +
                `${run.provenance.tokenUsage.outputTokens.toLocaleString("en")} output · ` +
                `${run.provenance.tokenUsage.reasoningOutputTokens.toLocaleString("en")} reasoning`,
            },
            {
              term: "Request fingerprint",
              value: run.request.boundaryRequestSha256,
              code: true,
            },
            {
              term: "Schema fingerprint",
              value: run.request.outputSchemaSha256,
              code: true,
            },
          ]}
        />
      </TechnicalDetails>
    </section>
  );
}
