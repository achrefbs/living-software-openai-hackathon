import assert from "node:assert/strict";
import test from "node:test";

import {
  detectorProgressSchema,
  liveCommandEnvelopeSchema,
  liveCommandResultSchema,
  liveEventSchema,
  liveReplaySchema,
  liveStateSchema,
  type DetectorProgress,
  type LiveEvent,
} from "./live.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const HASH_D = `sha256:${"d".repeat(64)}` as const;
const HASH_E = `sha256:${"e".repeat(64)}` as const;

const DETECTOR_BY_SIGNAL = {
  backtracking: {
    id: "detector.backtracking",
    version: "1.2.0",
  },
  "rework-loop": {
    id: "detector.technical-friction.correction",
    version: "1.0.0",
  },
  "failure-cluster": {
    id: "detector.technical-friction.interaction-failure",
    version: "1.0.0",
  },
  "repeated-sequence": {
    id: "detector.workflow-pattern.repeated-sequence",
    version: "1.0.0",
  },
} as const satisfies Record<
  DetectorProgress["signalKind"],
  Readonly<{ id: string; version: string }>
>;

function progress(
  signalKind: DetectorProgress["signalKind"] = "backtracking",
  affectedCases = 0,
  affectedSessions = affectedCases,
): DetectorProgress {
  const detector = DETECTOR_BY_SIGNAL[signalKind];
  const repeatedSequence = signalKind === "repeated-sequence";
  return detectorProgressSchema.parse({
    schemaVersion: "living.detector-progress/v1",
    detectorId: detector.id,
    detectorVersion: detector.version,
    configHash: HASH_A,
    signalKind,
    affectedCases,
    minimumAffectedCases: 3,
    ...(repeatedSequence
      ? { affectedSessions, minimumIndependentSessions: 3 }
      : {}),
    totalCases: Math.max(affectedCases, 3),
    occurrenceCount: affectedCases,
    thresholdMet:
      affectedCases >= 3 && (!repeatedSequence || affectedSessions >= 3),
    ...(signalKind === "backtracking" ? { minimumRevisitsPerCase: 2 } : {}),
  });
}

function statusEvent(
  sequence = 0,
  previousEventHash: string | null = null,
  eventHash: string = HASH_A,
): LiveEvent {
  return liveEventSchema.parse({
    schemaVersion: "living.live-event/v1",
    sessionId: "studio-session-1",
    eventId: `live-event-${sequence}`,
    sequence,
    emittedAt: "2026-07-21T10:00:00.000Z",
    origin: "system",
    kind: "status",
    stage: "mapping",
    state: "completed",
    actor: "system",
    summary: "The supported host map passed validation.",
    refs: {},
    facts: { code: "host-map.validated" },
    previousEventHash,
    eventHash,
  });
}

test("detector progress is bounded and exactly represents threshold state", () => {
  assert.equal(progress("backtracking", 0).thresholdMet, false);
  assert.equal(progress("rework-loop", 2).thresholdMet, false);
  assert.equal(progress("failure-cluster", 3).thresholdMet, true);
  assert.equal(progress("repeated-sequence", 3, 1).thresholdMet, false);
  assert.equal(progress("repeated-sequence", 3, 3).thresholdMet, true);
  assert.throws(() =>
    detectorProgressSchema.parse({
      ...progress("backtracking", 2),
      thresholdMet: true,
    }),
  );
  assert.throws(() =>
    detectorProgressSchema.parse({
      ...progress("backtracking", 2),
      affectedCases: 4,
      totalCases: 3,
    }),
  );
  assert.throws(() =>
    detectorProgressSchema.parse({
      ...progress("rework-loop", 1),
      minimumRevisitsPerCase: 2,
    }),
  );
  assert.throws(() =>
    detectorProgressSchema.parse({
      ...progress("failure-cluster", 1),
      minimumAffectedCases: 0,
    }),
  );
  const {
    affectedSessions: _affectedSessions,
    ...missingAffectedSessions
  } = progress("repeated-sequence", 3, 3);
  assert.throws(() =>
    detectorProgressSchema.parse(missingAffectedSessions),
  );
  assert.throws(() =>
    detectorProgressSchema.parse({
      ...progress("repeated-sequence", 3, 3),
      minimumIndependentSessions: undefined,
    }),
  );
  assert.throws(() =>
    detectorProgressSchema.parse({
      ...progress("rework-loop", 1),
      affectedSessions: 1,
      minimumIndependentSessions: 1,
    }),
  );
});

