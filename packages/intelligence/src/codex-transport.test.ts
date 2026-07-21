import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  CODEX_CLI_DISABLED_FEATURES,
  CODEX_CLI_GPT56_MODEL,
  createCodexCliTransport,
} from "./codex-transport.js";
import { GOVERNANCE_INSTRUCTION } from "./prompt.js";
import {
  EVOLUTION_BRIEF_JSON_SCHEMA,
  SOURCE_PATCH_JSON_SCHEMA,
} from "./schema.js";
import { SOURCE_PATCH_GOVERNANCE_INSTRUCTION } from "./source-prompt.js";
import { createFetchTransport } from "./transport.js";
import type {
  IntelligenceLifecycleEvent,
  ResponsesRequest,
} from "./types.js";

const request: ResponsesRequest = {
  model: "gpt-5.6",
  store: false,
  reasoning: { effort: "medium" },
  max_output_tokens: 2_400,
  input: [
    { role: "developer", content: GOVERNANCE_INSTRUCTION },
    { role: "user", content: "Interpret bounded evidence." },
  ],
  text: {
    format: {
      type: "json_schema",
      name: "living_evolution_brief",
      strict: true,
      schema: EVOLUTION_BRIEF_JSON_SCHEMA,
    },
  },
};

function events(itemType = "agent_message"): string {
  const text = JSON.stringify({ ok: true });
  return [
    JSON.stringify({ type: "thread.started", thread_id: "thread-test-1" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({
      type: "item.completed",
      item: { id: "item-1", type: itemType, text },
    }),
    JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 100,
        cached_input_tokens: 20,
        output_tokens: 10,
        reasoning_output_tokens: 4,
      },
    }),
  ].join("\n");
}

function requestWithUser(content: string): ResponsesRequest {
  return {
    ...request,
    input: [
      { role: "developer", content: GOVERNANCE_INSTRUCTION },
      { role: "user", content },
    ],
  };
}

async function createFakeCodexCli(): Promise<Readonly<{
  directory: string;
  cliPath: string;
  diagnosticPath: string;
}>> {
  const directory = await mkdtemp(join(tmpdir(), "living-fake-codex-"));
  const cliPath = join(directory, "fake-codex.mjs");
  const diagnosticPath = join(directory, "last-cwd.txt");
  const source = [
    'import { writeFile } from "node:fs/promises";',
    "const args = process.argv.slice(2);",
    'let input = "";',
    'process.stdin.setEncoding("utf8");',
    "for await (const chunk of process.stdin) input += chunk;",
    "await writeFile(" + JSON.stringify(diagnosticPath) + ', process.cwd(), "utf8");',
    'if (input === "SLOW") await new Promise((resolve) => setTimeout(resolve, 10000));',
    'const outputIndex = args.indexOf("--output-last-message");',
    'let finalMessage = JSON.stringify({ missing: true });',
    'if (input !== "MISSING") {',
    '  finalMessage = input === "OVERSIZE"',
    '    ? "x".repeat(1024 * 1024 + 1)',
    "    : JSON.stringify({",
    "        args,",
    "        cwd: process.cwd(),",
    "        envKeys: Object.keys(process.env).sort(),",
    "        input,",
    "      });",
    '  await writeFile(args[outputIndex + 1], finalMessage, "utf8");',
    "}",
    "const output = [",
    '  JSON.stringify({ type: "thread.started", thread_id: "thread-subprocess" }),',
    '  JSON.stringify({ type: "turn.started" }),',
    '  JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: finalMessage } }),',
    "  JSON.stringify({",
    '    type: "turn.completed",',
    "    usage: {",
    "      input_tokens: 100,",
    "      cached_input_tokens: 20,",
    "      output_tokens: 10,",
    "      reasoning_output_tokens: 4,",
    "    },",
    "  }),",
    "];",
    'const serialized = output.join("\\n") + "\\n";',
    'if (input === "SPLIT") {',
    '  const prefix = output.slice(0, 2).join("\\n") + "\\n";',
    '  const suffix = output.slice(2).join("\\n") + "\\n";',
    '  for (let index = 0; index < prefix.length; index += 7) {',
    '    process.stdout.write(prefix.slice(index, index + 7));',
    '    await Promise.resolve();',
    '  }',
    '  await new Promise((resolve) => setTimeout(resolve, 75));',
    '  for (let index = 0; index < suffix.length; index += 11) {',
    '    process.stdout.write(suffix.slice(index, index + 11));',
    '    await Promise.resolve();',
    '  }',
    '} else {',
    '  process.stdout.write(serialized);',
    '}',
  ].join("\n");
  await writeFile(cliPath, source, { encoding: "utf8", flag: "wx" });
  return { directory, cliPath, diagnosticPath };
}

