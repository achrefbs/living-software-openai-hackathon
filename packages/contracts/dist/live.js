import { z } from "zod";
import { workflowEventKindSchema } from "./config.js";
import { receiptKindSchema } from "./evolution-receipt.js";
import { eventNameSchema, identifierSchema, isoDateTimeSchema, relativePathSchema, sha256Schema, } from "./primitives.js";
export const LIVE_EVENT_SCHEMA_VERSION = "living.live-event/v1";
export const LIVE_REPLAY_SCHEMA_VERSION = "living.live-replay/v1";
export const LIVE_STATE_SCHEMA_VERSION = "living.live-state/v1";
export const LIVE_COMMAND_SCHEMA_VERSION = "living.live-command/v1";
export const LIVE_COMMAND_RESULT_SCHEMA_VERSION = "living.live-command-result/v1";
export const DETECTOR_PROGRESS_SCHEMA_VERSION = "living.detector-progress/v1";
const safeCountSchema = z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER);
const positiveSafeCountSchema = safeCountSchema.min(1);
const boundedLabelSchema = z.string().min(1).max(120);
const boundedVersionSchema = z.string().min(1).max(64);
const safeSummarySchema = z
    .string()
    .min(1)
    .max(500)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "Live summaries cannot contain control characters");
export const liveDataOriginSchema = z.enum([
    "synthetic",
    "observed",
    "mixed",
    "system",
]);
export const liveEventStageSchema = z.enum([
    "connection",
    "mapping",
    "installation",
    "observation",
    "analysis",
    "detection",
    "model-interpretation",
    "source-selection",
    "model-patch",
    "proof",
    "preparation",
    "approval",
    "application",
    "source-verification",
    "runtime-verification",
    "rollback",
]);
export const liveEventStateSchema = z.enum([
    "started",
    "progress",
    "completed",
    "failed",
    "waiting",
]);
export const liveEventActorSchema = z.enum([
    "observer",
    "collector",
    "detector",
    "model",
    "system",
    "human",
]);
export const detectorProgressSchema = z
    .object({
    schemaVersion: z.literal(DETECTOR_PROGRESS_SCHEMA_VERSION),
    detectorId: identifierSchema,
    detectorVersion: boundedVersionSchema,
    configHash: sha256Schema,
    signalKind: z.enum([
        "rework-loop",
        "failure-cluster",
        "backtracking",
        "repeated-sequence",
    ]),
    affectedCases: safeCountSchema,
    minimumAffectedCases: positiveSafeCountSchema,
    affectedSessions: safeCountSchema.optional(),
    minimumIndependentSessions: positiveSafeCountSchema.optional(),
    totalCases: safeCountSchema,
    occurrenceCount: safeCountSchema,
    thresholdMet: z.boolean(),
    minimumRevisitsPerCase: positiveSafeCountSchema.optional(),
})
    .strict()
    .superRefine((progress, context) => {
    if (progress.affectedCases > progress.totalCases) {
        context.addIssue({
            code: "custom",
            path: ["affectedCases"],
            message: "Affected detector cases cannot exceed total cases",
        });
    }
    const isRepeatedSequence = progress.signalKind === "repeated-sequence";
    if (isRepeatedSequence !== (progress.affectedSessions !== undefined) ||
        isRepeatedSequence !==
            (progress.minimumIndependentSessions !== undefined)) {
        context.addIssue({
            code: "custom",
            path: ["affectedSessions"],
            message: "Only repeated-sequence progress carries affected and minimum independent-session counts",
        });
    }
    const thresholdExpected = progress.affectedCases >= progress.minimumAffectedCases &&
        (!isRepeatedSequence ||
            (progress.affectedSessions !== undefined &&
                progress.minimumIndependentSessions !== undefined &&
                progress.affectedSessions >=
                    progress.minimumIndependentSessions));
    if (progress.thresholdMet !== thresholdExpected) {
        context.addIssue({
            code: "custom",
            path: ["thresholdMet"],
            message: "Threshold state must match the required affected-case and independent-session counts",
        });
    }
    if ((progress.signalKind === "backtracking") !==
        (progress.minimumRevisitsPerCase !== undefined)) {
        context.addIssue({
            code: "custom",
            path: ["minimumRevisitsPerCase"],
            message: "Only backtracking progress carries a revisits-per-case threshold",
        });
    }
});
export function parseDetectorProgress(input) {
    return detectorProgressSchema.parse(input);
}
export const liveEventReferenceSchema = z
    .object({
    installId: identifierSchema.optional(),
    evidenceRecordHash: sha256Schema.optional(),
    evidenceChainHead: sha256Schema.optional(),
    opportunityId: identifierSchema.optional(),
    eventSetHash: sha256Schema.optional(),
    modelRunId: identifierSchema.optional(),
    evolutionId: identifierSchema.optional(),
    artifactHash: sha256Schema.optional(),
    proofHash: sha256Schema.optional(),
    receiptHash: sha256Schema.optional(),
    receiptChainHead: sha256Schema.optional(),
    targetPath: relativePathSchema.optional(),
    preimageHash: sha256Schema.optional(),
    postimageHash: sha256Schema.optional(),
    currentSourceHash: sha256Schema.optional(),
})
    .strict();
