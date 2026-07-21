import type {
  FetchLike,
  IntelligenceTransport,
  ResponsesRequest,
  TransportResponse,
} from "./types.js";
import { assertIntelligenceRequestContract } from "./request-contract.js";
import { reportIntelligenceLifecycle } from "./lifecycle.js";

export class MissingApiKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY is required at runtime");
    this.name = "MissingApiKeyError";
  }
}

export type FetchTransportOptions = Readonly<{
  baseUrl?: string;
  fetch?: FetchLike;
  getApiKey?: () => string | undefined;
}>;

export function createFetchTransport(
  options: FetchTransportOptions = {},
): IntelligenceTransport {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = (options.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
  const getApiKey = options.getApiKey ?? (() => process.env.OPENAI_API_KEY);

  return {
    kind: "responses-api",
    async send(request: ResponsesRequest, sendOptions): Promise<TransportResponse> {
      assertIntelligenceRequestContract(request);
      const apiKey = getApiKey();
      if (apiKey === undefined || apiKey.trim() === "") {
        throw new MissingApiKeyError();
      }

      const pendingResponse = fetchImpl(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
        ...(sendOptions?.signal === undefined ? {} : { signal: sendOptions.signal }),
      });
      reportIntelligenceLifecycle(sendOptions?.lifecycleReporter, {
        type: "request.dispatched",
        schemaName: request.text.format.name,
        transport: "responses-api",
      });
      const response = await pendingResponse;
      const raw = await response.text();
      let body: unknown = raw;
      if (raw !== "") {
        try {
          body = JSON.parse(raw);
        } catch {
          // Preserve malformed response text for a safe, non-secret-bearing error.
        }
      }
      return { status: response.status, body };
    },
  };
}
