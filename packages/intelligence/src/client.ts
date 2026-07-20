import {
  parseOpportunity,
  parseProductManifest,
  parseWorkflowEvent,
  type JsonValue,
  type Opportunity,
  type ProductManifest,
  type WorkflowEvent,
} from "@living-software/contracts";
import { projectWorkflowCases, sha256 } from "@living-software/core";

import { boundProductContext, buildEvidenceAliasEntries } from "./context.js";
import { buildResponsesRequest } from "./prompt.js";
import { modelEvolutionBriefSchema, type ModelEvolutionBrief } from "./schema.js";
import { createFetchTransport } from "./transport.js";
import type {
  BoundedProductContext,
  DraftEvolutionBriefInput,
  DraftEvolutionBriefResult,
  EvolutionBrief,
  IntelligenceTransport,
} from "./types.js";

export class IntelligenceResponseError extends Error {
  constructor(
    message: string,
    readonly code:
      | "http_error"
      | "refusal"
      | "incomplete"
      | "malformed_response"
      | "invalid_brief"
      | "timeout"
      | "unexpected_model",
  ) {
    super(message);
    this.name = "IntelligenceResponseError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

type ResponseEnvelope = Readonly<{
  text: string;
  responseId: string;
  actualModel: string | null;
}>;

function extractResponseEnvelope(body: unknown): ResponseEnvelope {
  const response = asRecord(body);
  if (response === undefined) {
    throw new IntelligenceResponseError("OpenAI returned a malformed response", "malformed_response");
  }
  if (response.status === "incomplete") {
    throw new IntelligenceResponseError("GPT-5.6 response was incomplete", "incomplete");
  }
  const responseId = response.id;
  if (typeof responseId !== "string" || responseId.length === 0 || responseId.length > 256) {
    throw new IntelligenceResponseError("OpenAI response did not contain a valid response id", "malformed_response");
  }
  const actualModel = typeof response.model === "string" && response.model.length <= 256
    ? response.model
    : null;
  const output = response.output;
  if (!Array.isArray(output)) {
    throw new IntelligenceResponseError("OpenAI response did not contain output", "malformed_response");
  }
  for (const itemValue of output) {
    const item = asRecord(itemValue);
    if (item === undefined || !Array.isArray(item.content)) continue;
    for (const contentValue of item.content) {
      const content = asRecord(contentValue);
      if (content?.type === "refusal") {
        throw new IntelligenceResponseError("GPT-5.6 refused to draft an evolution brief", "refusal");
      }
      if (content?.type === "output_text" && typeof content.text === "string") {
        return { text: content.text, responseId, actualModel };
      }
    }
  }
  throw new IntelligenceResponseError("OpenAI response did not contain structured output text", "malformed_response");
}

function expectedDataOrigin(events: readonly WorkflowEvent[]): Opportunity["evidence"]["dataOrigin"] {
  const synthetic = events.filter((event) => event.provenance.synthetic).length;
  return synthetic === events.length ? "synthetic" : synthetic === 0 ? "observed" : "mixed";
}

function eventSetHash(events: readonly WorkflowEvent[]): string {
  return sha256(
    events
      .map((event) => event as unknown as JsonValue)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  );
}

function verifyManifestHash(manifest: ProductManifest): void {
  const { contentHash, ...content } = manifest;
  if (sha256(content as unknown as JsonValue) !== contentHash) {
    throw new Error("Product manifest contentHash does not match its canonical content");
  }
}

function validateEvidence(
  opportunity: Opportunity,
  manifest: ProductManifest,
  candidates: readonly WorkflowEvent[],
): WorkflowEvent[] {
  if (candidates.length === 0) throw new Error("At least one evidence event is required");
  const events = candidates.map((event) => parseWorkflowEvent(event));
  const eventIds = events.map((event) => event.eventId);
  if (new Set(eventIds).size !== eventIds.length) throw new Error("Evidence event ids must be unique");
  const manifestNodeIds = new Set(manifest.nodes.map((node) => node.id));
  for (const event of events) {
    if (event.appId !== opportunity.appId || event.appId !== manifest.appId) {
      throw new Error("Every evidence event must link to the opportunity app");
    }
    if (event.product !== undefined) {
      if (event.product.manifestHash !== manifest.contentHash) {
        throw new Error("Every product-linked evidence event must reference the supplied manifest hash");
      }
      if (!manifestNodeIds.has(event.product.nodeId)) {
        throw new Error("Every product-linked evidence event must reference a manifest node");
      }
    }
    const occurredAt = Date.parse(event.occurredAt);
    if (occurredAt < Date.parse(opportunity.window.from) || occurredAt > Date.parse(opportunity.window.to)) {
      throw new Error("Every evidence event must fall inside the opportunity window");
    }
  }
  const computedHash = eventSetHash(events);
  if (computedHash !== opportunity.evidence.eventSetHash || computedHash !== opportunity.evidence.bundle.sha256) {
    throw new Error("Opportunity eventSetHash does not match the canonical evidence events");
  }
  const providedIds = new Set(eventIds);
  if (opportunity.evidence.sampleEventIds.some((id) => !providedIds.has(id))) {
    throw new Error("Every sampled evidence id must exist in the supplied evidence events");
  }
  if (expectedDataOrigin(events) !== opportunity.evidence.dataOrigin) {
    throw new Error("Opportunity dataOrigin does not match its evidence events");
  }
  if (new Set(events.map((event) => event.sessionId)).size !== opportunity.evidence.sessionCount) {
    throw new Error("Opportunity sessionCount does not match its evidence events");
  }
  if (projectWorkflowCases(events).length !== opportunity.evidence.subjectCount) {
    throw new Error("Opportunity subjectCount does not match its projected evidence cases");
  }
  return events;
}

function validateReferenceIntegrity(
  brief: ModelEvolutionBrief,
  opportunity: Opportunity,
  manifest: ProductManifest,
  context: BoundedProductContext,
  sampleAliasEntries: readonly Readonly<{ alias: string; eventId: string }>[],
): EvolutionBrief {
  const issues: string[] = [];
  if (brief.appId !== opportunity.appId || brief.appId !== manifest.appId) issues.push("appId");
  if (brief.opportunityId !== opportunity.opportunityId) issues.push("opportunityId");
  if (brief.manifestHash !== opportunity.manifestHash || brief.manifestHash !== manifest.contentHash) issues.push("manifestHash");
  if (brief.evidenceCitations.eventSetHash !== opportunity.evidence.eventSetHash) issues.push("eventSetHash");

  const eventIdByAlias = new Map(sampleAliasEntries.map((entry) => [entry.alias, entry.eventId]));
  if (brief.evidenceCitations.sampleEvidenceAliases.some((alias) => !eventIdByAlias.has(alias))) issues.push("sampleEvidenceAliases");
  const allowedMetrics = new Map(opportunity.signal.metrics.map((metric) => [metric.name, metric.observed]));
  if (brief.evidenceCitations.metrics.some((metric) => allowedMetrics.get(metric.name) !== metric.observed)) issues.push("metrics");
  const allowedNodes = new Set(context.included.nodes.map((node) => node.id));
  if (brief.proposedChange.affectedProductNodeIds.some((id) => !allowedNodes.has(id))) issues.push("affectedProductNodeIds");
  if (
    brief.evidenceScope.origin !== context.evidenceScope.origin ||
    brief.evidenceScope.claimScope !== context.evidenceScope.claimScope ||
    brief.evidenceScope.productionGeneralizationAllowed !== false
  ) issues.push("evidenceScope");
  if (issues.length > 0) {
    throw new IntelligenceResponseError(
      `GPT-5.6 brief failed schema/reference integrity checks: ${issues.join(", ")}`,
      "invalid_brief",
    );
  }
  const { sampleEvidenceAliases, ...citations } = brief.evidenceCitations;
  return {
    ...brief,
    evidenceCitations: {
      ...citations,
      sampleEventIds: sampleEvidenceAliases.map((alias) => eventIdByAlias.get(alias)!),
    },
  };
}

export type IntelligenceClientOptions = Readonly<{
  timeoutMs?: number;
  maxOutputTokens?: number;
}>;

export type IntelligenceClient = Readonly<{
  draftEvolutionBrief(input: DraftEvolutionBriefInput): Promise<DraftEvolutionBriefResult>;
}>;

export function createIntelligenceClient(
  transport: IntelligenceTransport = createFetchTransport(),
  options: IntelligenceClientOptions = {},
): IntelligenceClient {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxOutputTokens = options.maxOutputTokens ?? 2_400;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("timeoutMs must be an integer between 1 and 120000");
  }
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 16_384) {
    throw new Error("maxOutputTokens must be an integer between 256 and 16384");
  }

