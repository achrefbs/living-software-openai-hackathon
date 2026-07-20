import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  boundProductContext,
  buildResponsesRequest,
  CodexCliUnavailableError,
  createCodexCliTransport,
  createFetchTransport,
  createIntelligenceClient,
  MissingApiKeyError,
} from "@living-software/intelligence";

import { buildNeutralDemo } from "./run-neutral-demo.mjs";

const PROVIDERS = new Set(["codex", "api"]);
const execFileAsync = promisify(execFile);

export function parseGpt56DemoOptions(
  args = process.argv.slice(2),
  environment = process.env,
) {
  let provider = environment.LIVING_GPT56_PROVIDER?.trim() || "codex";
  let providerFlagSeen = false;
  let outFlagSeen = false;
  let out = null;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    let value;
    if (argument === "--out") {
      if (outFlagSeen) throw new Error("--out may only be supplied once");
      out = args[index + 1];
      if (out === undefined || out.startsWith("-")) {
        throw new Error("--out requires a JSON path under docs/proof");
      }
      index += 1;
      outFlagSeen = true;
      continue;
    } else if (argument?.startsWith("--out=")) {
      if (outFlagSeen) throw new Error("--out may only be supplied once");
      out = argument.slice("--out=".length);
      if (out === "") throw new Error("--out requires a JSON path under docs/proof");
      outFlagSeen = true;
      continue;
    } else if (argument === "--provider") {
      if (providerFlagSeen) throw new Error("--provider may only be supplied once");
      value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error("--provider requires codex or api");
      }
      index += 1;
    } else if (argument?.startsWith("--provider=")) {
      if (providerFlagSeen) throw new Error("--provider may only be supplied once");
      value = argument.slice("--provider=".length);
    } else {
      throw new Error("Unknown option: " + argument);
    }
    providerFlagSeen = true;
    provider = value;
  }

  if (!PROVIDERS.has(provider)) {
    throw new Error("Provider must be codex or api");
  }
  return { provider, out, help };
}

export function createGpt56DemoClient(provider) {
  if (provider === "codex") {
    return createIntelligenceClient(createCodexCliTransport(), {
      timeoutMs: 120_000,
    });
  }
  if (provider === "api") {
    return createIntelligenceClient(createFetchTransport(), {
      timeoutMs: 120_000,
    });
  }
  throw new Error("Provider must be codex or api");
}

export async function runGpt56Demo(
  intelligence = createIntelligenceClient(),
  input,
) {
  const { manifest, opportunity, evidenceEvents } = input ?? await buildNeutralDemo();
  return intelligence.draftEvolutionBrief({
    manifest,
    opportunity,
    evidenceEvents,
  });
}

function sha256(value) {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}

async function gitSource(cwd) {
  const [commitResult, statusResult] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      windowsHide: true,
    }),
    execFileAsync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
      windowsHide: true,
    }),
  ]);
  return {
    commit: commitResult.stdout.trim(),
    dirty: statusResult.stdout.trim() !== "",
  };
}

export function buildGpt56ProofRecord(
  provider,
  result,
  prepared,
  { now = () => new Date() } = {},
) {
  const expectedTransport = provider === "codex" ? "codex-cli" : "responses-api";
  if (result?.provenance?.transport !== expectedTransport) {
    throw new Error("GPT-5.6 result provenance does not match the selected provider");
  }
  if (
    provider === "codex" &&
    (
      result.provenance.responseId !== null ||
      typeof result.provenance.codexThreadId !== "string" ||
      result.provenance.actualResponseModel !== null ||
      result.provenance.responseStoreRequested !== null ||
      result.provenance.localSessionPersisted !== false
    )
  ) {
    throw new Error("Codex CLI result contains contradictory provider provenance");
  }
  if (
    provider === "api" &&
    (
      typeof result.provenance.responseId !== "string" ||
      result.provenance.codexThreadId !== null ||
      typeof result.provenance.actualResponseModel !== "string" ||
      !/^gpt-5\.6(?:$|[-_])/u.test(result.provenance.actualResponseModel) ||
      result.provenance.responseStoreRequested !== false ||
      result.provenance.localSessionPersisted !== null
    )
  ) {
    throw new Error("Responses API result contains contradictory provider provenance");
  }
  const { manifest, opportunity, evidenceEvents } = prepared.input;
  const request = prepared.request;
  return {
    schemaVersion: "living.gpt56-proof/v1",
    recordedAt: now().toISOString(),
    selectedProvider: provider,
    source: prepared.source,
    request: {
      requestedModel: request.model,
      reasoningEffort: request.reasoning.effort,
      responseStoreRequested: provider === "api" ? request.store : null,
      schemaName: request.text.format.name,
      boundaryRequestSha256: sha256(JSON.stringify(request)),
      outputSchemaSha256: sha256(JSON.stringify(request.text.format.schema)),
    },
    evidence: {
      appId: manifest.appId,
      manifestHash: manifest.contentHash,
      opportunityId: opportunity.opportunityId,
      eventSetHash: opportunity.evidence.eventSetHash,
      eventCount: evidenceEvents.length,
      sessionCount: opportunity.evidence.sessionCount,
      subjectCount: opportunity.evidence.subjectCount,
      dataOrigin: opportunity.evidence.dataOrigin,
    },
    localValidation: {
      schema: "passed",
      references: "passed",
      governance: "passed",
    },
    result,
  };
}