export const liveEvidenceClueSchema = z
    .object({
    eventName: eventNameSchema,
    eventKind: workflowEventKindSchema,
    productNodeId: identifierSchema,
    technicalSignal: z
        .enum(["correction", "dead-click", "rage-click"])
        .optional(),
})
    .strict();
const statusFactsSchema = z
    .object({
    code: identifierSchema,
    errorCode: identifierSchema.optional(),
})
    .strict();
const evidenceFactsSchema = z
    .object({
    acceptedBatchCount: positiveSafeCountSchema,
    eventCount: positiveSafeCountSchema,
    workflowCaseCount: positiveSafeCountSchema,
    sessionCount: positiveSafeCountSchema,
    clues: z.array(liveEvidenceClueSchema).max(16),
})
    .strict();
const detectorFactsSchema = z
    .object({
    progress: detectorProgressSchema,
})
    .strict();
const modelFactsSchema = z
    .object({
    phase: z.enum(["requested", "completed", "reused"]),
    provider: identifierSchema,
    model: boundedLabelSchema,
    runId: identifierSchema.optional(),
    tokenUsage: z
        .object({
        inputTokens: safeCountSchema,
        outputTokens: safeCountSchema,
        totalTokens: safeCountSchema,
    })
        .strict()
        .optional(),
})
    .strict();
const proofCheckFactsSchema = z
    .object({
    checkId: identifierSchema,
    status: z.enum(["passed", "failed"]),
})
    .strict();
const sourceTransitionFactsSchema = z
    .object({
    transition: z.enum(["apply", "rollback"]),
    targetPath: relativePathSchema,
    fromHash: sha256Schema,
    toHash: sha256Schema,
    currentHash: sha256Schema,
})
    .strict();
const receiptFactsSchema = z
    .object({
    receiptCount: positiveSafeCountSchema,
    receiptKind: receiptKindSchema,
})
    .strict();
const commonLiveEventShape = {
    schemaVersion: z.literal(LIVE_EVENT_SCHEMA_VERSION),
    sessionId: identifierSchema,
    eventId: identifierSchema,
    sequence: safeCountSchema,
    emittedAt: isoDateTimeSchema,
    appId: identifierSchema.optional(),
    manifestHash: sha256Schema.optional(),
    origin: liveDataOriginSchema,
    stage: liveEventStageSchema,
    state: liveEventStateSchema,
    actor: liveEventActorSchema,
    summary: safeSummarySchema,
    refs: liveEventReferenceSchema,
    previousEventHash: sha256Schema.nullable(),
    eventHash: sha256Schema,
};
const liveStatusEventSchema = z
    .object({
    ...commonLiveEventShape,
    kind: z.literal("status"),
    facts: statusFactsSchema,
})
    .strict();
const liveEvidenceEventSchema = z
    .object({
    ...commonLiveEventShape,
    kind: z.literal("evidence"),
    stage: z.literal("observation"),
    state: z.literal("progress"),
    actor: z.literal("collector"),
    origin: z.enum(["synthetic", "observed", "mixed"]),
    facts: evidenceFactsSchema,
})
    .strict();