  return {
    async draftEvolutionBrief(input: DraftEvolutionBriefInput): Promise<DraftEvolutionBriefResult> {
      const opportunity = parseOpportunity(input.opportunity);
      const manifest = parseProductManifest(input.manifest);
      if (opportunity.appId !== manifest.appId) throw new Error("Opportunity and product manifest appId must match");
      verifyManifestHash(manifest);
      if (opportunity.manifestHash !== manifest.contentHash) {
        throw new Error("Opportunity must reference the supplied product manifest hash");
      }
      const events = validateEvidence(opportunity, manifest, input.evidenceEvents);
      const context = boundProductContext(manifest, opportunity, events);
      const sampleIdSet = new Set(opportunity.evidence.sampleEventIds);
      const sampleAliasEntries = buildEvidenceAliasEntries(events).filter((entry) => sampleIdSet.has(entry.eventId));
      const request = buildResponsesRequest(opportunity, context, maxOutputTokens);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await transport.send(request, { signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new IntelligenceResponseError("GPT-5.6 request timed out", "timeout");
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
      if (response.status < 200 || response.status >= 300) {
        throw new IntelligenceResponseError(`OpenAI Responses API returned HTTP ${response.status}`, "http_error");
      }

      const envelope = extractResponseEnvelope(response.body);
      if (envelope.actualModel !== null && !/^gpt-5\.6(?:$|[-_])/.test(envelope.actualModel)) {
        throw new IntelligenceResponseError("OpenAI response reported a model outside the GPT-5.6 family", "unexpected_model");
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(envelope.text);
      } catch {
        throw new IntelligenceResponseError("GPT-5.6 returned malformed JSON", "malformed_response");
      }
      const parsedBrief = modelEvolutionBriefSchema.safeParse(parsedJson);
      if (!parsedBrief.success) {
        throw new IntelligenceResponseError("GPT-5.6 returned an invalid EvolutionBrief", "invalid_brief");
      }
      const draft = validateReferenceIntegrity(parsedBrief.data, opportunity, manifest, context, sampleAliasEntries);
      return {
        draft,
        provenance: {
          provider: "openai",
          requestedModel: "gpt-5.6",
          actualResponseModel: envelope.actualModel,
          responseId: envelope.responseId,
          stored: false,
          evidenceAliases: sampleAliasEntries,
        },
      };
    },
  };
}