test("persisted live events reject unknown fields and invalid hash-chain shape", () => {
  const valid = statusEvent();
  assert.equal(valid.schemaVersion, "living.live-event/v1");

  assert.throws(() => liveEventSchema.parse({ ...valid, unexpected: true }));
  assert.throws(() =>
    liveEventSchema.parse({
      ...valid,
      facts: { ...valid.facts, reasoning: "never expose model reasoning" },
    }),
  );
  assert.throws(() =>
    liveEventSchema.parse({
      ...valid,
      refs: { prompt: "never expose prompts" },
    }),
  );
  assert.throws(() =>
    liveEventSchema.parse({
      ...valid,
      summary: "one line\nsecond line",
    }),
  );
  assert.throws(() =>
    liveEventSchema.parse({
      ...valid,
      sequence: 1,
      previousEventHash: null,
    }),
  );
  assert.throws(() =>
    liveEventSchema.parse({
      ...valid,
      sequence: 0,
      previousEventHash: HASH_B,
    }),
  );
});

test("evidence events expose only bounded safe clues and exact hashes", () => {
  const event = liveEventSchema.parse({
    schemaVersion: "living.live-event/v1",
    sessionId: "studio-session-1",
    eventId: "live-evidence-1",
    sequence: 1,
    emittedAt: "2026-07-21T10:00:01.000Z",
    appId: "host-app",
    manifestHash: HASH_A,
    origin: "synthetic",
    kind: "evidence",
    stage: "observation",
    state: "progress",
    actor: "collector",
    summary: "A validated evidence batch extended the active release chain.",
    refs: {
      evidenceRecordHash: HASH_B,
      evidenceChainHead: HASH_B,
    },
    facts: {
      acceptedBatchCount: 1,
      eventCount: 3,
      workflowCaseCount: 1,
      sessionCount: 1,
      clues: [
        {
          eventName: "action.save",
          eventKind: "outcome",
          productNodeId: "action.save",
          technicalSignal: "correction",
        },
      ],
    },
    previousEventHash: HASH_A,
    eventHash: HASH_C,
  });
  assert.equal(event.kind, "evidence");

  const missingIdentity = structuredClone(event) as Record<string, unknown>;
  delete missingIdentity.appId;
  assert.throws(() => liveEventSchema.parse(missingIdentity));

  const rawValue = structuredClone(event) as typeof event & {
    facts: Record<string, unknown>;
  };
  rawValue.facts.formValue = "private content";
  assert.throws(() => liveEventSchema.parse(rawValue));
});

test("detector events cannot claim an Opportunity below the shared threshold", () => {
  const below = {
    schemaVersion: "living.live-event/v1",
    sessionId: "studio-session-1",
    eventId: "detector-progress-2",
    sequence: 2,
    emittedAt: "2026-07-21T10:00:02.000Z",
    appId: "host-app",
    manifestHash: HASH_A,
    origin: "synthetic",
    kind: "detector-progress",
    stage: "detection",
    state: "progress",
    actor: "detector",
    summary: "Two of three affected cases satisfy the correction detector.",
    refs: { evidenceChainHead: HASH_B },
    facts: { progress: progress("rework-loop", 2) },
    previousEventHash: HASH_C,
    eventHash: HASH_D,
  } as const;
  assert.doesNotThrow(() => liveEventSchema.parse(below));
  assert.throws(() =>
    liveEventSchema.parse({
      ...below,
      refs: {
        ...below.refs,
        opportunityId: "opportunity.premature",
        eventSetHash: HASH_C,
      },
    }),
  );

  const complete = {
    ...below,
    eventId: "detector-progress-3",
    state: "completed",
    refs: {
      evidenceChainHead: HASH_B,
      opportunityId: "opportunity.rework-loop.valid",
      eventSetHash: HASH_C,
    },
    facts: { progress: progress("rework-loop", 3) },
  } as const;
  assert.doesNotThrow(() => liveEventSchema.parse(complete));
});