const liveDetectorEventSchema = z
    .object({
    ...commonLiveEventShape,
    kind: z.literal("detector-progress"),
    stage: z.literal("detection"),
    state: z.enum(["progress", "completed"]),
    actor: z.literal("detector"),
    origin: z.enum(["synthetic", "observed", "mixed"]),
    facts: detectorFactsSchema,
})
    .strict();
const liveModelEventSchema = z
    .object({
    ...commonLiveEventShape,
    kind: z.literal("model"),
    stage: z.enum(["model-interpretation", "model-patch"]),
    actor: z.enum(["model", "system"]),
    facts: modelFactsSchema,
})
    .strict();
const liveProofCheckEventSchema = z
    .object({
    ...commonLiveEventShape,
    kind: z.literal("proof-check"),
    stage: z.literal("proof"),
    state: z.enum(["completed", "failed"]),
    actor: z.literal("system"),
    facts: proofCheckFactsSchema,
})
    .strict();
const liveSourceTransitionEventSchema = z
    .object({
    ...commonLiveEventShape,
    kind: z.literal("source-transition"),
    stage: z.enum(["application", "rollback"]),
    state: z.literal("completed"),
    actor: z.literal("system"),
    facts: sourceTransitionFactsSchema,
})
    .strict();
const liveReceiptEventSchema = z
    .object({
    ...commonLiveEventShape,
    kind: z.literal("receipt"),
    stage: z.enum(["preparation", "approval", "application", "rollback"]),
    state: z.literal("completed"),
    actor: z.enum(["model", "system", "human"]),
    facts: receiptFactsSchema,
})
    .strict();