test("adapts an isolated Codex CLI structured result to the intelligence boundary", async () => {
  let invocation;
  const transport = createCodexCliTransport({
    async run(value) {
      invocation = value;
      return {
        exitCode: 0,
        stdout: events(),
        stderr: "",
        finalMessage: JSON.stringify({ ok: true }),
      };
    },
  });

  const response = await transport.send(request);
  assert.equal(transport.kind, "codex-cli");
  assert.equal(invocation.model, CODEX_CLI_GPT56_MODEL);
  assert.equal(invocation.reasoningEffort, "medium");
  assert.equal(invocation.prompt, "Interpret bounded evidence.");
  assert.doesNotMatch(invocation.prompt, /Never approve or activate/);
  assert.match(invocation.developerInstructions, /Never approve or activate/);
  assert.match(invocation.developerInstructions, /Do not call any tool/);
  assert.deepEqual(response, {
    status: 200,
    body: {
      type: "codex-cli-result",
      threadId: "thread-test-1",
      status: "completed",
      requestedModel: "gpt-5.6-terra",
      text: "{\"ok\":true}",
      usage: {
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 10,
        reasoningOutputTokens: 4,
      },
    },
  });
});

test("reports API dispatch only after the fetch invocation and ignores reporter failure", async () => {
  let releaseFetch!: () => void;
  const fetchReleased = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });
  let invoked = false;
  const lifecycleEvents: IntelligenceLifecycleEvent[] = [];
  const transport = createFetchTransport({
    getApiKey: () => "test-key",
    async fetch() {
      invoked = true;
      await fetchReleased;
      return new Response(JSON.stringify({ status: "completed" }), {
        status: 200,
      });
    },
  });

  const pending = transport.send(requestWithUser("api-prompt-secret"), {
    async lifecycleReporter(event) {
      lifecycleEvents.push(event);
      throw new Error("broken API reporter");
    },
  });
  assert.equal(invoked, true);
  assert.deepEqual(lifecycleEvents, [{
    type: "request.dispatched",
    schemaName: "living_evolution_brief",
    transport: "responses-api",
  }]);
  assert.equal(JSON.stringify(lifecycleEvents).includes("api-prompt-secret"), false);

  releaseFetch();
  assert.equal((await pending).status, 200);
});

test("rejects a downgraded or modified developer role contract", async () => {
  const transport = createCodexCliTransport({
    async run() {
      assert.fail("runner must not be called");
    },
  });
  await assert.rejects(
    () => transport.send({
      ...request,
      input: [
        { role: "developer", content: "weakened" },
        { role: "user", content: "Interpret bounded evidence." },
      ],
    }),
    /modified model or output contract/,
  );
  await assert.rejects(
    () => transport.send({
      ...request,
      model: "gpt-5.5",
    } as unknown as ResponsesRequest),
    /modified model or output contract/,
  );
});

test("accepts only the exact tool-less source-patch request contract", async () => {
  let invocation;
  const transport = createCodexCliTransport({
    async run(value) {
      invocation = value;
      return {
        exitCode: 0,
        stdout: events(),
        stderr: "",
        finalMessage: JSON.stringify({ ok: true }),
      };
    },
  });
  const sourceRequest: ResponsesRequest = {
    ...request,
    max_output_tokens: 8_000,
    input: [
      { role: "developer", content: SOURCE_PATCH_GOVERNANCE_INSTRUCTION },
      { role: "user", content: "Patch bounded candidate source." },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "living_source_patch",
        strict: true,
        schema: SOURCE_PATCH_JSON_SCHEMA,
      },
    },
  };

  await transport.send(sourceRequest);
  assert.equal(invocation.prompt, "Patch bounded candidate source.");
  assert.match(invocation.developerInstructions, /untrusted model output/);
  assert.match(invocation.developerInstructions, /Do not call any tool/);

  const reorderedSchema = JSON.parse(
    JSON.stringify(SOURCE_PATCH_JSON_SCHEMA),
    (_key, value: unknown) => {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return value;
      }
      return Object.fromEntries(Object.entries(value).reverse());
    },
  ) as Readonly<Record<string, unknown>>;
  await transport.send({
    ...sourceRequest,
    text: {
      format: {
        ...sourceRequest.text.format,
        schema: reorderedSchema,
      },
    },
  });

  await assert.rejects(
    () => transport.send({
      ...sourceRequest,
      input: [
        { role: "developer", content: GOVERNANCE_INSTRUCTION },
        { role: "user", content: "Patch bounded candidate source." },
      ],
    }),
    /modified model or output contract/,
  );
});

