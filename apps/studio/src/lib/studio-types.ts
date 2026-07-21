export type Provenance = "scanned" | "declared" | "inferred";
export type ProductNodeKind = "surface" | "action" | "api" | "entity";
export type PreviewMode = "data" | "empty" | "disconnected" | "error";
export type OpportunitySignalKind =
  | "rework-loop"
  | "backtracking"
  | "abandonment"
  | "failure-cluster"
  | "repeated-sequence"
  | "handoff-delay"
  | "model-discovery";

export type StudioSource = {
  kind: "fixture" | "captured_snapshot";
  label: string;
  statusTitle: string;
  statusDetail: string;
  context: string;
  noticeTitle: string;
  notice: string;
  dataOrigin: "fixture" | "synthetic" | "observed" | "mixed";
};


export type StudioApp = {
  id: string;
  name: string;
  description: string;
  environment: string;
  version: string;
  connection: "offline_fixture" | "captured_snapshot";
  lastObservedAt: string;
  source: StudioSource;
};

export type ProductNode = {
  id: string;
  kind: ProductNodeKind;
  label: string;
  description: string;
  provenance: Provenance;
  confidence: number;
  source: string;
};

export type ProductEdge = {
  from: string;
  to: string;
  relation: string;
};

export type WorkflowStep = {
  id: string;
  label: string;
};

export type WorkflowVariant = {
  id: string;
  name: string;
  description: string;
  cases: number;
  share: number;
  durationSeconds: number;
  durationLabel: "Median time" | "Average time";
  stepCount: number;
  stepLabel: "Median steps" | "Journey steps";
  outcomeRate: number;
  tone: "healthy" | "watch" | "friction";
  steps: WorkflowStep[];
};

export type EvidenceCase = {
  id: string;
  variantId: string;
  sessionCount: number;
  eventCount: number;
  durationSeconds: number;
  outcome: string;
  actions: string[];
};

export type Opportunity = {
  id: string;
  title: string;
  summary: string;
  status: "detected" | "watching";
  signalKind: OpportunitySignalKind;
  detector: string;
  detectorVersion: string;
  confidence: number;
  impact: "medium" | "low";
  affectedCases: number;
  evidenceRefs: string[];
  signals: Array<{ label: string; value: string }>;
  nextStep: string;
};

export type LifecycleStep = {
  id: string;
  label: string;
  status: "complete" | "current" | "locked";
  detail: string;
};

export type Gate = {
  id: string;
  label: string;
  status: "pending";
  description: string;
};

export type Evolution = {
  id: string;
  opportunityId: string;
  title: string;
  state: "evidence_ready";
  lifecycle: LifecycleStep[];
  hypothesis: {
    status: "not_run";
    promptInput: string;
    note: string;
  };
  contract: {
    status: "not_created";
    requestedInputs: string[];
    requestedEffects: string[];
    prohibitions: string[];
  };
  gates: Gate[];
};

export type Receipt = {
  id: string;
  type: string;
  title: string;
  timestamp: string;
  source: "synthetic_fixture";
  objectRef: string;
  previousReceipt: string | null;
  integrity: "unverified_fixture";
  detail: string;
};

export type StudioEvidenceIdentity = {
  appId: string;
  snapshotHash: string | null;
  manifestHash: string | null;
  opportunityId: string | null;
  eventSetHash: string | null;
};

export type StudioDataset = {
  schemaVersion: number;
  notice: string;
  app: StudioApp;
  evidenceIdentity: StudioEvidenceIdentity;
  productMap: {
    nodes: ProductNode[];
    edges: ProductEdge[];
    totalNodes: number;
    totalEdges: number;
    omittedNodes: number;
  };
  workflows: {
    observedCases: number;
    durationSeconds: number;
    durationLabel: "Median duration" | "Average duration";
    steps: number;
    stepsLabel: "Median steps" | "Average journey steps";
    outcomeRate: number;
    variants: WorkflowVariant[];
    evidenceCases: EvidenceCase[];
  };
  opportunities: Opportunity[];
  evolution: Evolution | null;
  receipts: Receipt[] | null;
};
