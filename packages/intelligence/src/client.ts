import { createHash } from "node:crypto";

import {
  gpt56EvolutionBriefSchema,
  parseMetricReport,
  parseOpportunity,
  parseProductManifest,
  parseWorkflowEvent,
  type JsonValue,
  type MetricReport,
  type Opportunity,
  type ProductManifest,
  type WorkflowEvent,
} from "@living-software/contracts";
import { projectWorkflowCases, sha256 } from "@living-software/core";

import { boundProductContext, buildEvidenceAliasEntries } from "./context.js";
import { buildResponsesRequest } from "./prompt.js";
import {
  modelEvolutionBriefSchema,
  modelSourcePatchSchema,
  type ModelEvolutionBrief,
  type ModelSourcePatch,
} from "./schema.js";
import { buildSourcePatchRequest } from "./source-prompt.js";
import { validateBuiltInOpportunitySemantics } from "./opportunity-integrity.js";
import { CODEX_CLI_GPT56_MODEL } from "./codex-transport.js";
import { createFetchTransport } from "./transport.js";
import type {
  BoundedProductContext,
  DraftEvolutionBriefInput,
  DraftEvolutionBriefResult,
  DraftSourcePatchInput,
  DraftSourcePatchResult,
  EvolutionBrief,
  Gpt56TransportModel,
  IntelligenceLifecycleReporter,
  IntelligenceTokenUsage,
  IntelligenceTransport,
  ResponsesRequest,
  SourceCandidate,
  SourcePatchProposal,
} from "./types.js";

export const SOURCE_CONTEXT_LIMITS = Object.freeze({
  candidates: 3,
  bytesPerCandidate: 64 * 1024,
  totalBytes: 96 * 1024,
  totalReplacementBytes: 32 * 1024,
} as const);

export class IntelligenceResponseError extends Error {
  constructor(
    message: string,
    readonly code:
      | "http_error"
      | "refusal"
      | "incomplete"
      | "malformed_response"
      | "invalid_brief"
      | "invalid_patch"
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
  responseId: string | null;
  codexThreadId: string | null;
  actualModel: string | null;
  transportRequestedModel: Gpt56TransportModel;
  tokenUsage: IntelligenceTokenUsage | null;
}>;

function nonNegativeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : undefined;
}

function extractCliUsage(value: unknown): IntelligenceTokenUsage | undefined {
  const usage = asRecord(value);
  if (usage === undefined) return undefined;
  const inputTokens = nonNegativeInteger(usage.inputTokens);
  const cachedInputTokens = nonNegativeInteger(usage.cachedInputTokens);
  const outputTokens = nonNegativeInteger(usage.outputTokens);
  const reasoningOutputTokens = nonNegativeInteger(usage.reasoningOutputTokens);
  return (
    inputTokens === undefined ||
    cachedInputTokens === undefined ||
    outputTokens === undefined ||
    reasoningOutputTokens === undefined
  )
    ? undefined
    : { inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens };
}

function extractApiUsage(value: unknown): IntelligenceTokenUsage | null {
  const usage = asRecord(value);
  if (usage === undefined) return null;
  const inputDetails = asRecord(usage.input_tokens_details);
  const outputDetails = asRecord(usage.output_tokens_details);
  const inputTokens = nonNegativeInteger(usage.input_tokens);
  const outputTokens = nonNegativeInteger(usage.output_tokens);
  if (inputTokens === undefined || outputTokens === undefined) return null;
  return {
    inputTokens,
    cachedInputTokens: nonNegativeInteger(inputDetails?.cached_tokens) ?? 0,
    outputTokens,
    reasoningOutputTokens: nonNegativeInteger(outputDetails?.reasoning_tokens) ?? 0,
  };
}