async function resolveProofTarget(path, cwd) {
  if (isAbsolute(path)) {
    throw new Error("--out must be a repository-relative path under docs/proof");
  }
  const proofRoot = await realpath(join(cwd, "docs", "proof"));
  const target = resolve(cwd, path);
  const parent = await realpath(dirname(target));
  const comparable = (value) => process.platform === "win32"
    ? value.toLowerCase()
    : value;
  if (
    comparable(parent) !== comparable(proofRoot) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u.test(basename(target))
  ) {
    throw new Error("--out must name one JSON file directly under docs/proof");
  }
  return target;
}

export async function preflightGpt56Proof(
  path,
  cwd = process.cwd(),
  {
    getGitSource = gitSource,
    buildInput = buildNeutralDemo,
  } = {},
) {
  const [source, target, input] = await Promise.all([
    getGitSource(cwd),
    resolveProofTarget(path, cwd),
    buildInput(),
  ]);
  if (source.dirty) {
    throw new Error("Refusing to record GPT-5.6 proof from a dirty worktree");
  }
  if (existsSync(target)) {
    throw new Error("Refusing to overwrite an existing GPT-5.6 proof artifact");
  }
  const context = boundProductContext(
    input.manifest,
    input.opportunity,
    input.evidenceEvents,
  );
  return {
    cwd,
    source,
    target,
    input,
    request: buildResponsesRequest(input.opportunity, context),
  };
}

export async function postflightGpt56Proof(
  prepared,
  { getGitSource = gitSource } = {},
) {
  const source = await getGitSource(prepared.cwd);
  if (
    source.dirty ||
    source.commit !== prepared.source.commit ||
    existsSync(prepared.target)
  ) {
    throw new Error(
      "Refusing to record GPT-5.6 proof because source or output changed during the run",
    );
  }
}

export async function writeGpt56Proof(path, record, cwd = process.cwd()) {
  const target = await resolveProofTarget(path, cwd);
  await writeFile(target, JSON.stringify(record, null, 2) + "\n", {
    encoding: "utf8",
    flag: "wx",
  });
  return target;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let options;
  try {
    options = parseGpt56DemoOptions();
    if (options.help) {
      process.stdout.write(
        [
          "Usage: npm run demo:gpt56 -- [--provider codex|api] [--out docs/proof/name.json]",
          "",
          "Providers:",
          "  codex  Use the authenticated Codex CLI (default).",
          "  api    Use the OpenAI Responses API with OPENAI_API_KEY.",
          "",
          "Environment: LIVING_GPT56_PROVIDER=codex|api",
          "",
        ].join("\n"),
      );
      process.exitCode = 0;
    } else {
      let prepared = null;
      if (options.out !== null) {
        prepared = await preflightGpt56Proof(options.out);
      }
      const result = await runGpt56Demo(
        createGpt56DemoClient(options.provider),
        prepared?.input,
      );
      const output = {
        schemaVersion: "living.gpt56-demo-result/v1",
        selectedProvider: options.provider,
        ...result,
      };
      if (options.out !== null && prepared !== null) {
        await postflightGpt56Proof(prepared);
        const proof = buildGpt56ProofRecord(
          options.provider,
          result,
          prepared,
        );
        const savedPath = await writeGpt56Proof(options.out, proof);
        process.stderr.write("Saved sanitized GPT-5.6 proof to " + savedPath + "\n");
      }
      process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    }
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      process.stderr.write(
        "OPENAI_API_KEY is required when --provider api is selected.\n",
      );
    } else if (error instanceof CodexCliUnavailableError) {
      process.stderr.write(
        "Codex CLI is unavailable. Install it and sign in, or use --provider api.\n",
      );
    } else {
      process.stderr.write(
        (error instanceof Error ? error.message : String(error)) + "\n",
      );
    }
    process.exitCode = 1;
  }
}
