import type { OpportunitySignalKind } from "@/lib/studio-types";

type WorkflowSignalCopy = {
  term: string;
  badge: string;
  definition: string;
  recordedSignal: string;
};

const SIGNAL_COPY: Record<OpportunitySignalKind, WorkflowSignalCopy> = {
  "rework-loop": {
    term: "Correction pattern",
    badge: "Correction pattern",
    definition:
      "Repeated corrections or retries recorded within the same journey.",
    recordedSignal: "correction pattern",
  },
  backtracking: {
    term: "Backtracking",
    badge: "Backtracking",
    definition:
      "Returning to a screen already visited — a recorded journey signal.",
    recordedSignal: "backtracking",
  },
  abandonment: {
    term: "Abandonment",
    badge: "Abandonment",
    definition:
      "A captured journey ended without its configured success event.",
    recordedSignal: "abandonment",
  },
  "failure-cluster": {
    term: "Interaction-failure cluster",
    badge: "Interaction failures",
    definition:
      "A concentration of recorded dead-click, rage-click, or error signals.",
    recordedSignal: "interaction failures",
  },
  "repeated-sequence": {
    term: "Repeated sequence",
    badge: "Repeated sequence",
    definition:
      "The same sequence of journey steps occurred repeatedly within a case.",
    recordedSignal: "repeated sequence",
  },
  "handoff-delay": {
    term: "Handoff delay",
    badge: "Handoff delay",
    definition:
      "A captured transition between workflow stages took longer than its threshold.",
    recordedSignal: "handoff delay",
  },
};

const GENERIC_COPY: WorkflowSignalCopy = {
  term: "Detector signal",
  badge: "Detected signal",
  definition:
    "A deterministic measurement evaluated against a configured threshold.",
  recordedSignal: "detector signal",
};

export function workflowSignalCopy(
  kind: OpportunitySignalKind | null,
): WorkflowSignalCopy {
  return kind === null ? GENERIC_COPY : SIGNAL_COPY[kind];
}

export function workflowSignalFactNote({
  kind,
  affectedCases,
  totalCases,
  frictionVariants,
  totalVariants,
}: {
  kind: OpportunitySignalKind | null;
  affectedCases: number;
  totalCases: number;
  frictionVariants: number;
  totalVariants: number;
}): string {
  if (kind === null) {
    return "No workflow opportunity crossed a detector threshold";
  }
  if (kind === "backtracking" && frictionVariants > 0) {
    return (
      "Revisits appear in " +
      frictionVariants +
      " of " +
      totalVariants +
      " journeys"
    );
  }
  const signal = workflowSignalCopy(kind).recordedSignal;
  return (
    affectedCases +
    " of " +
    totalCases +
    " cases crossed the " +
    signal +
    " threshold"
  );
}

export function workflowSignalFootnote({
  kind,
  affectedCases,
  totalCases,
}: {
  kind: OpportunitySignalKind;
  affectedCases: number;
  totalCases: number;
}): string {
  const signal = workflowSignalCopy(kind).recordedSignal;
  return (
    " The deterministic detector flags only the cases whose " +
    signal +
    " crossed its threshold — " +
    affectedCases +
    " of " +
    totalCases +
    " did."
  );
}

export function journeyRepeatSummary(
  kind: OpportunitySignalKind | null,
  revisitCount: number,
): string {
  if (kind === "backtracking") {
    return revisitCount === 0
      ? "no backtracking"
      : revisitCount +
          " backtracking step" +
          (revisitCount === 1 ? "" : "s");
  }
  return revisitCount === 0
    ? "no repeated journey steps"
    : revisitCount +
        " repeated journey step" +
        (revisitCount === 1 ? "" : "s");
}
