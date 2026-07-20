import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import type { PreviewMode } from "@/lib/studio-types";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "critical" | "info" | "fixture" | "locked";
}) {
  return <span className={"badge badge-" + tone}>{children}</span>;
}

export function Panel({
  children,
  className = "",
  title,
  eyebrow,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <section className={"panel " + className}>
      {(title || eyebrow || action) && (
        <div className="panel-heading">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  stage,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  stage?: { step: number; title: string; status: "complete" | "current" | "locked" };
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {stage ? (
          <p className={"stage-chip stage-chip-" + stage.status}>
            {stage.status === "locked" && <Icon name="lock" />}
            Stage {stage.step} of 5 · {stage.title}
            {stage.status === "locked" && <span> · locked</span>}
          </p>
        ) : (
          eyebrow && <p className="eyebrow">{eyebrow}</p>
        )}
        <h1>{title}</h1>
        <div className="page-description">{description}</div>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

export function StatCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: IconName;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "accent" | "warm";
}) {
  return (
    <div className={"stat-card stat-" + tone}>
      <div className="stat-icon">
        <Icon name={icon} />
      </div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        <p className="stat-detail">{detail}</p>
      </div>
    </div>
  );
}

export function FactStrip({
  facts,
  footnote,
}: {
  facts: Array<{
    label: string;
    value: string;
    note?: string;
    tone?: "default" | "accent" | "warm" | "quiet";
  }>;
  footnote?: string;
}) {
  return (
    <div className="fact-strip-wrap">
      <dl className="fact-strip">
        {facts.map((fact) => (
          <div className={"fact fact-" + (fact.tone ?? "default")} key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
            {fact.note && <p>{fact.note}</p>}
          </div>
        ))}
      </dl>
      {footnote && <p className="fact-footnote">{footnote}</p>}
    </div>
  );
}

export function Glossary({
  items,
}: {
  items: Array<{ term: string; definition: string }>;
}) {
  return (
    <dl className="glossary">
      {items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.definition}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TechnicalDetails({
  summary = "Technical provenance",
  children,
  className = "",
}: {
  summary?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={"tech-details " + className}>
      <summary>
        <Icon name="chevron" />
        {summary}
      </summary>
      <div className="tech-details-body">{children}</div>
    </details>
  );
}

export function KeyValueList({
  items,
}: {
  items: Array<{ term: string; value: ReactNode; code?: boolean }>;
}) {
  return (
    <dl className="key-value-list">
      {items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.code ? <code>{item.value}</code> : item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const percent = Math.round(value * 100);
  return (
    <div
      aria-label={label + ": " + percent + "%"}
      className="progress-track"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span className="progress-value" style={{ width: percent + "%" }} />
    </div>
  );
}

export function EvidenceRef({ children }: { children: ReactNode }) {
  return <code className="evidence-ref">{children}</code>;
}

const stateCopy: Record<
  Exclude<PreviewMode, "data">,
  { icon: IconName; eyebrow: string; title: string; description: string }
> = {
  empty: {
    icon: "database",
    eyebrow: "No evidence yet",
    title: "This surface is ready for its first dataset.",
    description:
      "Install the host adapter or replay a fixture. Studio will keep this state explicit until valid evidence arrives.",
  },
  disconnected: {
    icon: "branch",
    eyebrow: "Host disconnected",
    title: "The last known state is preserved.",
    description:
      "Studio cannot currently reach the host. No events are being claimed as live, and lifecycle actions remain unavailable.",
  },
  error: {
    icon: "warning",
    eyebrow: "Evidence unavailable",
    title: "Studio could not validate this surface.",
    description:
      "The current payload did not pass its schema boundary. Existing evidence was not overwritten.",
  },
};

export function SurfaceState({
  kind,
  returnHref,
}: {
  kind: Exclude<PreviewMode, "data">;
  returnHref?: string;
}) {
  const copy = stateCopy[kind];
  return (
    <section className="surface-state" aria-live="polite">
      <div className="surface-state-icon">
        <Icon name={copy.icon} />
      </div>
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1>{copy.title}</h1>
      <p>{copy.description}</p>
      {returnHref && (
        <a className="button button-secondary" href={returnHref}>
          Return to current data
        </a>
      )}
    </section>
  );
}

export function PreviewLinks() {
  return (
    <details className="preview-menu">
      <summary>Preview states</summary>
      <div className="preview-popover">
        <a href="?">Current data</a>
        <a href="?preview=empty">Empty</a>
        <a href="?preview=disconnected">Disconnected</a>
        <a href="?preview=error">Invalid data</a>
      </div>
    </details>
  );
}