test("rejects any Codex CLI tool or plan item", async () => {
  const transport = createCodexCliTransport({
    async run() {
      return {
        exitCode: 0,
        stdout: events("command_execution"),
        stderr: "",
        finalMessage: JSON.stringify({ ok: true }),
      };
    },
  });
  await assert.rejects(
    () => transport.send(request),
    /disallowed tool or plan item: command_execution/,
  );
});

test("rejects failed and unverifiable Codex CLI runs", async () => {
  const failed = createCodexCliTransport({
    async run() {
      return {
        exitCode: 7,
        stdout: "",
        stderr: "authentication required",
        finalMessage: "",
      };
    },
  });
  await assert.rejects(
    () => failed.send(request),
    /exited with code 7; verify local authentication and CLI compatibility/,
  );

  const malformed = createCodexCliTransport({
    async run() {
      return {
        exitCode: 0,
        stdout: "not-json",
        stderr: "",
        finalMessage: JSON.stringify({ ok: true }),
      };
    },
  });
  await assert.rejects(() => malformed.send(request), /malformed JSONL/);

  const unknownEvent = createCodexCliTransport({
    async run() {
      return {
        exitCode: 0,
        stdout: [
          JSON.stringify({ type: "thread.started", thread_id: "thread-test-1" }),
          JSON.stringify({ type: "turn.started" }),
          JSON.stringify({ type: "item.updated", item: { type: "reasoning" } }),
          JSON.stringify({
            type: "turn.completed",
            usage: {
              input_tokens: 1,
              cached_input_tokens: 0,
              output_tokens: 1,
              reasoning_output_tokens: 0,
            },
          }),
        ].join("\n"),
        stderr: "",
        finalMessage: JSON.stringify({ ok: true }),
      };
    },
  });
  await assert.rejects(
    () => unknownEvent.send(request),
    /unexpected event type: item.updated/,
  );
});

