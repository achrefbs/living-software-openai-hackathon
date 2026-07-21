import assert from "node:assert/strict";
import test from "node:test";

import "./register-test-hooks.mjs";

const {
  assertLiveLocalRequest,
  noStoreJson,
  readBoundedJson,
} = await import("../src/lib/live-http");

test("live HTTP accepts only credential-free loopback HTTP requests", () => {
  assert.doesNotThrow(() =>
    assertLiveLocalRequest(new Request("http://127.0.0.1:3000/api/live/state"), {
      mutation: false,
    }));
  assert.throws(
    () => assertLiveLocalRequest(new Request("https://localhost/api/live/state"), {
      mutation: false,
    }),
    /only on loopback/u,
  );
  assert.throws(
    () => assertLiveLocalRequest(new Request("http://example.test/api/live/state"), {
      mutation: false,
    }),
    /only on loopback/u,
  );
});

test("mutation requests require an exact same-origin browser origin", () => {
  const url = "http://localhost:3000/api/live/command";
  assert.doesNotThrow(() =>
    assertLiveLocalRequest(new Request(url, {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    }), { mutation: true }));
  assert.doesNotThrow(() =>
    assertLiveLocalRequest(new Request(url, {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "sec-fetch-site": "same-origin",
      },
    }), { mutation: true }));
  assert.throws(
    () => assertLiveLocalRequest(new Request(url, { method: "POST" }), {
      mutation: true,
    }),
    /Cross-origin/u,
  );
  assert.throws(
    () => assertLiveLocalRequest(new Request(url, {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3001",
      },
    }), { mutation: true }),
    /Cross-origin/u,
  );
  assert.throws(
    () => assertLiveLocalRequest(new Request(url, {
      method: "POST",
      headers: {
        host: "example.test:3000",
        origin: "http://example.test:3000",
      },
    }), { mutation: true }),
    /Cross-origin/u,
  );
});

test("bounded JSON validates media type, UTF-8, and declared byte length", async () => {
  const source = JSON.stringify({ command: "prepare" });
  assert.deepEqual(
    await readBoundedJson(new Request("http://localhost/api/live/command", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-length": String(Buffer.byteLength(source)),
      },
      body: source,
    }), 1_000),
    { command: "prepare" },
  );

  await assert.rejects(
    readBoundedJson(new Request("http://localhost/api/live/command", {
      method: "POST",
      headers: { "content-type": "application/jsonp" },
      body: source,
    }), 1_000),
    /bounded application\/json/u,
  );
  await assert.rejects(
    readBoundedJson(new Request("http://localhost/api/live/command", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "1",
      },
      body: source,
    }), 1_000),
    /contradicts Content-Length/u,
  );
  await assert.rejects(
    readBoundedJson(new Request("http://localhost/api/live/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0x7b, 0xff, 0x7d]),
    }), 1_000),
    /valid UTF-8/u,
  );
});

test("chunked JSON is stopped at the byte limit before full buffering", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(6));
      controller.enqueue(new Uint8Array(6));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readBoundedJson(new Request("http://localhost/api/live/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" }), 10),
    /exceeds its byte limit/u,
  );
  assert.equal(cancelled, true);
});

test("live JSON responses are no-store and bounded before construction", async () => {
  const response = noStoreJson({ status: "ready" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(await response.json(), { status: "ready" });
  assert.throws(
    () => noStoreJson({ value: "x".repeat(2 * 1024 * 1024) }),
    /bounded representation/u,
  );
});
