import type { StudioDataset } from "@/lib/studio-types";

export type StageStatus = "complete" | "current" | "locked";

export type JourneyStage = {
  id: "map" | "workflows" | "opportunities" | "evolutions" | "receipts";
  step: number;
  title: string;
  surface: string;
  status: StageStatus;
  summary: string;
  lockReason?: string;
};

/**
 * Derives the five-stage journey state from validated dataset facts only.
 * Locked stages stay locked until their real prerequisite exists in the data.
 */
export function journeyStages(dataset: StudioDataset): JourneyStage[] {
  const manifestNodes = dataset.productMap.totalNodes;
  const explorableNodes = dataset.productMap.nodes.length;
  const cases = dataset.workflows.observedCases;
  const detected = dataset.opportunities.filter(
    (opportunity) => opportunity.status === "detected",
  ).length;
  const hasEvolution = dataset.evolution !== null;
  const hasReceipts = dataset.receipts !== null && dataset.receipts.length > 0;

  const mapped = manifestNodes > 0;
  const observed = cases > 0;

  return [
    {
      id: "map",
      step: 1,
      title: "Map",
      surface: "Product Map",
      status: mapped ? "complete" : "current",
      summary: mapped
        ? explorableNodes + " explorable capabilities"
        : "Awaiting manifest",
    },
    {
      id: "workflows",
      step: 2,
      title: "Observe",
      surface: "Workflow Explorer",
      status: observed ? "complete" : mapped ? "current" : "locked",
      summary: observed ? `${cases} captured cases` : "Awaiting evidence",
      lockReason: observed || mapped ? undefined : "Needs a mapped product first.",
    },
    {
      id: "opportunities",
      step: 3,
      title: "Detect",
      surface: "Opportunity Feed",
      status: observed ? (hasEvolution ? "complete" : "current") : "locked",
      summary: observed
        ? detected === 0
          ? "No threshold crossed"
          : `${detected} pattern${detected === 1 ? "" : "s"} detected`
        : "Awaiting cases",
      lockReason: observed
        ? undefined
        : "Detectors need captured workflow cases to run.",
    },
    {
      id: "evolutions",
      step: 4,
      title: "Review",
      surface: "Evolution Review",
      status: hasEvolution ? "current" : "locked",
      summary: hasEvolution
        ? "Evidence ready"
        : detected > 0
          ? "No model run for this snapshot"
          : "No proposal exists",
      lockReason: hasEvolution
        ? undefined
        : detected > 0
          ? "Needs a GPT-5.6 interpretation, which has not run on this snapshot."
          : "Needs a deterministic opportunity before interpretation can run.",
    },
    {
      id: "receipts",
      step: 5,
      title: "Audit",
      surface: "Receipts",
      status: hasReceipts ? "current" : "locked",
      summary: hasReceipts
        ? `${dataset.receipts?.length ?? 0} fixture records`
        : "No lifecycle has run",
      lockReason: hasReceipts
        ? undefined
        : "Receipts are only written when the governed lifecycle actually runs.",
    },
  ];
}

/**
 * The single most useful next action for the current dataset, used by the
 * shell so the viewer always knows where the story continues.
 */
export function nextAction(dataset: StudioDataset): {
  label: string;
  detail: string;
  stageId: JourneyStage["id"];
} {
  const detected = dataset.opportunities.filter(
    (opportunity) => opportunity.status === "detected",
  ).length;
  if (dataset.evolution !== null) {
    return {
      label: "Continue the review",
      detail: "An evolution record is loaded and waiting on its next gate.",
      stageId: "evolutions",
    };
  }
  if (detected > 0) {
    return {
      label: "Inspect the detected pattern",
      detail: "A deterministic detector crossed its threshold.",
      stageId: "opportunities",
    };
  }
  if (dataset.workflows.observedCases > 0) {
    return {
      label: "Explore observed workflows",
      detail: "Captured cases are validated and ready to read.",
      stageId: "workflows",
    };
  }
  return {
    label: "Explore the product map",
    detail: "Start with what the software can do.",
    stageId: "map",
  };
}
