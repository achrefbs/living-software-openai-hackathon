#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { canonicalJson } from "./canonical.js";
import { planCommand } from "./planners.js";
import { runRootCommand } from "./root-mode.js";
import type { AutomaticCliCommand, CliCommand, CliPlan } from "./types.js";

export interface FixtureArguments {
  readonly mode: "fixture";
  readonly command: CliCommand;
  readonly fixturePath: string;
  readonly configPath?: string;
  readonly manifestPath?: string;
}

export interface RootArguments {
  readonly mode: "root";
  readonly command: AutomaticCliCommand;
  readonly rootPath: string;
  readonly apply: boolean;
  readonly synthetic: boolean;
  readonly syntheticSpecified: boolean;
}

export type ParsedArguments = FixtureArguments | RootArguments;

export function usage(): string {
  return [
    "Usage: living init --root <repository> [--dry-run|--apply] [--synthetic]",
    "       living doctor --root <repository> [--synthetic]",
    "       living <map|analyze|snapshot> --root <repository>",
    "       living uninstall --root <repository> [--dry-run|--apply]",
    "       living <init|map|doctor|uninstall> --fixture <fixture.json> [--dry-run]",
    "       living doctor --fixture <fixture.json> [--config <config.json>] [--manifest <manifest.json>]",
    "",
    "Root mode is dry-run by default. Only init and uninstall accept explicit --apply.",
    "Fixture mode is the legacy deterministic planner and never writes to a host repository.",
  ].join("\n");
}

const COMMANDS = new Set<AutomaticCliCommand>([
  "init",
  "map",
  "doctor",
  "uninstall",
  "analyze",
  "snapshot",
]);
const VALUE_FLAGS = new Set(["--fixture", "--root", "--config", "--manifest"]);
const BOOLEAN_FLAGS = new Set(["--dry-run", "--apply", "--synthetic"]);

function isCommand(value: string | undefined): value is AutomaticCliCommand {
  return value !== undefined && COMMANDS.has(value as AutomaticCliCommand);
}

/** Strict parsing prevents a misspelled safety flag from silently changing behavior. */
export function parseArguments(argv: readonly string[]): ParsedArguments {
  const command = argv[0];
  if (!isCommand(command)) throw new TypeError(usage());

  const values = new Map<string, string>();
  const booleans = new Set<string>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;
    if (VALUE_FLAGS.has(token)) {
      if (values.has(token) || booleans.has(token)) {
        throw new TypeError(`${token} may only be provided once`);
      }
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new TypeError(`${token} requires a path`);
      }
      values.set(token, value);
      index += 1;
      continue;
    }
    if (BOOLEAN_FLAGS.has(token)) {
      if (booleans.has(token) || values.has(token)) {
        throw new TypeError(`${token} may only be provided once`);
      }
      booleans.add(token);
      continue;
    }
    if (token.startsWith("--")) throw new TypeError(`Unknown option: ${token}`);
    throw new TypeError(`Unexpected argument: ${token}`);
  }

  const fixturePath = values.get("--fixture");
  const rootPath = values.get("--root");
  if (fixturePath !== undefined && rootPath !== undefined) {
    throw new TypeError("--fixture and --root are mutually exclusive");
  }
  if (fixturePath === undefined && rootPath === undefined) {
    throw new TypeError("Exactly one of --fixture or --root is required\n\n" + usage());
  }
  if (booleans.has("--apply") && booleans.has("--dry-run")) {
    throw new TypeError("--apply and --dry-run are mutually exclusive");
  }

  const configPath = values.get("--config");
  const manifestPath = values.get("--manifest");
  if (fixturePath !== undefined) {
    if (command === "analyze" || command === "snapshot") {
      throw new TypeError(`${command} is only available with --root`);
    }
    if (booleans.has("--apply")) {
      throw new TypeError("--apply is unavailable for --fixture mode; use --dry-run");
    }
    if (booleans.has("--synthetic")) {
      throw new TypeError("--synthetic is only available with --root");
    }
    return {
      mode: "fixture",
      command,
      fixturePath,
      ...(configPath === undefined ? {} : { configPath }),
      ...(manifestPath === undefined ? {} : { manifestPath }),
    };
  }

  if (configPath !== undefined || manifestPath !== undefined) {
    throw new TypeError("--config and --manifest are only available with --fixture");
  }
  if (booleans.has("--apply") && command !== "init" && command !== "uninstall") {
    throw new TypeError(`--apply is unavailable for ${command}; the command is read-only`);
  }
  if (booleans.has("--synthetic") && command !== "init" && command !== "doctor") {
    throw new TypeError(`--synthetic is unavailable for ${command}`);
  }
  return {
    mode: "root",
    command,
    rootPath: rootPath as string,
    apply: booleans.has("--apply"),
    synthetic: booleans.has("--synthetic"),
    syntheticSpecified: booleans.has("--synthetic"),
  };
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

export async function executeCommand(
  argv: readonly string[],
): Promise<CliPlan | Record<string, unknown>> {
  const args = parseArguments(argv);
  if (args.mode === "root") {
    return runRootCommand(args.command, {
      root: args.rootPath,
      apply: args.apply,
      synthetic: args.synthetic,
      syntheticSpecified: args.syntheticSpecified,
    });
  }

  const fixture = await readJson(args.fixturePath);
  const config = args.configPath === undefined ? undefined : await readJson(args.configPath);
  const manifest = args.manifestPath === undefined ? undefined : await readJson(args.manifestPath);
  return planCommand(args.command, fixture, {
    ...(config === undefined ? {} : { config }),
    ...(manifest === undefined ? {} : { manifest }),
  });
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  process.stdout.write(canonicalJson(await executeCommand(argv), true));
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
