import { z } from "zod";

export const EVOLUTION_BRIEF_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "briefId",
    "appId",
    "opportunityId",
    "manifestHash",
    "title",
    "interpretation",
    "proposedChange",
    "evidenceCitations",
    "successCriteria",
    "risks",
    "openQuestions",
    "limitations",
    "evidenceScope",
    "governance",
  ],
  properties: {
    schemaVersion: { type: "string", const: "living.evolution-brief/v1" },
    briefId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$" },
    appId: { type: "string" },
    opportunityId: { type: "string" },
    manifestHash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
    title: { type: "string", minLength: 1, maxLength: 160 },
    interpretation: { type: "string", minLength: 1, maxLength: 2000 },
    proposedChange: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "summary", "userValue", "affectedProductNodeIds", "excludedWork"],
      properties: {
        kind: { type: "string", enum: ["workflow-assist", "information-surface", "automation-draft"] },
        summary: { type: "string", minLength: 1, maxLength: 1000 },
        userValue: { type: "string", minLength: 1, maxLength: 1000 },
        affectedProductNodeIds: { type: "array", minItems: 1, maxItems: 32, uniqueItems: true, items: { type: "string" } },
        excludedWork: { type: "array", maxItems: 16, items: { type: "string", minLength: 1, maxLength: 300 } },
      },
    },
    evidenceCitations: {
      type: "object",
      additionalProperties: false,
      required: ["eventSetHash", "sampleEvidenceAliases", "metrics"],
      properties: {
        eventSetHash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
        sampleEvidenceAliases: { type: "array", minItems: 1, maxItems: 64, uniqueItems: true, items: { type: "string", pattern: "^evidence-[0-9]{3,}$" } },
        metrics: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "observed"],
            properties: { name: { type: "string" }, observed: { type: "number" } },
          },
        },
      },
    },
    successCriteria: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["metric", "direction", "target", "measurementWindow"],
        properties: {
          metric: { type: "string", minLength: 1, maxLength: 160 },
          direction: { type: "string", enum: ["increase", "decrease"] },
          target: { type: "string", minLength: 1, maxLength: 300 },
          measurementWindow: { type: "string", minLength: 1, maxLength: 300 },
        },
      },
    },
    risks: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 500 } },
    openQuestions: { type: "array", maxItems: 12, items: { type: "string", minLength: 1, maxLength: 500 } },
    limitations: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 500 } },
    evidenceScope: {
      type: "object",
      additionalProperties: false,
      required: ["origin", "claimScope", "productionGeneralizationAllowed"],
      properties: {
        origin: { type: "string", enum: ["observed", "synthetic", "mixed"] },
        claimScope: { type: "string", enum: ["synthetic-only", "mixed-evidence-only", "observed-window-only"] },
        productionGeneralizationAllowed: { type: "boolean", const: false },
      },
    },
    governance: {
      type: "object",
      additionalProperties: false,
      required: ["status", "humanApprovalRequired", "activationAllowed"],
      properties: {
        status: { type: "string", const: "draft" },
        humanApprovalRequired: { type: "boolean", const: true },
        activationAllowed: { type: "boolean", const: false },
      },
    },
  },
} as const;

export const modelEvolutionBriefSchema = z.object({
  schemaVersion: z.literal("living.evolution-brief/v1"),
  briefId: z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
  appId: z.string().min(1).max(160),
  opportunityId: z.string().min(1).max(160),
  manifestHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  title: z.string().min(1).max(160),
  interpretation: z.string().min(1).max(2000),
  proposedChange: z.object({
    kind: z.enum(["workflow-assist", "information-surface", "automation-draft"]),
    summary: z.string().min(1).max(1000),
    userValue: z.string().min(1).max(1000),
    affectedProductNodeIds: z.array(z.string().min(1)).min(1).max(32),
    excludedWork: z.array(z.string().min(1).max(300)).max(16),
  }).strict(),
  evidenceCitations: z.object({
    eventSetHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sampleEvidenceAliases: z.array(z.string().regex(/^evidence-[0-9]{3,}$/)).min(1).max(64),
    metrics: z.array(z.object({ name: z.string().min(1), observed: z.number().finite() }).strict()).min(1).max(32),
  }).strict(),
  successCriteria: z.array(z.object({
    metric: z.string().min(1).max(160),
    direction: z.enum(["increase", "decrease"]),
    target: z.string().min(1).max(300),
    measurementWindow: z.string().min(1).max(300),
  }).strict()).min(1).max(8),
  risks: z.array(z.string().min(1).max(500)).min(1).max(12),
  openQuestions: z.array(z.string().min(1).max(500)).max(12),
  limitations: z.array(z.string().min(1).max(500)).min(1).max(12),
  evidenceScope: z.object({
    origin: z.enum(["observed", "synthetic", "mixed"]),
    claimScope: z.enum(["synthetic-only", "mixed-evidence-only", "observed-window-only"]),
    productionGeneralizationAllowed: z.literal(false),
  }).strict(),
  governance: z.object({
    status: z.literal("draft"),
    humanApprovalRequired: z.literal(true),
    activationAllowed: z.literal(false),
  }).strict(),
}).strict().superRefine((brief, context) => {
  const unique = (values: readonly string[]) => new Set(values).size === values.length;
  if (!unique(brief.proposedChange.affectedProductNodeIds)) {
    context.addIssue({ code: "custom", path: ["proposedChange", "affectedProductNodeIds"], message: "Product node citations must be unique" });
  }
  if (!unique(brief.evidenceCitations.sampleEvidenceAliases)) {
    context.addIssue({ code: "custom", path: ["evidenceCitations", "sampleEvidenceAliases"], message: "Evidence aliases must be unique" });
  }
  if (!unique(brief.evidenceCitations.metrics.map((metric) => metric.name))) {
    context.addIssue({ code: "custom", path: ["evidenceCitations", "metrics"], message: "Metric citations must be unique" });
  }
});

export type ModelEvolutionBrief = z.infer<typeof modelEvolutionBriefSchema>;
