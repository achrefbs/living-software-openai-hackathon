import type {
  FetchLike,
  IntelligenceTransport,
  ResponsesRequest,
  TransportResponse,
} from "./types.js";

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
      const apiKey = getApiKey();
      if (apiKey === undefined || apiKey.trim() === "") {
        throw new MissingApiKeyError();
      }

      const response = await fetchImpl(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
        ...(sendOptions?.signal === undefined ? {} : { signal: sendOptions.signal }),
      });
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
