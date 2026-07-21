#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { canonicalJson } from "./canonical.js";
import { planCommand } from "./planners.js";
import { runRootCommand } from "./root-mode.js";
import { formatTerminalResult, runTerminalCommand, } from "./terminal.js";
export function usage() {
    return [
        "Terminal-first workflow:",
        "  living install --root <repository> [--synthetic] [--json]",
        "  living improve --root <repository> --provider <codex|api> [--json]",
        "  living status --root <repository> [--json]",
        "  living approve --root <repository> --evolution <id> --actor <id> --artifact-hash <sha256> --proof-hash <sha256> [--apply] [--json]",
        "  living apply --root <repository> --evolution <id> [--json]",
        "  living rollback --root <repository> --evolution <id> --actor <id> [--json]",
        "",
        "Advanced and compatibility commands:",
        "Usage: living init --root <repository> [--dry-run|--apply] [--synthetic]",
        "       living doctor --root <repository> [--synthetic]",
        "       living <map|analyze|snapshot> --root <repository>",
        "       living uninstall --root <repository> [--dry-run|--apply]",
        "       living <init|map|doctor|uninstall> --fixture <fixture.json> [--dry-run]",
        "       living doctor --fixture <fixture.json> [--config <config.json>] [--manifest <manifest.json>]",
        "",
        "Terminal-first commands are human-readable by default; --json emits canonical JSON.",
        "Install applies the create-only installation. Improve prepares but never approves or applies.",
        "Root mode is dry-run by default. Only init and uninstall accept explicit --apply.",
        "Fixture mode is the legacy deterministic planner and never writes to a host repository.",
    ].join("\n");
}
const COMMANDS = new Set([
    "init",
    "map",
    "doctor",
    "uninstall",
    "analyze",
    "snapshot",
]);
const TERMINAL_COMMANDS = new Set([
    "install",
    "improve",
    "status",
    "approve",
    "apply",
    "rollback",
]);
const VALUE_FLAGS = new Set(["--fixture", "--root", "--config", "--manifest"]);
const BOOLEAN_FLAGS = new Set(["--dry-run", "--apply", "--synthetic"]);
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
function isCommand(value) {
    return value !== undefined && COMMANDS.has(value);
}
function isTerminalCommand(value) {
    return (value !== undefined &&
        TERMINAL_COMMANDS.has(value));
}
function parseTerminalArguments(command, argv) {
    const values = new Map();
    const booleans = new Set();
    const allowedValues = new Set(["--root"]);
    const allowedBooleans = new Set(["--json"]);
    if (command === "improve")
        allowedValues.add("--provider");
    if (command === "approve" ||
        command === "apply" ||
        command === "rollback") {
        allowedValues.add("--evolution");
    }
    if (command === "approve" || command === "rollback") {
        allowedValues.add("--actor");
    }
    if (command === "approve") {
        allowedValues.add("--artifact-hash");
        allowedValues.add("--proof-hash");
        allowedBooleans.add("--apply");
    }
    if (command === "install")
        allowedBooleans.add("--synthetic");
    for (let index = 1; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === undefined)
            continue;
        if (allowedValues.has(token)) {
            if (values.has(token) || booleans.has(token)) {
                throw new TypeError(`${token} may only be provided once`);
            }
            const value = argv[index + 1];
            if (value === undefined || value.startsWith("--")) {
                throw new TypeError(`${token} requires a value`);
            }
            values.set(token, value);
            index += 1;
            continue;
        }
        if (allowedBooleans.has(token)) {
            if (booleans.has(token) || values.has(token)) {
                throw new TypeError(`${token} may only be provided once`);
            }
            booleans.add(token);
            continue;
        }
        if (token.startsWith("--")) {
            throw new TypeError(`Unknown option for ${command}: ${token}`);
        }
        throw new TypeError(`Unexpected argument: ${token}`);
    }
    const rootPath = values.get("--root");
    if (rootPath === undefined) {
        throw new TypeError(`${command} requires --root <repository>`);
    }
    const base = {
        mode: "terminal",
        rootPath,
        json: booleans.has("--json"),
    };
    if (command === "install") {
        return {
            ...base,
            command,
            synthetic: booleans.has("--synthetic"),
        };
    }
    if (command === "improve") {
        const provider = values.get("--provider");
        if (provider !== "codex" && provider !== "api") {
            throw new TypeError("improve requires --provider codex or --provider api");
        }
        return { ...base, command, provider: provider };
    }
    if (command === "status")
        return { ...base, command };
    const evolutionId = values.get("--evolution");
    if (evolutionId === undefined ||
        !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u.test(evolutionId)) {
        throw new TypeError(`${command} requires a valid --evolution <id>`);
    }
    if (command === "apply") {
        return { ...base, command, evolutionId };
    }
    const actor = values.get("--actor");
    if (actor === undefined ||
        !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u.test(actor)) {
        throw new TypeError(`${command} requires a valid --actor <id>`);
    }
    if (command === "approve") {
        const expectedArtifactHash = values.get("--artifact-hash");
        if (expectedArtifactHash === undefined || !SHA256.test(expectedArtifactHash)) {
            throw new TypeError("approve requires a valid --artifact-hash <sha256>");
        }
        const expectedProofHash = values.get("--proof-hash");
        if (expectedProofHash === undefined || !SHA256.test(expectedProofHash)) {
            throw new TypeError("approve requires a valid --proof-hash <sha256>");
        }
        return {
            ...base,
            command,
            evolutionId,
            actor,
            expectedArtifactHash,
            expectedProofHash,
            applyAfterApproval: booleans.has("--apply"),
        };
    }
    return { ...base, command, evolutionId, actor };
}
/** Strict parsing prevents a misspelled safety flag from silently changing behavior. */
export function parseArguments(argv) {
    const command = argv[0];
    if (isTerminalCommand(command)) {
        return parseTerminalArguments(command, argv);
    }
    if (!isCommand(command))
        throw new TypeError(usage());
    const values = new Map();
    const booleans = new Set();
    for (let index = 1; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === undefined)
            continue;
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
        if (token.startsWith("--"))
            throw new TypeError(`Unknown option: ${token}`);
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
        rootPath: rootPath,
        apply: booleans.has("--apply"),
        synthetic: booleans.has("--synthetic"),
        syntheticSpecified: booleans.has("--synthetic"),
    };
}
async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, "utf8"));
}
export async function executeCommand(argv) {
    const args = parseArguments(argv);
    if (args.mode === "terminal") {
        return runTerminalCommand(args);
    }
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
export async function main(argv = process.argv.slice(2)) {
    const args = parseArguments(argv);
    const output = await executeCommand(argv);
    process.stdout.write(args.mode === "terminal" && !args.json
        ? formatTerminalResult(output)
        : canonicalJson(output, true));
}
if (process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=main.js.map