test("reports only closed lifecycle metadata and ignores reporter failures", async () => {
  const reasoningSecret = "private-reasoning-must-never-be-reported";
  const finalMessage = JSON.stringify({ ok: true });
  const stdout = [
    JSON.stringify({ type: "thread.started", thread_id: "thread-safe-1" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({
      type: "item.completed",
      item: { id: "reasoning-1", type: "reasoning", text: reasoningSecret },
    }),
    JSON.stringify({
      type: "item.completed",
      item: { id: "message-1", type: "agent_message", text: finalMessage },
    }),
    JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 100,
        cached_input_tokens: 20,
        output_tokens: 10,
        reasoning_output_tokens: 4,
      },
    }),
  ].join("\n");
  const lifecycleEvents: IntelligenceLifecycleEvent[] = [];
  const transport = createCodexCliTransport({
    async run() {
      return { exitCode: 0, stdout, stderr: "stderr-secret", finalMessage };
    },
  });

  const response = await transport.send(requestWithUser("prompt-secret"), {
    async lifecycleReporter(event) {
      lifecycleEvents.push(event);
      throw new Error("broken intelligence reporter");
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    lifecycleEvents.map((event) => event.type),
    ["request.dispatched", "thread.started", "turn.started", "turn.completed"],
  );
  assert.ok(lifecycleEvents.every((event) => Object.isFrozen(event)));
  assert.deepEqual(Object.keys(lifecycleEvents[0]!).sort(), [
    "schemaName",
    "transport",
    "type",
  ]);
  const serialized = JSON.stringify(lifecycleEvents);
  for (const forbidden of [
    reasoningSecret,
    finalMessage,
    "prompt-secret",
    "stderr-secret",
    "broken intelligence reporter",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("incrementally reports chunk-split Codex starts before the real run completes", {
  timeout: 5_000,
}, async () => {
  const fixture = await createFakeCodexCli();
  const lifecycleEvents: IntelligenceLifecycleEvent[] = [];
  let settled = false;
  let sawTurnStarted!: () => void;
  const turnStarted = new Promise<void>((resolve) => {
    sawTurnStarted = resolve;
  });
  try {
    const transport = createCodexCliTransport({ cliPath: fixture.cliPath });
    const pending = transport.send(requestWithUser("SPLIT"), {
      lifecycleReporter(event) {
        lifecycleEvents.push(event);
        if (event.type === "turn.started") sawTurnStarted();
      },
    }).finally(() => {
      settled = true;
    });

    await turnStarted;
    assert.equal(settled, false);
    assert.deepEqual(
      lifecycleEvents.map((event) => event.type),
      ["request.dispatched", "thread.started", "turn.started"],
    );

    const response = await pending;
    assert.equal(response.status, 200);
    assert.deepEqual(
      lifecycleEvents.map((event) => event.type),
      ["request.dispatched", "thread.started", "turn.started", "turn.completed"],
    );
  } finally {
    await rm(fixture.directory, { force: true, recursive: true });
  }
});

test("production runner isolates argv, stdin, environment, files, and aborts", async () => {
  const fixture = await createFakeCodexCli();
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousCodexKey = process.env.CODEX_API_KEY;
  process.env.OPENAI_API_KEY = "must-not-leak";
  process.env.CODEX_API_KEY = "must-not-leak";
  try {
    const transport = createCodexCliTransport({ cliPath: fixture.cliPath });
    const response = await transport.send(request);
    const body = response.body as { text: string };
    const execution = JSON.parse(body.text);
    assert.equal(execution.input, "Interpret bounded evidence.");
    assert.equal(existsSync(execution.cwd), false);
    assert.equal(dirname(execution.args[execution.args.indexOf("--output-schema") + 1]), execution.cwd);
    assert.equal(dirname(execution.args[execution.args.indexOf("--output-last-message") + 1]), execution.cwd);
    assert.equal(
      execution.args[execution.args.indexOf("--model") + 1],
      CODEX_CLI_GPT56_MODEL,
    );
    assert.ok(execution.args.includes('model_reasoning_effort="medium"'));
    assert.ok(execution.args.includes('web_search="disabled"'));
    assert.ok(execution.args.includes("project_doc_max_bytes=0"));
    assert.ok(execution.args.includes('shell_environment_policy.inherit="none"'));
    assert.ok(execution.args.includes("skills.include_instructions=false"));
    const developerConfig = execution.args.find(
      (value: string) => value.startsWith("developer_instructions="),
    );
    assert.match(developerConfig, /Never approve or activate/);
    for (const feature of CODEX_CLI_DISABLED_FEATURES) {
      assert.ok(
        execution.args.some(
          (value: string, index: number) =>
            value === feature && execution.args[index - 1] === "--disable",
        ),
        "missing disabled feature " + feature,
      );
    }
    assert.equal(execution.envKeys.includes("OPENAI_API_KEY"), false);
    assert.equal(execution.envKeys.includes("CODEX_API_KEY"), false);

    await assert.rejects(
      () => transport.send(requestWithUser("OVERSIZE")),
      /not a bounded regular file/,
    );
    await assert.rejects(
      () => transport.send(requestWithUser("MISSING")),
      /did not write its final structured message/,
    );

    const controller = new AbortController();
    const pending = transport.send(requestWithUser("SLOW"), {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(
      pending,
      (error: unknown) => error instanceof Error && error.name === "AbortError",
    );
    const abortedCwd = (await readFile(fixture.diagnosticPath, "utf8")).trim();
    assert.equal(existsSync(abortedCwd), false);
  } finally {
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    if (previousCodexKey === undefined) delete process.env.CODEX_API_KEY;
    else process.env.CODEX_API_KEY = previousCodexKey;
    await rm(fixture.directory, { force: true, recursive: true });
  }
});
