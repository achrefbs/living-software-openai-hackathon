export type StudioSurface =
  | "map"
  | "workflows"
  | "opportunities"
  | "evolutions"
  | "compare"
  | "receipts";

/**
 * Builds a Studio URL without allowing contract-valid application IDs to
 * create extra path segments. Next decodes the segment after matching it.
 */
export function studioAppHref(
  appId: string,
  surface: StudioSurface,
): string {
  return "/apps/" + encodeURIComponent(appId) + "/" + surface;
}

export function isCurrentStudioSurface(
  pathname: string,
  appId: string,
  surface: StudioSurface,
): boolean {
  const href = studioAppHref(appId, surface);
  return pathname === href || pathname.startsWith(href + "/");
}
