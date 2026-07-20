"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import type { JourneyStage } from "@/lib/journey";
import { studioAppHref } from "@/lib/studio-routes";

const stageIcons: Record<JourneyStage["id"], IconName> = {
  map: "map",
  workflows: "workflow",
  opportunities: "opportunity",
  evolutions: "evolution",
  receipts: "receipt",
};

function StageMarker({ stage }: { stage: JourneyStage }) {
  if (stage.status === "complete") {
    return (
      <span className="stage-marker marker-complete">
        <Icon name="check" />
      </span>
    );
  }
  if (stage.status === "locked") {
    return (
      <span className="stage-marker marker-locked">
        <Icon name="lock" />
      </span>
    );
  }
  return <span className="stage-marker marker-current">{stage.step}</span>;
}

export function SurfaceNav({
  appId,
  stages,
}: {
  appId: string;
  stages: JourneyStage[];
}) {
  const pathname = usePathname();

  return (
    <nav className="journey-nav" aria-label="Evidence pipeline stages">
      <p className="journey-nav-title" id="journey-nav-label">
        Pipeline
      </p>
      <ol className="journey-rail" aria-labelledby="journey-nav-label">
        {stages.map((stage) => {
          const href = studioAppHref(appId, stage.id);
          const active = pathname.startsWith(href);
          const statusText =
            stage.status === "complete"
              ? "complete"
              : stage.status === "locked"
                ? "locked"
                : "in progress";
          return (
            <li
              className={
                "journey-stage stage-" +
                stage.status +
                (active ? " stage-active" : "")
              }
              key={stage.id}
            >
              <Link
                aria-current={active ? "page" : undefined}
                className="stage-link"
                href={href}
                title={stage.lockReason}
              >
                <StageMarker stage={stage} />
                <span className="stage-text">
                  <span className="stage-title">
                    {stage.title}
                    <span className="visually-hidden">
                      {" — " + stage.surface + ", " + statusText}
                    </span>
                  </span>
                  <span aria-hidden="true" className="stage-summary">
                    {stage.summary}
                  </span>
                </span>
                <span aria-hidden="true" className="stage-glyph">
                  <Icon name={stageIcons[stage.id]} />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
