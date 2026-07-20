import type { SVGProps } from "react";

export type IconName =
  | "map"
  | "workflow"
  | "opportunity"
  | "evolution"
  | "receipt"
  | "spark"
  | "arrow"
  | "check"
  | "lock"
  | "clock"
  | "database"
  | "branch"
  | "warning"
  | "search"
  | "chevron"
  | "close"
  | "layers"
  | "shield"
  | "user"
  | "file"
  | "undo"
  | "return";

const paths: Record<IconName, React.ReactNode> = {
  map: (
    <>
      <path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z" />
      <path d="M8 3v15M16 6v15" />
    </>
  ),
  workflow: (
    <>
      <rect x="3" y="4" width="6" height="5" rx="1.5" />
      <rect x="15" y="15" width="6" height="5" rx="1.5" />
      <path d="M9 6.5h3a4 4 0 0 1 4 4V15M13 12l3 3 3-3" />
    </>
  ),
  opportunity: (
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M8.4 14.6A7 7 0 1 1 15.6 14.6C14.6 15.4 14 16.5 14 18h-4c0-1.5-.6-2.6-1.6-3.4Z" />
    </>
  ),
  evolution: (
    <>
      <path d="M4 17a8 8 0 1 0 1.2-10.1" />
      <path d="M4 4v5h5M9 12l2 2 4-5" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  spark: (
    <>
      <path d="m12 2 1.4 5.1L18 9l-4.6 1.9L12 16l-1.4-5.1L6 9l4.6-1.9L12 2Z" />
      <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />
    </>
  ),
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  check: <path d="m5 12 4 4L19 6" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="5" r="2" />
      <circle cx="18" cy="7" r="2" />
      <circle cx="6" cy="19" r="2" />
      <path d="M6 7v10M8 11h4a6 6 0 0 0 6-2" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5M12 17.5h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12.5 9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v6c0 4.4 3 7.4 7 9 4-1.6 7-4.6 7-9V6l-7-3Z" />
      <path d="m9 11.5 2.2 2.2L15.5 9" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </>
  ),
  undo: (
    <>
      <path d="M4 9h10a6 6 0 0 1 0 12H8" />
      <path d="M8 5 4 9l4 4" />
    </>
  ),
  return: (
    <>
      <path d="M20 6v5a4 4 0 0 1-4 4H5" />
      <path d="m9 11-4 4 4 4" />
    </>
  ),
};

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
