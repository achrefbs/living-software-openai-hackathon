import "server-only";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;

function browserFacingLoopbackOrigin(request: Request): string {
  const host = request.headers.get("host");
  if (
    host === null ||
    host.length > 255 ||
    !/^[\x21-\x7e]+$/u.test(host)
  ) {
    throw new TypeError("Cross-origin live commands are not allowed");
  }
  let url: URL;
  try {
    url = new URL(`http://${host}`);
  } catch {
    throw new TypeError("Cross-origin live commands are not allowed");
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    !LOOPBACK_HOSTS.has(url.hostname)
  ) {
    throw new TypeError("Cross-origin live commands are not allowed");
  }
  return url.origin;
}

export function assertLiveLocalRequest(
  request: Request,
  options: { mutation: boolean },
): void {
  const url = new URL(request.url);
  if (
    url.protocol !== "http:" ||
    url.username !== "" ||
    url.password !== "" ||
    !LOOPBACK_HOSTS.has(url.hostname)
  ) {
    throw new TypeError("Live Studio is available only on loopback");
  }
  if (options.mutation) {
    const origin = request.headers.get("origin");
    // Next may normalize Request.url to localhost even when the browser-facing
    // loopback authority is 127.0.0.1. The Host header preserves that actual
    // authority, including its port, and browsers cannot forge it.
    if (origin !== browserFacingLoopbackOrigin(request)) {
      throw new TypeError("Cross-origin live commands are not allowed");
    }
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none") {
      throw new TypeError("Live commands must be same-origin");
    }
  }
}

export function noStoreJson(body: unknown, status = 200): Response {
  const source = JSON.stringify(body);
  if (
    source === undefined ||
    Buffer.byteLength(source, "utf8") > MAX_JSON_RESPONSE_BYTES
  ) {
    throw new TypeError("Live JSON response exceeds its bounded representation");
  }
  return new Response(source, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'self'",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function readBoundedJson(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new TypeError("JSON byte limit must be a positive safe integer");
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim();
  const declaredHeader = request.headers.get("content-length");
  const declaredLength = declaredHeader === null ? null : Number(declaredHeader);
  if (
    mediaType !== "application/json" ||
    (declaredHeader !== null && !/^(0|[1-9][0-9]*)$/u.test(declaredHeader)) ||
    (declaredLength !== null && (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength > maximumBytes
    ))
  ) {
    throw new TypeError("Request requires bounded application/json");
  }

  const reader = request.body?.getReader();
  if (reader === undefined) {
    throw new TypeError("Request requires a JSON body");
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new TypeError("Request body exceeds its byte limit");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (declaredLength !== null && declaredLength !== totalBytes) {
    throw new TypeError("Request body length contradicts Content-Length");
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new TypeError("Request body must be valid UTF-8 JSON", { cause: error });
  }
  return JSON.parse(source) as unknown;
}