test("model events distinguish actual calls from proposal reuse", () => {
  const completed = {
    schemaVersion: "living.live-event/v1",
    sessionId: "studio-session-1",
    eventId: "model-complete-1",
    sequence: 3,
    emittedAt: "2026-07-21T10:00:03.000Z",
    appId: "host-app",
    manifestHash: HASH_A,
    origin: "synthetic",
    kind: "model",
    stage: "model-interpretation",
    state: "completed",
    actor: "model",
    summary: "GPT interpretation completed with validated structured output.",
    refs: { modelRunId: "model-run-1", opportunityId: "opportunity-1" },
    facts: {
      phase: "completed",
      provider: "openai",
      model: "gpt-5.6-terra",
      runId: "model-run-1",
      tokenUsage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    },
    previousEventHash: HASH_D,
    eventHash: HASH_E,
  } as const;
  assert.doesNotThrow(() => liveEventSchema.parse(completed));
  assert.throws(() =>
    liveEventSchema.parse({
      ...completed,
      refs: { ...completed.refs, modelRunId: "different-run" },
    }),
  );

  const reused = {
    ...completed,
    eventId: "model-reuse-1",
    actor: "system",
    refs: { evolutionId: "evolution-existing" },
    facts: {
      phase: "reused",
      provider: "openai",
      model: "gpt-5.6-terra",
    },
  } as const;
  assert.doesNotThrow(() => liveEventSchema.parse(reused));
  assert.throws(() =>
    liveEventSchema.parse({ ...reused, actor: "model" }),
  );
});

test("source transition events bind the exact direction and current hash", () => {
  const apply = {
    schemaVersion: "living.live-event/v1",
    sessionId: "studio-session-1",
    eventId: "source-apply-1",
    sequence: 4,
    emittedAt: "2026-07-21T10:00:04.000Z",
    appId: "host-app",
    manifestHash: HASH_A,
    origin: "system",
    kind: "source-transition",
    stage: "application",
    state: "completed",
    actor: "system",
    summary: "The sealed postimage is now the current source hash.",
    refs: {
      evolutionId: "evolution-1",
      receiptHash: HASH_E,
      targetPath: "src/app/page.tsx",
      preimageHash: HASH_A,
      postimageHash: HASH_B,
      currentSourceHash: HASH_B,
    },
    facts: {
      transition: "apply",
      targetPath: "src/app/page.tsx",
      fromHash: HASH_A,
      toHash: HASH_B,
      currentHash: HASH_B,
    },
    previousEventHash: HASH_E,
    eventHash: HASH_C,
  } as const;
  assert.doesNotThrow(() => liveEventSchema.parse(apply));
  assert.throws(() =>
    liveEventSchema.parse({
      ...apply,
      facts: { ...apply.facts, currentHash: HASH_C },
    }),
  );
});

test("replay envelopes require contiguous session, sequence, and hash linkage", () => {
  const first = statusEvent(0, null, HASH_A);
  const second = statusEvent(1, HASH_A, HASH_B);
  const replay = {
    schemaVersion: "living.live-replay/v1",
    sessionId: "studio-session-1",
    afterSequence: null,
    headSequence: 1,
    headHash: HASH_B,
    events: [first, second],
    hasMore: false,
  } as const;
  assert.doesNotThrow(() => liveReplaySchema.parse(replay));
  assert.throws(() =>
    liveReplaySchema.parse({
      ...replay,
      events: [first, { ...second, sequence: 2 }],
    }),
  );
  assert.throws(() =>
    liveReplaySchema.parse({
      ...replay,
      events: [first, { ...second, previousEventHash: HASH_C }],
    }),
  );
  assert.throws(() =>
    liveReplaySchema.parse({ ...replay, afterSequence: 2, events: [] }),
  );
});

