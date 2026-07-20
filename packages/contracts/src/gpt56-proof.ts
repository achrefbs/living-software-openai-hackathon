import { z } from "zod";

import {
  identifierSchema,
  isoDateTimeSchema,
  sha256Schema,
} from "./primitives.js";

export const GPT56_PROOF_SCHEMA_VERSION = "living.gpt56-proof/v2" as const;

const boundedText = (maximum: number) => z.string().min(1).max(maximum);
const safeCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveSafeCount = safeCount.positive();
const sourceCommitSchema = z
  .string()
  .regex(
    /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/,
    "Expected a lowercase 40- or 64-character source commit",
  );

const evidenceOriginSchema = z.enum(["observed", "synthetic", "mixed"]);
const evidenceClaimScopeSchema = z.enum([
  "synthetic-only",
  "mixed-evidence-only",
  "observed-window-only",
]);

function expectedClaimScope(
  origin: z.infer<typeof evidenceOriginSchema>,
): z.infer<typeof evidenceClaimScopeSchema> {
  switch (origin) {
    case "synthetic":
      return "synthetic-only";
    case "mixed":
      return "mixed-evidence-only";
    case "observed":
      return "observed-window-only";
  }
}

export const gpt56EvolutionBriefSchema = z
  .object({
    schemaVersion: z.literal("living.evolution-brief/v1"),
    briefId: identifierSchema,
    appId: identifierSchema,
    opportunityId: identifierSchema,
    manifestHash: sha256Schema,
    title: boundedText(160),
    interpretation: boundedText(2_000),
    proposedChange: z
      .object({
        kind: z.enum([
          "workflow-assist",
          "information-surface",
          "automation-draft",
        ]),
        summary: boundedText(1_000),
        userValue: boundedText(1_000),
        affectedProductNodeIds: z.array(identifierSchema).min(1).max(32),
        excludedWork: z.array(boundedText(300)).max(16),
      })
      .strict(),
    evidenceCitations: z
      .object({
        eventSetHash: sha256Schema,
        sampleEventIds: z.array(identifierSchema).min(1).max(256),
        metrics: z
          .array(
            z
              .object({
                name: identifierSchema,
                observed: z.number().finite(),
              })
              .strict(),
          )
          .min(1)
          .max(32),
      })
      .strict(),
    successCriteria: z
      .array(
        z
          .object({
            metric: identifierSchema,
            direction: z.enum(["increase", "decrease"]),
            target: boundedText(300),
            measurementWindow: boundedText(300),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    risks: z.array(boundedText(500)).min(1).max(12),
    openQuestions: z.array(boundedText(500)).max(12),
    limitations: z.array(boundedText(500)).min(1).max(12),
    evidenceScope: z
      .object({
        origin: evidenceOriginSchema,
        claimScope: evidenceClaimScopeSchema,
        productionGeneralizationAllowed: z.literal(false),
      })
      .strict(),
    governance: z
      .object({
        status: z.literal("draft"),
        humanApprovalRequired: z.literal(true),
        activationAllowed: z.literal(false),
      })
      .strict(),
  })
  .strict()
  .superRefine((brief, context) => {
    const affectedNodeIds = brief.proposedChange.affectedProductNodeIds;
    if (new Set(affectedNodeIds).size !== affectedNodeIds.length) {
      context.addIssue({
        code: "custom",
        path: ["proposedChange", "affectedProductNodeIds"],
        message: "Affected product node ids must be unique",
      });
    }

    const sampleEventIds = brief.evidenceCitations.sampleEventIds;
    if (new Set(sampleEventIds).size !== sampleEventIds.length) {
      context.addIssue({
        code: "custom",
        path: ["evidenceCitations", "sampleEventIds"],
        message: "Sample event ids must be unique",
      });
    }

    const metricNames = brief.evidenceCitations.metrics.map(
      (metric) => metric.name,
    );
    const citedMetricNames = new Set(metricNames);
    if (citedMetricNames.size !== metricNames.length) {
      context.addIssue({
        code: "custom",
        path: ["evidenceCitations", "metrics"],
        message: "Cited metric names must be unique",
      });
    }
    for (const [index, criterion] of brief.successCriteria.entries()) {
      if (!citedMetricNames.has(criterion.metric)) {
        context.addIssue({
          code: "custom",
          path: ["successCriteria", index, "metric"],
          message: "Success criteria must reference a cited metric",
        });
      }
    }

    if (
      brief.evidenceScope.claimScope !==
      expectedClaimScope(brief.evidenceScope.origin)
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidenceScope", "claimScope"],
        message: "Evidence claim scope must match its data origin",
      });
    }
  });

export type Gpt56EvolutionBrief = z.infer<
  typeof gpt56EvolutionBriefSchema
>;

const intelligenceTokenUsageSchema = z
  .object({
    inputTokens: safeCount,
    cachedInputTokens: safeCount,
    outputTokens: safeCount,
    reasoningOutputTokens: safeCount,
  })
  .strict();

export const intelligenceProvenanceSchema = z
  .object({
    provider: z.literal("openai"),
    transport: z.enum(["responses-api", "codex-cli"]),
    boundaryRequestedModel: z.literal("gpt-5.6"),
    transportRequestedModel: z.enum(["gpt-5.6", "gpt-5.6-terra"]),
    actualResponseModel: z.string().min(1).max(256).nullable(),
    responseId: z.string().min(1).max(256).nullable(),
    codexThreadId: z.string().min(1).max(256).nullable(),
    responseStoreRequested: z.union([z.literal(false), z.null()]),
    localSessionPersisted: z.union([z.literal(false), z.null()]),
    tokenUsage: intelligenceTokenUsageSchema.nullable(),
    evidenceAliases: z
      .array(
        z
          .object({
            alias: z.string().regex(/^evidence-[0-9]{3,}$/),
            eventId: identifierSchema,
          })
          .strict(),
      )
      .min(1)
      .max(256),
  })
  .strict()
  .superRefine((provenance, context) => {
    const aliases = provenance.evidenceAliases.map((entry) => entry.alias);
    if (new Set(aliases).size !== aliases.length) {
      context.addIssue({
        code: "custom",
        path: ["evidenceAliases"],
        message: "Evidence aliases must be unique",
      });
    }
    const eventIds = provenance.evidenceAliases.map((entry) => entry.eventId);
    if (new Set(eventIds).size !== eventIds.length) {
      context.addIssue({
        code: "custom",
        path: ["evidenceAliases"],
        message: "Aliased evidence event ids must be unique",
      });
    }
  });

export type IntelligenceProvenance = z.infer<
  typeof intelligenceProvenanceSchema
>;

export const gpt56ProofSchema = z
  .object({
    schemaVersion: z.literal(GPT56_PROOF_SCHEMA_VERSION),
    recordedAt: isoDateTimeSchema,
    selectedProvider: z.enum(["codex", "api"]),
    source: z
      .object({
        commit: sourceCommitSchema,
        dirty: z.literal(false),
      })
      .strict(),
    request: z
      .object({
        boundaryRequestedModel: z.literal("gpt-5.6"),
        transportRequestedModel: z.enum(["gpt-5.6", "gpt-5.6-terra"]),
        reasoningEffort: z.literal("medium"),
        responseStoreRequested: z.union([z.literal(false), z.null()]),
        schemaName: z.literal("living_evolution_brief"),
        boundaryRequestSha256: sha256Schema,
        outputSchemaSha256: sha256Schema,
      })
      .strict(),
    evidence: z
      .object({
        appId: identifierSchema,
        manifestHash: sha256Schema,
        opportunityId: identifierSchema,
        eventSetHash: sha256Schema,
        eventCount: positiveSafeCount,
        sessionCount: positiveSafeCount,
        subjectCount: positiveSafeCount,
        dataOrigin: evidenceOriginSchema,
      })
      .strict(),
    localValidation: z
      .object({
        schema: z.literal("passed"),
        references: z.literal("passed"),
        governance: z.literal("passed"),
      })
      .strict(),
    result: z
      .object({
        draft: gpt56EvolutionBriefSchema,
        provenance: intelligenceProvenanceSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((proof, context) => {
    const { draft, provenance } = proof.result;

    if (
      proof.request.transportRequestedModel !==
      provenance.transportRequestedModel
    ) {
      context.addIssue({
        code: "custom",
        path: ["request", "transportRequestedModel"],
        message: "Request and result transport models must match",
      });
    }

    if (proof.selectedProvider === "codex") {
      if (
        proof.request.transportRequestedModel !== "gpt-5.6-terra" ||
        proof.request.responseStoreRequested !== null ||
        provenance.transport !== "codex-cli" ||
        provenance.transportRequestedModel !== "gpt-5.6-terra" ||
        provenance.actualResponseModel !== null ||
        provenance.responseId !== null ||
        provenance.codexThreadId === null ||
        provenance.responseStoreRequested !== null ||
        provenance.localSessionPersisted !== false ||
        provenance.tokenUsage === null
      ) {
        context.addIssue({
          code: "custom",
          path: ["result", "provenance"],
          message: "Codex proof provenance is internally contradictory",
        });
      }
    } else if (
      proof.request.transportRequestedModel !== "gpt-5.6" ||
      proof.request.responseStoreRequested !== false ||
      provenance.transport !== "responses-api" ||
      provenance.transportRequestedModel !== "gpt-5.6" ||
      provenance.actualResponseModel === null ||
      !/^gpt-5\.6(?:$|[-_])/u.test(provenance.actualResponseModel) ||
      provenance.responseId === null ||
      provenance.codexThreadId !== null ||
      provenance.responseStoreRequested !== false ||
      provenance.localSessionPersisted !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["result", "provenance"],
        message: "Responses API proof provenance is internally contradictory",
      });
    }

    const identityPairs: ReadonlyArray<
      readonly [unknown, unknown, readonly (string | number)[], string]
    > = [
      [draft.appId, proof.evidence.appId, ["result", "draft", "appId"], "appId"],
      [
        draft.opportunityId,
        proof.evidence.opportunityId,
        ["result", "draft", "opportunityId"],
        "opportunityId",
      ],
      [
        draft.manifestHash,
        proof.evidence.manifestHash,
        ["result", "draft", "manifestHash"],
        "manifestHash",
      ],
      [
        draft.evidenceCitations.eventSetHash,
        proof.evidence.eventSetHash,
        ["result", "draft", "evidenceCitations", "eventSetHash"],
        "eventSetHash",
      ],
      [
        draft.evidenceScope.origin,
        proof.evidence.dataOrigin,
        ["result", "draft", "evidenceScope", "origin"],
        "data origin",
      ],
    ];
    for (const [actual, expected, path, label] of identityPairs) {
      if (actual !== expected) {
        context.addIssue({
          code: "custom",
          path: [...path],
          message: "Draft " + label + " must match proof evidence",
        });
      }
    }

    const aliasedEventIds = new Set(
      provenance.evidenceAliases.map((entry) => entry.eventId),
    );
    for (const [index, eventId] of
      draft.evidenceCitations.sampleEventIds.entries()) {
      if (!aliasedEventIds.has(eventId)) {
        context.addIssue({
          code: "custom",
          path: [
            "result",
            "draft",
            "evidenceCitations",
            "sampleEventIds",
            index,
          ],
          message: "Every cited event must resolve through proof provenance",
        });
      }
    }

    if (
      provenance.evidenceAliases.length > proof.evidence.eventCount ||
      draft.evidenceCitations.sampleEventIds.length > proof.evidence.eventCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence", "eventCount"],
        message: "Evidence references cannot exceed the recorded event count",
      });
    }
    if (
      proof.evidence.sessionCount > proof.evidence.eventCount ||
      proof.evidence.subjectCount > proof.evidence.eventCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence", "eventCount"],
        message: "Evidence cohorts cannot exceed the recorded event count",
      });
    }
  });

export type Gpt56Proof = z.infer<typeof gpt56ProofSchema>;

export function parseGpt56Proof(input: unknown): Gpt56Proof {
  return gpt56ProofSchema.parse(input);
}
