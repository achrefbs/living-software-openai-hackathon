"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/icons";
import type { JourneyStage } from "@/lib/journey";
import {
  isCurrentStudioSurface,
  studioAppHref,
} from "@/lib/studio-routes";

export function NextActionCard({
  appId,
  detail,
  label,
  stageId,
}: {
  appId: string;
  detail: string;
  label: string;
  stageId: JourneyStage["id"];
}) {
  const pathname = usePathname();
  const href = studioAppHref(appId, stageId);

  if (isCurrentStudioSurface(pathname, appId, stageId)) {
    return null;
  }

  return (
    <Link className="next-action" href={href}>
      <span className="next-action-label">Current focus</span>
      <span className="next-action-title">
        {label}
        <Icon name="arrow" />
      </span>
      <span className="next-action-detail">{detail}</span>
    </Link>
  );
}