const allowedStatusActors = {
    connection: ["system"],
    mapping: ["system"],
    installation: ["system"],
    observation: ["observer", "collector", "system"],
    analysis: ["system"],
    detection: ["detector", "system"],
    "model-interpretation": ["model", "system"],
    "source-selection": ["system"],
    "model-patch": ["model", "system"],
    proof: ["system"],
    preparation: ["system"],
    approval: ["human", "system"],
    application: ["system"],
    "source-verification": ["system"],
    "runtime-verification": ["human", "system"],
    rollback: ["human", "system"],
};
export const liveEventSchema = z
    .discriminatedUnion("kind", [
    liveStatusEventSchema,
    liveEvidenceEventSchema,
    liveDetectorEventSchema,
    liveModelEventSchema,
    liveProofCheckEventSchema,
    liveSourceTransitionEventSchema,
    liveReceiptEventSchema,
])
    .superRefine((event, context) => {
    if ((event.sequence === 0) !== (event.previousEventHash === null)) {
        context.addIssue({
            code: "custom",
            path: ["previousEventHash"],
            message: "Only sequence zero may have a null previous-event hash",
        });
    }
    if (event.manifestHash !== undefined && event.appId === undefined) {
        context.addIssue({
            code: "custom",
            path: ["appId"],
            message: "A manifest hash requires an application identity",
        });
    }
    if (event.kind === "status") {
        if (!allowedStatusActors[event.stage].includes(event.actor)) {
            context.addIssue({
                code: "custom",
                path: ["actor"],
                message: `Actor '${event.actor}' cannot report stage '${event.stage}'`,
            });
        }
        if ((event.state === "failed") !== (event.facts.errorCode !== undefined)) {
            context.addIssue({
                code: "custom",
                path: ["facts", "errorCode"],
                message: "Only failed status events require an error code",
            });
        }
    }
    if ((event.kind === "evidence" || event.kind === "detector-progress") &&
        (event.appId === undefined || event.manifestHash === undefined)) {
        context.addIssue({
            code: "custom",
            path: ["appId"],
            message: "Evidence-backed events require exact application identity",
        });
    }
    if (event.kind === "evidence" &&
        (event.refs.evidenceRecordHash === undefined ||
            event.refs.evidenceChainHead === undefined)) {
        context.addIssue({
            code: "custom",
            path: ["refs"],
            message: "Evidence events require record and chain-head hashes",
        });
    }
    if (event.kind === "detector-progress") {
        if ((event.state === "completed") !== event.facts.progress.thresholdMet) {
            context.addIssue({
                code: "custom",
                path: ["state"],
                message: "Detector event state must match the threshold projection",
            });
        }
        const hasOpportunity = event.refs.opportunityId !== undefined &&
            event.refs.eventSetHash !== undefined;
        if (hasOpportunity !== event.facts.progress.thresholdMet) {
            context.addIssue({
                code: "custom",
                path: ["refs"],
                message: "Only threshold-complete detector events may carry exact Opportunity identity",
            });
        }
    }
    if (event.kind === "model") {
        const { phase, runId, tokenUsage } = event.facts;
        if (phase === "requested" && event.state !== "started") {
            context.addIssue({
                code: "custom",
                path: ["state"],
                message: "Requested model work must be reported as started",
            });
        }
        if (phase === "completed" && event.state !== "completed") {
            context.addIssue({
                code: "custom",
                path: ["state"],
                message: "Completed model work must be reported as completed",
            });
        }
        if (phase === "reused" &&
            (event.state !== "completed" || event.actor !== "system")) {
            context.addIssue({
                code: "custom",
                path: ["actor"],
                message: "Reuse is a completed system fact, not a new model call",
            });
        }
        if ((phase === "completed") !== (runId !== undefined)) {
            context.addIssue({
                code: "custom",
                path: ["facts", "runId"],
                message: "Only completed model work requires a verified run id",
            });
        }
        if (phase !== "completed" && tokenUsage !== undefined) {
            context.addIssue({
                code: "custom",
                path: ["facts", "tokenUsage"],
                message: "Token usage is available only after a model call completes",
            });
        }
        if (runId !== undefined && event.refs.modelRunId !== runId) {
            context.addIssue({
                code: "custom",
                path: ["refs", "modelRunId"],
                message: "Model fact and reference run ids must match",
            });
        }
    }
    if (event.kind === "proof-check") {
        if ((event.facts.status === "passed" && event.state !== "completed") ||
            (event.facts.status === "failed" && event.state !== "failed")) {
            context.addIssue({
                code: "custom",
                path: ["state"],
                message: "Proof-check state must match its deterministic result",
            });
        }
        if (event.refs.evolutionId === undefined ||
            event.refs.artifactHash === undefined) {
            context.addIssue({
                code: "custom",
                path: ["refs"],
                message: "Proof checks require evolution and artifact identity",
            });
        }
    }
    if (event.kind === "source-transition") {
        const expectedStage = event.facts.transition === "apply" ? "application" : "rollback";
        const expectedFrom = event.facts.transition === "apply"
            ? event.refs.preimageHash
            : event.refs.postimageHash;
        const expectedTo = event.facts.transition === "apply"
            ? event.refs.postimageHash
            : event.refs.preimageHash;
        if (event.stage !== expectedStage ||
            event.facts.currentHash !== event.facts.toHash ||
            expectedFrom !== event.facts.fromHash ||
            expectedTo !== event.facts.toHash ||
            event.refs.targetPath !== event.facts.targetPath ||
            event.refs.currentSourceHash !== event.facts.currentHash ||
            event.refs.evolutionId === undefined ||
            event.refs.receiptHash === undefined) {
            context.addIssue({
                code: "custom",
                path: ["refs"],
                message: "Source transitions require an exact sealed evolution, receipt, path, and hash direction",
            });
        }
    }
    if (event.kind === "receipt" &&
        (event.refs.evolutionId === undefined ||
            event.refs.receiptHash === undefined ||
            event.refs.receiptChainHead === undefined)) {
        context.addIssue({
            code: "custom",
            path: ["refs"],
            message: "Receipt events require evolution, receipt, and chain-head identity",
        });
    }
});
export function parseLiveEvent(input) {
    return liveEventSchema.parse(input);
}
export const liveReplaySchema = z
    .object({
    schemaVersion: z.literal(LIVE_REPLAY_SCHEMA_VERSION),
    sessionId: identifierSchema,
    afterSequence: safeCountSchema.nullable(),
    headSequence: safeCountSchema.nullable(),
    headHash: sha256Schema.nullable(),
    events: z.array(liveEventSchema).max(500),
    hasMore: z.boolean(),
})
    .strict()
    .superRefine((replay, context) => {
    if ((replay.headSequence === null) !== (replay.headHash === null)) {
        context.addIssue({
            code: "custom",
            path: ["headHash"],
            message: "Replay head sequence and hash must be present together",
        });
    }
    if (replay.headSequence === null && replay.events.length > 0) {
        context.addIssue({
            code: "custom",
            path: ["events"],
            message: "An empty durable stream cannot return replay events",
        });
    }
    let expectedSequence = replay.afterSequence === null ? 0 : replay.afterSequence + 1;
    let previousEvent;
    for (const [index, event] of replay.events.entries()) {
        if (event.sessionId !== replay.sessionId) {
            context.addIssue({
                code: "custom",
                path: ["events", index, "sessionId"],
                message: "Replay events must belong to its exact live session",
            });
        }
        if (event.sequence !== expectedSequence) {
            context.addIssue({
                code: "custom",
                path: ["events", index, "sequence"],
                message: "Replay event sequences must be contiguous",
            });
        }
        if (previousEvent !== undefined &&
            event.previousEventHash !== previousEvent.eventHash) {
            context.addIssue({
                code: "custom",
                path: ["events", index, "previousEventHash"],
                message: "Replay event hashes must form a contiguous chain",
            });
        }
        previousEvent = event;
        expectedSequence += 1;
    }
    const finalEvent = replay.events.at(-1);
    if (!replay.hasMore &&
        finalEvent !== undefined &&
        (finalEvent.sequence !== replay.headSequence ||
            finalEvent.eventHash !== replay.headHash)) {
        context.addIssue({
            code: "custom",
            path: ["headSequence"],
            message: "A complete replay page must end at its declared chain head",
        });
    }
    if (replay.afterSequence !== null &&
        replay.headSequence !== null &&
        replay.afterSequence > replay.headSequence) {
        context.addIssue({
            code: "custom",
            path: ["afterSequence"],
            message: "Replay cursor cannot be ahead of the durable event head",
        });
    }
});
export function parseLiveReplay(input) {
    return liveReplaySchema.parse(input);
}
const liveSourceStateSchema = z
    .object({
    evolutionId: identifierSchema,
    status: z.enum([
        "prepared",
        "approved",
        "applied",
        "rolled-back",
        "drifted",
    ]),
    targetPath: relativePathSchema,
    preimageHash: sha256Schema,
    postimageHash: sha256Schema,
    currentHash: sha256Schema,
})
    .strict()
    .superRefine((source, context) => {
    const expected = source.status === "applied"
        ? source.postimageHash
        : source.status === "drifted"
            ? undefined
            : source.preimageHash;
    if (expected !== undefined && source.currentHash !== expected) {
        context.addIssue({
            code: "custom",
            path: ["currentHash"],
            message: "Current source hash must match the authoritative lifecycle state",
        });
    }
});
export const liveStateSchema = z
    .object({
    schemaVersion: z.literal(LIVE_STATE_SCHEMA_VERSION),
    sessionId: identifierSchema,
    generatedAt: isoDateTimeSchema,
    connection: z.enum(["connected", "disconnected", "reconnecting"]),
    headSequence: safeCountSchema.nullable(),
    headHash: sha256Schema.nullable(),
    application: z
        .object({
        appId: identifierSchema,
        displayName: boundedLabelSchema,
        environment: z.enum(["development", "preview", "production"]),
        releaseRevision: z.string().min(1).max(160),
        manifestHash: sha256Schema.optional(),
        dataOrigin: z.enum(["synthetic", "observed", "mixed"]).optional(),
    })
        .strict()
        .optional(),
    installation: z.enum(["not-installed", "installed", "invalid"]),
    activeStage: liveEventStageSchema,
    stageState: liveEventStateSchema,
    evidence: z
        .object({
        acceptedBatchCount: safeCountSchema,
        eventCount: safeCountSchema,
        workflowCaseCount: safeCountSchema,
        sessionCount: safeCountSchema,
        chainHead: sha256Schema.nullable(),
    })
        .strict(),
    detectorProgress: z.array(detectorProgressSchema).max(4),
    source: liveSourceStateSchema.optional(),
    runtime: z
        .object({
        status: z.enum(["not-available", "responded", "verified", "failed"]),
        observedAt: isoDateTimeSchema.optional(),
    })
        .strict(),
    integrity: z
        .object({
        status: z.enum(["valid", "error"]),
        errorCode: identifierSchema.optional(),
    })
        .strict(),
})
    .strict()
    .superRefine((state, context) => {
    if ((state.headSequence === null) !== (state.headHash === null)) {
        context.addIssue({
            code: "custom",
            path: ["headHash"],
            message: "Live-state head sequence and hash must be present together",
        });
    }
    if ((state.integrity.status === "error") !==
        (state.integrity.errorCode !== undefined)) {
        context.addIssue({
            code: "custom",
            path: ["integrity", "errorCode"],
            message: "Only integrity failures require a bounded error code",
        });
    }
    const detectorIds = state.detectorProgress.map((progress) => progress.detectorId);
    if (new Set(detectorIds).size !== detectorIds.length) {
        context.addIssue({
            code: "custom",
            path: ["detectorProgress"],
            message: "Detector progress rows must have unique detector ids",
        });
    }
    if (state.evidence.acceptedBatchCount === 0 &&
        (state.evidence.eventCount !== 0 ||
            state.evidence.workflowCaseCount !== 0 ||
            state.evidence.sessionCount !== 0 ||
            state.evidence.chainHead !== null)) {
        context.addIssue({
            code: "custom",
            path: ["evidence"],
            message: "An empty evidence state cannot claim events, cases, sessions, or a chain head",
        });
    }
    if (state.evidence.acceptedBatchCount > 0 &&
        (state.evidence.eventCount === 0 || state.evidence.chainHead === null)) {
        context.addIssue({
            code: "custom",
            path: ["evidence"],
            message: "Accepted evidence batches require events and a chain head",
        });
    }
    if ((state.runtime.status === "not-available") !==
        (state.runtime.observedAt === undefined)) {
        context.addIssue({
            code: "custom",
            path: ["runtime", "observedAt"],
            message: "Only an unavailable runtime lacks an observation timestamp",
        });
    }
});
export function parseLiveState(input) {
    return liveStateSchema.parse(input);
}
export const liveCommandSchema = z.discriminatedUnion("type", [
    z
        .object({
        type: z.literal("evolution.prepare"),
        provider: z.enum(["codex", "api"]),
        opportunityId: identifierSchema,
        eventSetHash: sha256Schema,
    })
        .strict(),
    z
        .object({
        type: z.literal("evolution.approve"),
        evolutionId: identifierSchema,
        humanId: identifierSchema,
        reviewConfirmed: z.literal(true),
        artifactHash: sha256Schema,
        proofHash: sha256Schema,
    })
        .strict(),
    z
        .object({
        type: z.literal("evolution.apply"),
        evolutionId: identifierSchema,
        artifactHash: sha256Schema,
        proofHash: sha256Schema,
    })
        .strict(),
    z
        .object({
        type: z.literal("evolution.rollback"),
        evolutionId: identifierSchema,
        humanId: identifierSchema,
        artifactHash: sha256Schema,
        proofHash: sha256Schema,
    })
        .strict(),
]);
export const liveCommandEnvelopeSchema = z
    .object({
    schemaVersion: z.literal(LIVE_COMMAND_SCHEMA_VERSION),
    commandId: identifierSchema,
    sessionId: identifierSchema,
    appId: identifierSchema,
    manifestHash: sha256Schema,
    snapshotHash: sha256Schema,
    expectedRevision: safeCountSchema,
    command: liveCommandSchema,
})
    .strict();
export function parseLiveCommandEnvelope(input) {
    return liveCommandEnvelopeSchema.parse(input);
}
export const liveCommandResultSchema = z
    .object({
    schemaVersion: z.literal(LIVE_COMMAND_RESULT_SCHEMA_VERSION),
    commandId: identifierSchema,
    accepted: z.boolean(),
    revision: safeCountSchema,
    eventSequence: safeCountSchema.optional(),
    error: z
        .object({
        code: identifierSchema,
        message: safeSummarySchema,
    })
        .strict()
        .optional(),
})
    .strict()
    .superRefine((result, context) => {
    if (result.accepted === (result.error !== undefined)) {
        context.addIssue({
            code: "custom",
            path: ["error"],
            message: "Only rejected live commands contain a bounded error",
        });
    }
});
export function parseLiveCommandResult(input) {
    return liveCommandResultSchema.parse(input);
}
//# sourceMappingURL=live.js.map