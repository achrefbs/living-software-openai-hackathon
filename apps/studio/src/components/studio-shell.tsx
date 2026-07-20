import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { NextActionCard } from "@/components/next-action-card";
import { KeyValueList, PreviewLinks } from "@/components/ui";
import { SurfaceNav } from "@/components/surface-nav";
import { journeyStages, nextAction } from "@/lib/journey";
import { studioAppHref } from "@/lib/studio-routes";
import type { StudioDataset } from "@/lib/studio-types";

function shortRef(value: string): string {
  return value.startsWith("sha256:") ? value.slice(7, 19) : value.slice(0, 19);
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function StudioShell({
  dataset,
  children,
}: {
  dataset: StudioDataset;
  children: ReactNode;
}) {
  const app = dataset.app;
  const initials = app.name
    .split(/[\s-]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const stages = journeyStages(dataset);
  const next = nextAction(dataset);

  return (
    <div className="studio-shell">
      <aside className="sidebar">
        <Link className="brand" href={studioAppHref(app.id, "map")}>
          <span className="brand-mark">
            <Icon name="spark" />
          </span>
          <span>
            <strong>Living</strong>
            <small>Studio</small>
          </span>
        </Link>

        <div className="app-switcher">
          <span className="app-monogram" aria-hidden="true">
            {initials || "LS"}
          </span>
          <span>
            <small>Application under analysis</small>
            <strong>{app.name}</strong>
          </span>
        </div>

        <SurfaceNav appId={app.id} stages={stages} />

        <NextActionCard appId={app.id} {...next} />

        <div className="sidebar-note">
          <span className="status-dot status-dot-cyan" />
          <div>
            <strong>{app.source.statusTitle}</strong>
            <span>{app.source.statusDetail}</span>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-context">
            <span className="fixture-pill">
              <span className="status-dot status-dot-cyan" />
              {app.source.label}
            </span>
            <span className="topbar-plain">{app.source.context}</span>
            <details className="provenance-menu">
              <summary>
                <Icon name="shield" />
                Provenance
              </summary>
              <div className="provenance-popover">
                <h2>Where this data comes from</h2>
                <p>
                  <strong>{app.source.noticeTitle}</strong> {app.source.notice}
                </p>
                <p>{dataset.notice}</p>
                <KeyValueList
                  items={[
                    { term: "Data origin", value: app.source.label },
                    { term: "Environment", value: app.environment },
                    {
                      term: "Captured at",
                      value:
                        dateFormatter.format(new Date(app.lastObservedAt)) +
                        " UTC",
                    },
                    { term: "Release revision", value: app.version, code: true },
                  ]}
                />
              </div>
            </details>
          </div>
          <div className="topbar-actions">
            <span className="topbar-release" title={app.version}>
              rev <code>{shortRef(app.version)}</code>
            </span>
            <PreviewLinks />
          </div>
        </header>

        <main className="studio-content">{children}</main>
      </div>
    </div>
  );
}
