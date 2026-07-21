import type { LiveEvent, LiveState } from "@living-software/contracts";

export type PipelineBranch = "main" | "source" | "runtime" | "recovery";

export type PipelineStagePresentation = Readonly<{
  stage: LiveEvent["stage"];
  label: string;
  branch: PipelineBranch;
  state: LiveEvent["state"];
  current: boolean;
}>;

export const MAIN_PIPELINE = [
  ["connection", "Connect"],
  ["mapping", "Map"],
  ["installation", "Install"],
  ["observation", "Observe"],
  ["analysis", "Analyze"],
  ["detection", "Detect"],
  ["model-interpretation", "Interpret"],
  ["source-selection", "Select source"],
  ["model-patch", "Draft patch"],
  ["proof", "Prove"],
  ["preparation", "Prepare"],
  ["approval", "Approve"],
  ["application", "Apply source"],
] as const satisfies readonly (readonly [LiveEvent["stage"], string])[];

export const PIPELINE_BRANCHES = [
  ["source-verification", "Verify current source", "source"],
  ["runtime-verification", "Verify runtime", "runtime"],
  ["rollback", "Rollback", "recovery"],
] as const satisfies readonly (
  readonly [LiveEvent["stage"], string, Exclude<PipelineBranch, "main">]
)[];

function completedMainStage(state: LiveState): LiveEvent["stage"] | null {
  switch (state.source?.status) {
    case "prepared":
      return "preparation";
    case "approved":
      return "approval";
    case "applied":
    case "rolled-back":
      return "application";
    case "drifted":
    case undefined:
      return null;
  }
}

function mainStageState(
  state: LiveState,
  stage: LiveEvent["stage"],
  index: number,
): LiveEvent["state"] {
  const completedStage = completedMainStage(state);
  const completedIndex = completedStage === null
    ? -1
    : MAIN_PIPELINE.findIndex(([candidate]) => candidate === completedStage);
  if (index <= completedIndex) return "completed";

  const activeIndex = MAIN_PIPELINE.findIndex(
    ([candidate]) => candidate === state.activeStage,
  );
  if (activeIndex === -1) return "waiting";
  if (stage === state.activeStage) return state.stageState;
  return index < activeIndex ? "completed" : "waiting";
}

function sourceVerificationState(state: LiveState): LiveEvent["state"] {
  if (state.activeStage === "source-verification") return state.stageState;
  if (state.source?.status === "drifted") return "failed";
  return state.source === undefined ? "waiting" : "completed";
}

function runtimeVerificationState(state: LiveState): LiveEvent["state"] {
  if (state.activeStage === "runtime-verification") return state.stageState;
  switch (state.runtime.status) {
    case "not-available":
      return "waiting";
    case "responded":
      return "progress";
    case "verified":
      return "completed";
    case "failed":
      return "failed";
  }
}

function rollbackState(state: LiveState): LiveEvent["state"] {
  if (state.source?.status === "rolled-back") return "completed";
  return state.activeStage === "rollback" ? state.stageState : "waiting";
}

/**
 * Presents authoritative state, not guessed chronology. Source verification,
 * runtime verification, and rollback are branches: a post-rollback source
 * verification must never make the completed rollback appear to be waiting.
 */
export function deriveLivePipeline(state: LiveState): Readonly<{
  main: readonly PipelineStagePresentation[];
  branches: readonly PipelineStagePresentation[];
}> {
  return {
    main: MAIN_PIPELINE.map(([stage, label], index) => ({
      stage,
      label,
      branch: "main",
      state: mainStageState(state, stage, index),
      current: state.activeStage === stage,
    })),
    branches: PIPELINE_BRANCHES.map(([stage, label, branch]) => ({
      stage,
      label,
      branch,
      state: stage === "source-verification"
        ? sourceVerificationState(state)
        : stage === "runtime-verification"
          ? runtimeVerificationState(state)
          : rollbackState(state),
      current: state.activeStage === stage,
    })),
  };
}
