import { z } from "zod";

const IDENTIFIER_JSON_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$";
// Source fragments need ordinary tab/newline formatting. Every other C0/C1
// control plus Unicode spacing/BOM padding is forbidden at structured output.
const PATCH_TEXT_JSON_PATTERN =
  "^[^\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]*$";
const PATCH_TEXT_ZOD_PATTERN =
  /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$/u;
const PATCH_TEXT_ERROR = "Patch text contains a forbidden control or Unicode padding character";
const modelIdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u);

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
    briefId: { type: "string", pattern: IDENTIFIER_JSON_PATTERN },
    appId: { type: "string", pattern: IDENTIFIER_JSON_PATTERN },
    opportunityId: { type: "string", pattern: IDENTIFIER_JSON_PATTERN },
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
        affectedProductNodeIds: { type: "array", minItems: 1, maxItems: 32, items: { type: "string", pattern: IDENTIFIER_JSON_PATTERN } },
        excludedWork: { type: "array", maxItems: 16, items: { type: "string", minLength: 1, maxLength: 300 } },
      },
    },
    evidenceCitations: {
      type: "object",
      additionalProperties: false,
      required: ["eventSetHash", "sampleEvidenceAliases", "metrics"],
      properties: {
        eventSetHash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
        sampleEvidenceAliases: { type: "array", minItems: 1, maxItems: 64, items: { type: "string", pattern: "^evidence-[0-9]{3,}$" } },
        metrics: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "observed"],
            properties: { name: { type: "string", pattern: IDENTIFIER_JSON_PATTERN }, observed: { type: "number" } },
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
          metric: { type: "string", pattern: IDENTIFIER_JSON_PATTERN },
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
  briefId: modelIdentifierSchema,
  appId: modelIdentifierSchema,
  opportunityId: modelIdentifierSchema,
  manifestHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  title: z.string().min(1).max(160),
  interpretation: z.string().min(1).max(2000),
  proposedChange: z.object({
    kind: z.enum(["workflow-assist", "information-surface", "automation-draft"]),
    summary: z.string().min(1).max(1000),
    userValue: z.string().min(1).max(1000),
    affectedProductNodeIds: z.array(modelIdentifierSchema).min(1).max(32),
    excludedWork: z.array(z.string().min(1).max(300)).max(16),
  }).strict(),
  evidenceCitations: z.object({
    eventSetHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sampleEvidenceAliases: z.array(z.string().regex(/^evidence-[0-9]{3,}$/)).min(1).max(64),
    metrics: z.array(z.object({ name: modelIdentifierSchema, observed: z.number().finite() }).strict()).min(1).max(32),
  }).strict(),
  successCriteria: z.array(z.object({
    metric: modelIdentifierSchema,
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
  const citedMetricNames = new Set(
    brief.evidenceCitations.metrics.map((metric) => metric.name),
  );
  for (const [index, criterion] of brief.successCriteria.entries()) {
    if (!citedMetricNames.has(criterion.metric)) {
      context.addIssue({
        code: "custom",
        path: ["successCriteria", index, "metric"],
        message: "Success criteria must reference a cited metric exactly",
      });
    }
  }
});

export type ModelEvolutionBrief = z.infer<typeof modelEvolutionBriefSchema>;

export const SOURCE_PATCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "proposalId",
    "appId",
    "opportunityId",
    "manifestHash",
    "briefId",
    "target",
    "summary",
    "rationale",
    "edits",
    "governance",
  ],
  properties: {
    schemaVersion: {
      type: "string",
      const: "living.source-patch-proposal/v1",
    },
    proposalId: {
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$",
    },
    appId: { type: "string", pattern: IDENTIFIER_JSON_PATTERN },
    opportunityId: { type: "string", pattern: IDENTIFIER_JSON_PATTERN },
    manifestHash: {
      type: "string",
      pattern: "^sha256:[a-f0-9]{64}$",
    },
    briefId: { type: "string", pattern: IDENTIFIER_JSON_PATTERN },
    target: {
      type: "object",
      additionalProperties: false,
      required: ["path", "preimageHash"],
      properties: {
        path: { type: "string", minLength: 1, maxLength: 512, pattern: PATCH_TEXT_JSON_PATTERN },
        preimageHash: {
          type: "string",
          pattern: "^sha256:[a-f0-9]{64}$",
        },
      },
    },
    summary: { type: "string", minLength: 1, maxLength: 1_000, pattern: PATCH_TEXT_JSON_PATTERN },
    rationale: { type: "string", minLength: 1, maxLength: 2_000, pattern: PATCH_TEXT_JSON_PATTERN },
    edits: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["anchor", "replacement"],
        properties: {
          anchor: {
            type: "string", minLength: 1, maxLength: 8_192,
            pattern: PATCH_TEXT_JSON_PATTERN,
            description: "Exact source substring with no forbidden control or padding characters.",
          },
          replacement: {
            type: "string", maxLength: 16_384,
            pattern: PATCH_TEXT_JSON_PATTERN,
            description:
              "Complete syntactically valid final source fragment; never truncated, padded, or placeholder text.",
          },
        },
      },
    },
    governance: {
      type: "object",
      additionalProperties: false,
      required: ["status", "humanApprovalRequired", "applicationAllowed"],
      properties: {
        status: { type: "string", const: "draft" },
        humanApprovalRequired: { type: "boolean", const: true },
        applicationAllowed: { type: "boolean", const: false },
      },
    },
  },
} as const;

export const modelSourcePatchSchema = z
  .object({
    schemaVersion: z.literal("living.source-patch-proposal/v1"),
    proposalId: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u),
    appId: modelIdentifierSchema,
    opportunityId: modelIdentifierSchema,
    manifestHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    briefId: modelIdentifierSchema,
    target: z
      .object({
        path: z.string().min(1).max(512).regex(PATCH_TEXT_ZOD_PATTERN, PATCH_TEXT_ERROR),
        preimageHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
      })
      .strict(),
    summary: z.string().min(1).max(1_000).regex(PATCH_TEXT_ZOD_PATTERN, PATCH_TEXT_ERROR),
    rationale: z.string().min(1).max(2_000).regex(PATCH_TEXT_ZOD_PATTERN, PATCH_TEXT_ERROR),
    edits: z
      .array(
        z
          .object({
            anchor: z.string().min(1).max(8_192).regex(PATCH_TEXT_ZOD_PATTERN, PATCH_TEXT_ERROR),
            replacement: z.string().max(16_384).regex(PATCH_TEXT_ZOD_PATTERN, PATCH_TEXT_ERROR),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    governance: z
      .object({
        status: z.literal("draft"),
        humanApprovalRequired: z.literal(true),
        applicationAllowed: z.literal(false),
      })
      .strict(),
  })
  .strict()
  .superRefine((proposal, context) => {
    const anchors = proposal.edits.map((edit) => edit.anchor);
    if (new Set(anchors).size !== anchors.length) {
      context.addIssue({
        code: "custom",
        path: ["edits"],
        message: "Patch edit anchors must be unique",
      });
    }
  });

export type ModelSourcePatch = z.infer<typeof modelSourcePatchSchema>;