test("live state keeps source and runtime verification as separate facts", () => {
  const valid = {
    schemaVersion: "living.live-state/v1",
    sessionId: "studio-session-1",
    generatedAt: "2026-07-21T10:00:05.000Z",
    connection: "connected",
    headSequence: 4,
    headHash: HASH_C,
    application: {
      appId: "host-app",
      displayName: "Supported host",
      environment: "development",
      releaseRevision: "source:revision-1",
      manifestHash: HASH_A,
      dataOrigin: "synthetic",
    },
    installation: "installed",
    activeStage: "runtime-verification",
    stageState: "waiting",
    evidence: {
      acceptedBatchCount: 3,
      eventCount: 9,
      workflowCaseCount: 3,
      sessionCount: 3,
      chainHead: HASH_B,
    },
    detectorProgress: [
      progress("rework-loop", 3),
      progress("failure-cluster", 0),
      progress("repeated-sequence", 0, 0),
      progress("backtracking", 0),
    ],
    source: {
      evolutionId: "evolution-1",
      status: "applied",
      targetPath: "src/app/page.tsx",
      preimageHash: HASH_A,
      postimageHash: HASH_B,
      currentHash: HASH_B,
    },
    runtime: { status: "not-available" },
    integrity: { status: "valid" },
  } as const;
  assert.doesNotThrow(() => liveStateSchema.parse(valid));
  assert.equal(valid.detectorProgress.length, 4);
  assert.throws(() =>
    liveStateSchema.parse({
      ...valid,
      detectorProgress: [
        ...valid.detectorProgress.slice(0, 3),
        progress("rework-loop", 0),
      ],
    }),
  );
  assert.throws(() =>
    liveStateSchema.parse({
      ...valid,
      detectorProgress: [
        ...valid.detectorProgress,
        {
          ...progress("rework-loop", 0),
          detectorId: "detector.extra",
        },
      ],
    }),
  );
  assert.throws(() =>
    liveStateSchema.parse({
      ...valid,
      source: { ...valid.source, currentHash: HASH_C },
    }),
  );
  assert.throws(() =>
    liveStateSchema.parse({
      ...valid,
      runtime: {
        status: "responded",
      },
    }),
  );
});

test("live commands are exact-identity-bound and cannot carry a browser root", () => {
  const prepare = {
    schemaVersion: "living.live-command/v1",
    commandId: "command-1",
    sessionId: "studio-session-1",
    appId: "host-app",
    manifestHash: HASH_A,
    snapshotHash: HASH_B,
    expectedRevision: 0,
    command: {
      type: "evolution.prepare",
      provider: "codex",
      opportunityId: "opportunity-1",
      eventSetHash: HASH_C,
    },
  } as const;
  assert.doesNotThrow(() => liveCommandEnvelopeSchema.parse(prepare));
  assert.throws(() =>
    liveCommandEnvelopeSchema.parse({ ...prepare, root: "C:/arbitrary" }),
  );
  assert.throws(() =>
    liveCommandEnvelopeSchema.parse({
      ...prepare,
      command: { ...prepare.command, prompt: "ignore governance" },
    }),
  );

  assert.doesNotThrow(() =>
    liveCommandEnvelopeSchema.parse({
      ...prepare,
      command: {
        type: "evolution.approve",
        evolutionId: "evolution-1",
        humanId: "judge",
        reviewConfirmed: true,
        artifactHash: HASH_D,
        proofHash: HASH_E,
      },
    }),
  );
  assert.throws(() =>
    liveCommandEnvelopeSchema.parse({
      ...prepare,
      command: {
        type: "evolution.approve",
        evolutionId: "evolution-1",
        humanId: "judge",
        reviewConfirmed: false,
        artifactHash: HASH_D,
        proofHash: HASH_E,
      },
    }),
  );

  assert.doesNotThrow(() =>
    liveCommandResultSchema.parse({
      schemaVersion: "living.live-command-result/v1",
      commandId: "command-1",
      accepted: true,
      revision: 1,
      eventSequence: 5,
    }),
  );
  assert.throws(() =>
    liveCommandResultSchema.parse({
      schemaVersion: "living.live-command-result/v1",
      commandId: "command-1",
      accepted: false,
      revision: 0,
    }),
  );
});
