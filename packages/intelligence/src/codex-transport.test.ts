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
import type { ResponsesRequest } from "./types.js";

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
      schema: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
        additionalProperties: false,
      },
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
    'process.stdout.write(output.join("\\n") + "\\n");',
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
    /fixed Living Software role contract/,
  );
  await assert.rejects(
    () => transport.send({
      ...request,
      model: "gpt-5.5",
    } as unknown as ResponsesRequest),
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