function extractResponseEnvelope(
  body: unknown,
  transportKind: IntelligenceTransport["kind"],
): ResponseEnvelope {
  const response = asRecord(body);
  if (response === undefined) {
    throw new IntelligenceResponseError("OpenAI returned a malformed response", "malformed_response");
  }
  if (transportKind === "codex-cli") {
    if (
      response.type !== "codex-cli-result" ||
      response.status !== "completed" ||
      response.requestedModel !== CODEX_CLI_GPT56_MODEL ||
      typeof response.threadId !== "string" ||
      response.threadId.length < 1 ||
      response.threadId.length > 256 ||
      typeof response.text !== "string" ||
      extractCliUsage(response.usage) === undefined
    ) {
      throw new IntelligenceResponseError("Codex CLI returned a malformed result", "malformed_response");
    }
    return {
      text: response.text,
      responseId: null,
      codexThreadId: response.threadId,
      actualModel: null,
      transportRequestedModel: CODEX_CLI_GPT56_MODEL,
      tokenUsage: extractCliUsage(response.usage)!,
    };
  }
  if (response.status === "incomplete") {
    throw new IntelligenceResponseError("GPT-5.6 response was incomplete", "incomplete");
  }
  if (response.status !== "completed") {
    throw new IntelligenceResponseError("OpenAI response was not completed", "malformed_response");
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
        throw new IntelligenceResponseError("GPT-5.6 refused the structured proposal request", "refusal");
      }
      if (content?.type === "output_text" && typeof content.text === "string") {
        if (actualModel === null) {
          throw new IntelligenceResponseError(
            "OpenAI response did not report its actual model",
            "malformed_response",
          );
        }
        return {
          text: content.text,
          responseId,
          codexThreadId: null,
          actualModel,
          transportRequestedModel: "gpt-5.6",
          tokenUsage: extractApiUsage(response.usage),
        };
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
  const { contentHash, generatedAt: _generatedAt, ...semanticContent } = manifest;
  if (sha256(semanticContent as unknown as JsonValue) !== contentHash) {
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


function validateMetricReportBinding(
  report: MetricReport | undefined,
  opportunity: Opportunity,
  manifest: ProductManifest,
  events: readonly WorkflowEvent[],
): void {
  if (report === undefined) {
    if (opportunity.signal.kind === "model-discovery") {
      throw new Error("Model discovery requires the complete behavior matrix");
    }
    return;
  }
  const identityMatches =
    report.appId === manifest.appId &&
    report.manifestHash === manifest.contentHash &&
    report.window.from === opportunity.window.from &&
    report.window.to === opportunity.window.to &&
    report.dataOrigin === opportunity.evidence.dataOrigin &&
    report.totals.events === opportunity.evidence.occurrenceCount &&
    report.totals.sessions === opportunity.evidence.sessionCount &&
    report.totals.cases === opportunity.evidence.subjectCount &&
    report.totals.events === events.length &&
    report.totals.sessions === new Set(events.map((event) => event.sessionId)).size &&
    report.totals.cases === projectWorkflowCases([...events]).length;
  if (!identityMatches) {
    throw new Error("Behavior matrix does not match the exact evidence window");
  }
  if (opportunity.signal.kind !== "model-discovery") return;
  if (opportunity.signal.sequence !== undefined) {
    throw new Error("Model discovery must not preselect an event sequence");
  }
  const metrics = opportunity.signal.metrics;
  const metricsMatch = metrics.length === report.values.length && report.values.every(
    (metric, index) => {
      const bound = metrics[index];
      return bound !== undefined &&
        bound.name === "matrix.metric." + String(index + 1).padStart(3, "0") &&
        bound.unit === metric.unit &&
        bound.observed === metric.value &&
        bound.comparator === undefined;
    },
  );
  if (!metricsMatch) {
    throw new Error("Model discovery metrics must bind the complete behavior matrix in exact order");
  }
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
  const allowedNodes = new Set(context.relevantProductNodeIds);
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
  const projectedBrief = {
    ...brief,
    evidenceCitations: {
      ...citations,
      sampleEventIds: sampleEvidenceAliases.map((alias) => eventIdByAlias.get(alias)!),
    },
  };
  const parsed = gpt56EvolutionBriefSchema.safeParse(projectedBrief);
  if (!parsed.success) {
    throw new IntelligenceResponseError(
      "GPT-5.6 brief failed canonical contract validation",
      "invalid_brief",
    );
  }
  return parsed.data;
}

function sourceHash(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function validSourcePath(candidate: string): boolean {
  if (
    candidate.length < 1 ||
    candidate.length > 512 ||
    candidate.includes("\\") ||
    candidate.startsWith("/") ||
    /^[A-Za-z]:/u.test(candidate) ||
    candidate.includes("\0")
  ) {
    return false;
  }
  return candidate
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function validateSourceCandidates(
  candidates: readonly SourceCandidate[],
): readonly SourceCandidate[] {
  if (
    candidates.length < 1 ||
    candidates.length > SOURCE_CONTEXT_LIMITS.candidates
  ) {
    throw new TypeError(
      `Source patch context requires between 1 and ${SOURCE_CONTEXT_LIMITS.candidates} candidates`,
    );
  }
  const paths = new Set<string>();
  let totalBytes = 0;
  const validated = candidates.map((candidate) => {
    const bytes = Buffer.byteLength(candidate.content, "utf8");
    if (
      !validSourcePath(candidate.path) ||
      paths.has(candidate.path) ||
      !/^sha256:[a-f0-9]{64}$/u.test(candidate.preimageHash) ||
      sourceHash(candidate.content) !== candidate.preimageHash ||
      candidate.content.includes("\0") ||
      bytes < 1 ||
      bytes > SOURCE_CONTEXT_LIMITS.bytesPerCandidate
    ) {
      throw new TypeError(
        "Source candidates must be unique, bounded, hash-exact repository-relative UTF-8 files",
      );
    }
    paths.add(candidate.path);
    totalBytes += bytes;
    return Object.freeze({ ...candidate });
  });
  if (totalBytes > SOURCE_CONTEXT_LIMITS.totalBytes) {
    throw new TypeError("Source patch context exceeds the aggregate byte limit");
  }
  return Object.freeze(validated);
}

function validatePatchReferenceIntegrity(
  proposal: ModelSourcePatch,
  input: DraftSourcePatchInput,
  candidates: readonly SourceCandidate[],
): SourcePatchProposal {
  const issues: string[] = [];
  if (proposal.appId !== input.brief.appId) issues.push("appId");
  if (proposal.opportunityId !== input.brief.opportunityId) {
    issues.push("opportunityId");
  }
  if (proposal.manifestHash !== input.brief.manifestHash) {
    issues.push("manifestHash");
  }
  if (proposal.briefId !== input.brief.briefId) issues.push("briefId");
  const target = candidates.find(
    (candidate) => candidate.path === proposal.target.path,
  );
  if (
    target === undefined ||
    target.preimageHash !== proposal.target.preimageHash
  ) {
    issues.push("target");
  }

  if (target !== undefined) {
    const ranges: Array<Readonly<{ start: number; end: number }>> = [];
    let replacementBytes = 0;
    let changed = false;
    for (const edit of proposal.edits) {
      const start = target.content.indexOf(edit.anchor);
      if (start < 0 || start !== target.content.lastIndexOf(edit.anchor)) {
        issues.push("anchor");
        continue;
      }
      ranges.push({ start, end: start + edit.anchor.length });
      replacementBytes += Buffer.byteLength(edit.replacement, "utf8");
      if (edit.replacement !== edit.anchor) changed = true;
    }
    ranges.sort((left, right) => left.start - right.start);
    if (
      ranges.some((range, index) =>
        index > 0 && range.start < ranges[index - 1]!.end
      )
    ) {
      issues.push("overlappingAnchors");
    }
    if (replacementBytes > SOURCE_CONTEXT_LIMITS.totalReplacementBytes) {
      issues.push("replacementBytes");
    }
    if (!changed) issues.push("noChange");
  }

  if (issues.length > 0) {
    throw new IntelligenceResponseError(
      `GPT-5.6 source patch failed schema/reference integrity checks: ${[...new Set(issues)].join(", ")}`,
      "invalid_patch",
    );
  }
  return proposal;
}

async function requestStructuredJson(
  transport: IntelligenceTransport,
  request: ResponsesRequest,
  timeoutMs: number,
  lifecycleReporter?: IntelligenceLifecycleReporter,
): Promise<Readonly<{
  value: unknown;
  envelope: ResponseEnvelope;
  transportKind: NonNullable<IntelligenceTransport["kind"]>;
}>> {
  const transportKind = transport.kind ?? "responses-api";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await transport.send(request, {
      signal: controller.signal,
      ...(lifecycleReporter === undefined ? {} : { lifecycleReporter }),
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new IntelligenceResponseError("GPT-5.6 request timed out", "timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new IntelligenceResponseError(
      `OpenAI Responses API returned HTTP ${response.status}`,
      "http_error",
    );
  }
  const envelope = extractResponseEnvelope(response.body, transportKind);
  if (
    envelope.actualModel !== null &&
    !/^gpt-5\.6(?:$|[-_])/u.test(envelope.actualModel)
  ) {
    throw new IntelligenceResponseError(
      "OpenAI response reported a model outside the GPT-5.6 family",
      "unexpected_model",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(envelope.text) as unknown;
  } catch {
    throw new IntelligenceResponseError(
      "GPT-5.6 returned malformed JSON",
      "malformed_response",
    );
  }
  return { value, envelope, transportKind };
}

function baseProvenance(
  envelope: ResponseEnvelope,
  transportKind: NonNullable<IntelligenceTransport["kind"]>,
) {
  return {
    provider: "openai" as const,
    transport: transportKind,
    boundaryRequestedModel: "gpt-5.6" as const,
    transportRequestedModel: envelope.transportRequestedModel,
    actualResponseModel: envelope.actualModel,
    responseId: envelope.responseId,
    codexThreadId: envelope.codexThreadId,
    responseStoreRequested: transportKind === "responses-api" ? false as const : null,
    localSessionPersisted: transportKind === "codex-cli" ? false as const : null,
    tokenUsage: envelope.tokenUsage,
  };
}

export type IntelligenceClientOptions = Readonly<{
  timeoutMs?: number;
  maxOutputTokens?: number;
  maxPatchOutputTokens?: number;
  lifecycleReporter?: IntelligenceLifecycleReporter;
}>;

export type IntelligenceClient = Readonly<{
  draftEvolutionBrief(input: DraftEvolutionBriefInput): Promise<DraftEvolutionBriefResult>;
  draftSourcePatch(input: DraftSourcePatchInput): Promise<DraftSourcePatchResult>;
}>;

export function createIntelligenceClient(
  transport: IntelligenceTransport = createFetchTransport(),
  options: IntelligenceClientOptions = {},
): IntelligenceClient {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxOutputTokens = options.maxOutputTokens ?? 2_400;
  const maxPatchOutputTokens = options.maxPatchOutputTokens ?? 8_000;
  const lifecycleReporter = options.lifecycleReporter;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("timeoutMs must be an integer between 1 and 120000");
  }
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 16_384) {
    throw new Error("maxOutputTokens must be an integer between 256 and 16384");
  }
  if (
    !Number.isInteger(maxPatchOutputTokens) ||
    maxPatchOutputTokens < 256 ||
    maxPatchOutputTokens > 16_384
  ) {
    throw new Error("maxPatchOutputTokens must be an integer between 256 and 16384");
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
      validateBuiltInOpportunitySemantics(opportunity, events);
      const metricReport = input.metricReport === undefined
        ? undefined
        : parseMetricReport(input.metricReport);
      validateMetricReportBinding(metricReport, opportunity, manifest, events);
      const context = boundProductContext(manifest, opportunity, events, metricReport);
      const sampleIdSet = new Set(opportunity.evidence.sampleEventIds);
      const sampleAliasEntries = buildEvidenceAliasEntries(events).filter((entry) => sampleIdSet.has(entry.eventId));
      const request = buildResponsesRequest(opportunity, context, maxOutputTokens);
      const { value, envelope, transportKind } = await requestStructuredJson(
        transport,
        request,
        timeoutMs,
        lifecycleReporter,
      );
      const parsedBrief = modelEvolutionBriefSchema.safeParse(value);
      if (!parsedBrief.success) {
        throw new IntelligenceResponseError("GPT-5.6 returned an invalid EvolutionBrief", "invalid_brief");
      }
      const draft = validateReferenceIntegrity(parsedBrief.data, opportunity, manifest, context, sampleAliasEntries);
      return {
        draft,
        provenance: {
          ...baseProvenance(envelope, transportKind),
          evidenceAliases: sampleAliasEntries,
        },
      };
    },
    async draftSourcePatch(input: DraftSourcePatchInput): Promise<DraftSourcePatchResult> {
      const brief = gpt56EvolutionBriefSchema.parse(input.brief);
      const candidates = validateSourceCandidates(input.candidates);
      const request = buildSourcePatchRequest(
        { brief, candidates },
        maxPatchOutputTokens,
      );
      const { value, envelope, transportKind } = await requestStructuredJson(
        transport,
        request,
        timeoutMs,
        lifecycleReporter,
      );
      const parsed = modelSourcePatchSchema.safeParse(value);
      if (!parsed.success) {
        throw new IntelligenceResponseError(
          "GPT-5.6 returned an invalid source patch proposal",
          "invalid_patch",
        );
      }
      return {
        proposal: validatePatchReferenceIntegrity(
          parsed.data,
          { brief, candidates },
          candidates,
        ),
        provenance: {
          ...baseProvenance(envelope, transportKind),
          sourceCandidates: candidates.map(({ path, preimageHash }) => ({
            path,
            preimageHash,
          })),
        },
      };
    },
  };
}
