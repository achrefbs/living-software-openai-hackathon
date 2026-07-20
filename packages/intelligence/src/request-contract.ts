import { isDeepStrictEqual } from "node:util";

import {
  EVOLUTION_BRIEF_JSON_SCHEMA,
  SOURCE_PATCH_JSON_SCHEMA,
} from "./schema.js";
import { GOVERNANCE_INSTRUCTION } from "./prompt.js";
import { SOURCE_PATCH_GOVERNANCE_INSTRUCTION } from "./source-prompt.js";
import type { ResponsesRequest } from "./types.js";

function sameSchema(
  actual: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, unknown>>,
): boolean {
  return isDeepStrictEqual(actual, expected);
}

export function governanceForRequest(request: ResponsesRequest): string {
  const name = request.text?.format?.name;
  if (name === "living_evolution_brief") return GOVERNANCE_INSTRUCTION;
  if (name === "living_source_patch") {
    return SOURCE_PATCH_GOVERNANCE_INSTRUCTION;
  }
  throw new TypeError("Unknown Living Software intelligence schema");
}

export function assertIntelligenceRequestContract(
  request: ResponsesRequest,
): void {
  const expectedSchema = request.text?.format?.name === "living_evolution_brief"
    ? EVOLUTION_BRIEF_JSON_SCHEMA
    : request.text?.format?.name === "living_source_patch"
      ? SOURCE_PATCH_JSON_SCHEMA
      : undefined;
  const governance = governanceForRequest(request);
  const requestKeys = Object.keys(request).sort().join("\0");
  if (
    requestKeys !==
      ["input", "max_output_tokens", "model", "reasoning", "store", "text"]
        .sort()
        .join("\0") ||
    request.model !== "gpt-5.6" ||
    request.store !== false ||
    request.reasoning?.effort !== "medium" ||
    !Number.isInteger(request.max_output_tokens) ||
    request.max_output_tokens < 256 ||
    request.max_output_tokens > 16_384 ||
    request.text?.format?.type !== "json_schema" ||
    request.text.format.strict !== true ||
    expectedSchema === undefined ||
    !sameSchema(request.text.format.schema, expectedSchema) ||
    request.input.length !== 2 ||
    request.input[0]?.role !== "developer" ||
    request.input[0].content !== governance ||
    request.input[1]?.role !== "user" ||
    request.input[1].content.length < 1
  ) {
    throw new TypeError("Modified Living Software model or output contract");
  }
}
