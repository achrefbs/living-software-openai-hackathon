export type EvolutionPreviewStage = {
  id: string;
  icon: "database" | "spark" | "file" | "shield" | "user" | "evolution";
  title: string;
  status: string;
  state: "available" | "missing" | "locked";
  detail: string;
};

/**
 * Describes only lifecycle stages supported by the loaded snapshot. Keeping
 * this derivation outside the page prevents the locked preview from claiming
 * evidence that does not exist.
 */
export function evolutionPreviewStages(
  hasDeterministicEvidence: boolean,
): EvolutionPreviewStage[] {
  return [
    hasDeterministicEvidence
      ? {
          id: "evidence",
          icon: "database",
          title: "Deterministic evidence",
          status: "Available",
          state: "available",
          detail:
            "A deterministic detection and its bounded evidence package exist in this snapshot. This is the only stage with real data today.",
        }
      : {
          id: "evidence",
          icon: "database",
          title: "Deterministic evidence",
          status: "No threshold crossed",
          state: "missing",
          detail:
            "Workflow analysis completed, but no deterministic opportunity crossed its configured threshold. There is no evidence package to interpret yet.",
        },
    {
      id: "interpretation",
      icon: "spark",
      title: "Model interpretation",
      status: hasDeterministicEvidence
        ? "Not run — the missing prerequisite"
        : "Locked — needs detected evidence",
      state: hasDeterministicEvidence ? "missing" : "locked",
      detail: hasDeterministicEvidence
        ? "GPT-5.6 would receive the bounded evidence package — aggregate signals and pseudonymous references only — and could propose an explanation of the friction plus a draft scope for a change. It has not run on this snapshot, and Studio will not fabricate its output."
        : "GPT-5.6 may interpret a bounded evidence package only after a deterministic detector produces one. No model request is available for this snapshot.",
    },
    {
      id: "contract",
      icon: "file",
      title: "Capability contract",
      status: "Not created",
      state: "locked",
      detail:
        "A person would correct the model's proposal and confirm exactly what a change may read, what it may affect, and what it must never do — before anything is generated.",
    },
    {
      id: "proof",
      icon: "shield",
      title: "Proof gates",
      status: "Not run",
      state: "locked",
      detail:
        "A generated artifact would face deterministic checks — schema, policy, and behavioral tests — that must pass before a human even sees an approval request.",
    },
    {
      id: "approval",
      icon: "user",
      title: "Human approval",
      status: "Not requested",
      state: "locked",
      detail:
        "A person would inspect the artifact and its proof results and decide. Nothing activates without this explicit decision.",
    },
    {
      id: "activation",
      icon: "evolution",
      title: "Bounded activation",
      status: "Not activated",
      state: "locked",
      detail:
        "Only after approval would the capability install — reversibly, with a rollback path and a receipt for every step.",
    },
  ];
}
