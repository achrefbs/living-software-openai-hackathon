import {
  parsePreviewIdentity,
  type PreviewIdentity,
} from "@/lib/evolution-comparison";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PREVIEW_URL = "http://127.0.0.1:3002/";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const MAX_IDENTITY_BYTES = 4 * 1024;

function json(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function assertLocalPreviewRequest(
  request: Request,
  nodeEnv = process.env.NODE_ENV,
  explicitEnablement = process.env.LIVING_STUDIO_EVOLUTION_ENABLED,
): URL {
  if (
    nodeEnv !== "development" &&
    explicitEnablement !== "1"
  ) {
    throw new TypeError(
      "Preview verification is disabled outside the explicit local broker",
    );
  }
  const requestUrl = new URL(request.url);
  if (!LOOPBACK_HOSTS.has(requestUrl.hostname)) {
    throw new TypeError("Preview verification is available only on loopback");
  }
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== requestUrl.origin) {
    throw new TypeError("Cross-origin preview verification is not allowed");
  }
  return requestUrl;
}

export function parseConfiguredPreviewUrl(
  value = process.env.LIVING_STUDIO_PREVIEW_URL ?? DEFAULT_PREVIEW_URL,
): URL {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.port !== "3002" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new TypeError(
      "Preview URL must be an unauthenticated loopback HTTP URL on port 3002",
    );
  }
  return url;
}

export async function fetchPreviewIdentity(
  previewUrl: URL,
  fetcher: typeof fetch = fetch,
): Promise<PreviewIdentity> {
  const identityUrl = new URL("/api/living-preview", previewUrl.origin);
  const response = await fetcher(identityUrl, {
    cache: "no-store",
    credentials: "omit",
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(2_000),
  });
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (
    !response.ok ||
    !response.headers.get("content-type")?.toLowerCase().includes("application/json") ||
    !Number.isFinite(contentLength) ||
    contentLength > MAX_IDENTITY_BYTES
  ) {
    throw new TypeError("Preview identity endpoint returned an invalid response");
  }
  const source = await response.text();
  if (Buffer.byteLength(source, "utf8") > MAX_IDENTITY_BYTES) {
    throw new TypeError("Preview identity response is too large");
  }
  return parsePreviewIdentity(JSON.parse(source) as unknown);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const requestUrl = assertLocalPreviewRequest(request);
    const previewUrl = parseConfiguredPreviewUrl();
    if (previewUrl.port === requestUrl.port) {
      throw new TypeError("Preview must run on a process separate from Studio");
    }
    const identity = await fetchPreviewIdentity(previewUrl);
    return json({ connected: true, ...identity });
  } catch (error) {
    return json(
      {
        connected: false,
        error:
          error instanceof Error
            ? error.message
            : "Preview identity verification failed",
      },
      503,
    );
  }
}
