import { assertIntelligenceRequestContract } from "./request-contract.js";
export class MissingApiKeyError extends Error {
    constructor() {
        super("OPENAI_API_KEY is required at runtime");
        this.name = "MissingApiKeyError";
    }
}
export function createFetchTransport(options = {}) {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const baseUrl = (options.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
    const getApiKey = options.getApiKey ?? (() => process.env.OPENAI_API_KEY);
    return {
        kind: "responses-api",
        async send(request, sendOptions) {
            assertIntelligenceRequestContract(request);
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
            let body = raw;
            if (raw !== "") {
                try {
                    body = JSON.parse(raw);
                }
                catch {
                    // Preserve malformed response text for a safe, non-secret-bearing error.
                }
            }
            return { status: response.status, body };
        },
    };
}
//# sourceMappingURL=transport.js.map