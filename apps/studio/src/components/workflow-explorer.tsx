"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, EvidenceRef } from "@/components/ui";
import { formatDuration, formatPercent } from "@/lib/format";
import type {
  EvidenceCase,
  OpportunitySignalKind,
  WorkflowStep,
  WorkflowVariant,
} from "@/lib/studio-types";
import {
  journeyRepeatSummary,
  workflowSignalCopy,
} from "@/lib/workflow-signal";

const toneCopy = {
  healthy: { label: "Direct path", badge: "positive" as const },
  watch: { label: "Under review", badge: "warning" as const },
};

function variantToneCopy(
  tone: WorkflowVariant["tone"],
  signalKind: OpportunitySignalKind | null,
) {
  if (tone === "friction") {
    return {
      label: workflowSignalCopy(signalKind).badge,
      badge: "critical" as const,
    };
  }
  return toneCopy[tone];
}

function outcomeSentence(variant: WorkflowVariant): string {
  if (variant.cases === 1) {
    return variant.outcomeRate > 0
      ? "Its one captured case ended with a recorded success event."
      : "Its one captured case ended without a recorded success event.";
  }
  return `${formatPercent(variant.outcomeRate)} of its ${variant.cases} captured cases ended with a recorded success event.`;
}

export function buildWorkflowJourney(steps: readonly WorkflowStep[]) {
  const firstSeen = new Map<string, number>();
  return steps.map((step, index) => {
    const first = firstSeen.get(step.id);
    if (first === undefined) firstSeen.set(step.id, index);
    return {
      step,
      index,
      revisitOf: first,
    };
  });
}

export function WorkflowExplorer({
  variants,
  evidenceCases,
  defaultVariantId,
  signalKind,
}: {
  variants: WorkflowVariant[];
  evidenceCases: EvidenceCase[];
  defaultVariantId: string;
  signalKind: OpportunitySignalKind | null;
}) {
  const [selectedId, setSelectedId] = useState(defaultVariantId);
  const selected =
    variants.find((variant) => variant.id === selectedId) ?? variants[0];

  const journey = useMemo(() => {
    if (selected === undefined) return [];
    return buildWorkflowJourney(selected.steps);
  }, [selected]);

  if (selected === undefined) return null;

  const revisits = journey.filter((entry) => entry.revisitOf !== undefined);
  const selectedCases = evidenceCases.filter(
    (item) => item.variantId === selected.id,
  );

  return (
    <div className="workflow-layout">
      <div
        aria-label="Workflow variants — select one to inspect its journey"
        className="variant-list"
        role="group"
      >
        {variants.map((variant) => {
          const tone = variantToneCopy(variant.tone, signalKind);
          const active = variant.id === selected.id;
          return (
            <button
              aria-pressed={active}
              className={"variant-card" + (active ? " variant-selected" : "")}
              key={variant.id}
              onClick={() => setSelectedId(variant.id)}
              type="button"
            >
              <span className="variant-top">
                <Badge tone={tone.badge}>{tone.label}</Badge>
                <span className="variant-cases">
                  {variant.cases} case{variant.cases === 1 ? "" : "s"}
                </span>
              </span>
              <span className="variant-name">{variant.name}</span>
              <span className="variant-facts">
                {variant.stepCount} steps · {formatDuration(variant.durationSeconds)}
                {" · "}
                {variant.outcomeRate > 0
                  ? variant.cases === 1
                    ? "succeeded"
                    : formatPercent(variant.outcomeRate) + " succeeded"
                  : "no success event"}
              </span>
              <span aria-hidden="true" className="variant-open">
                {active ? "Shown on the right" : "Inspect journey"}
                <Icon name="arrow" />
              </span>
            </button>
          );
        })}
      </div>

      <section aria-live="polite" className="panel sequence-panel">
        <div className="panel-heading">
          <div>
            <h2>{selected.name}</h2>
            <p className="sequence-subtitle">
              One captured journey shape · {selected.stepCount} steps ·{" "}
              {formatDuration(selected.durationSeconds)} ·{" "}
              {journeyRepeatSummary(signalKind, revisits.length)}
            </p>
          </div>
          <Badge tone={variantToneCopy(selected.tone, signalKind).badge}>
            {variantToneCopy(selected.tone, signalKind).label}
          </Badge>
        </div>

        <p className="sequence-outcome">{outcomeSentence(selected)}</p>

        <ol className="sequence-list">
          {journey.map((entry) => (
            <li
              className={
                entry.revisitOf === undefined
                  ? "sequence-step"
                  : "sequence-step repeated-step"
              }
              key={entry.index + entry.step.id}
            >
              <span className="sequence-number" aria-hidden="true">
                {String(entry.index + 1).padStart(2, "0")}
              </span>
              <span className="sequence-label">{entry.step.label}</span>
              {entry.revisitOf !== undefined && (
                <span className="sequence-revisit">
                  <Icon name="return" />
                  back to step {entry.revisitOf + 1}
                </span>
              )}
            </li>
          ))}
        </ol>

        <details className="tech-details">
          <summary>
            <Icon name="chevron" />
            Technical evidence for this variant
          </summary>
          <div className="tech-details-body">
            <dl className="key-value-list">
              <div>
                <dt>Variant ID</dt>
                <dd>
                  <code>{selected.id}</code>
                </dd>
              </div>
              {selectedCases.map((item) => (
                <div key={item.id}>
                  <dt>Case</dt>
                  <dd>
                    <code>{item.id}</code>
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              Captured cases expose aggregate session and event counts only. No
              request text, form values, or personal information is stored or
              displayed.
            </p>
            {selectedCases.length > 0 && (
              <p>
                {selectedCases
                  .map(
                    (item) =>
                      `${item.eventCount} events across ${item.sessionCount} session${item.sessionCount === 1 ? "" : "s"}`,
                  )
                  .join(" · ")}
              </p>
            )}
          </div>
        </details>
      </section>
    </div>
  );
}

export function CaseTable({
  evidenceCases,
  variants,
}: {
  evidenceCases: EvidenceCase[];
  variants: WorkflowVariant[];
}) {
  const variantName = new Map(
    variants.map((variant) => [variant.id, variant.name]),
  );
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption className="visually-hidden">
          Captured workflow cases with duration, events, and outcome
        </caption>
        <thead>
          <tr>
            <th scope="col">Journey</th>
            <th scope="col">Duration</th>
            <th scope="col">Events</th>
            <th scope="col">Sessions</th>
            <th scope="col">Outcome</th>
            <th scope="col">Case ID</th>
          </tr>
        </thead>
        <tbody>
          {evidenceCases.map((item) => (
            <tr key={item.id}>
              <td>{variantName.get(item.variantId) ?? item.variantId}</td>
              <td>{formatDuration(item.durationSeconds)}</td>
              <td>{item.eventCount}</td>
              <td>{item.sessionCount}</td>
              <td>
                <Badge
                  tone={
                    item.outcome === "resolved" || item.outcome === "succeeded"
                      ? "positive"
                      : "neutral"
                  }
                >
                  {item.outcome === "unknown" ? "no success event" : item.outcome}
                </Badge>
              </td>
              <td>
                <EvidenceRef>
                  {item.id.length > 18 ? item.id.slice(0, 18) + "…" : item.id}
                </EvidenceRef>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
