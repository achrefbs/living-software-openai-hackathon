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
        "       living map --root <repository>",
        "       living analyze --root <repository> [--json]",
        "       living snapshot --root <repository>",
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
const BOOLEAN_FLAGS = new Set(["--dry-run", "--apply", "--synthetic", "--json"]);
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
        if (booleans.has("--json")) {
            throw new TypeError("--json is unavailable for --fixture mode");
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
    if (booleans.has("--json") && command !== "analyze") {
        throw new TypeError(`--json is unavailable for ${command}; only analyze supports it in root mode`);
    }
    return {
        mode: "root",
        command,
        rootPath: rootPath,
        apply: booleans.has("--apply"),
        synthetic: booleans.has("--synthetic"),
        syntheticSpecified: booleans.has("--synthetic"),
        json: booleans.has("--json"),
    };
}
function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : null;
}
function count(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? value
        : 0;
}
/** Human-first projection of the canonical analyze result. */
export function formatAnalyzeResult(output) {
    const manifest = record(output.manifest);
    const metricReport = record(output.metricReport);
    const totals = record(metricReport?.totals);
    const lines = [
        "",
        "Living Software analysis",
        `App: ${String(manifest?.appId ?? "unknown")}`,
        `Captured: ${count(totals?.events)} events · ${count(totals?.cases)} workflows · ${count(totals?.sessions)} sessions`,
    ];
    const metricValues = Array.isArray(metricReport?.values) ? metricReport.values : [];
    lines.push(`Matrix: ${metricValues.length} privacy-safe behavior measurements are ready for AI discovery.`, "Analysis: analyze builds the behavior matrix; it does not choose or gate a feature.", "Clues: route/action/outcome sequences, frequency, timing, failures, visibility, target size, distance, scrolling, LCP, INP, and CLS.", "AI decision: during improve, GPT-5.6 examines the full matrix, chooses the pattern that matters, and proposes the software change.");
    if (typeof output.root === "string") {
        lines.push("", "Next:", `  npm run living -- improve --root ${JSON.stringify(output.root)} --provider codex`);
    }
    return `${lines.join("\n")}\n`;
}
function tokenTotal(event) {
    return event.tokenUsage.inputTokens + event.tokenUsage.outputTokens;
}
export function formatTerminalLifecycleLine(event) {
    switch (event.type) {
        case "evidence.package.validated":
            return `✓ Evidence package verified (${event.dataOrigin})`;
        case "proposal.reused":
            return `✓ Existing evidence-bound proposal reused (${event.status})`;
        case "model.request.dispatched":
            return `→ GPT-5.6 ${event.operation} requested via ${event.transport}`;
        case "model.thread.started":
            return `  Codex run started: ${event.threadId}`;
        case "model.turn.started":
            return `  GPT-5.6 is working on the ${event.operation}`;
        case "model.turn.completed":
            return `✓ GPT-5.6 ${event.operation} completed · ${tokenTotal(event)} tokens`;
        case "model.result.validated":
            return `✓ Structured ${event.operation} validated${event.runId === null ? "" : ` · run ${event.runId}`}`;
        case "source-candidates.selected":
            return `✓ ${event.count} bounded source candidate${event.count === 1 ? "" : "s"} selected${event.candidates[0] === undefined ? "" : ` · ${event.candidates[0].path}`}`;
        case "evolution.preparation.started":
            return `→ Compiling and proving GPT-5.6 patch · ${event.targetPath}`;
        case "evolution.prepared": {
            const passed = event.proofChecks.filter((check) => check.status === "passed").length;
            return `✓ Proposal prepared · ${passed}/${event.proofChecks.length} proof checks passed · ${event.evolutionId}`;
        }
    }
}
/** Safe progress projection: no prompts, reasoning, or source content. */
export function formatSourceEvolutionProgressLine(event) {
    switch (event.stage) {
        case "prepare.compilation-started":
            return `  [prepare] Compiling bounded patch · ${event.targetPath}`;
        case "prepare.proof-started":
            return "  [prepare] Running deterministic proof";
        case "prepare.proof-check-completed":
            return `  [proof] ✓ ${event.checkId}`;
        case "prepare.persisted":
            return `  [prepare] Audit ledger persisted · revision ${event.revision}`;
        case "approve.hashes-selected":
            return "  [approve] Exact artifact and proof hashes selected";
        case "approve.receipts-persisted":
            return `  [approve] Human approval receipt persisted · revision ${event.revision}`;
        case "apply.artifact-selected":
            return `  [apply] Approved artifact selected · ${event.targetPath}`;
        case "apply.preimage-verified":
            return "  [apply] Current source matches approved preimage";
        case "apply.postimage-written":
            return `  [apply] GPT-5.6 postimage written · ${event.targetPath}`;
        case "apply.receipt-state-persisted":
            return `  [apply] Audit receipt persisted · revision ${event.revision}`;
        case "apply.hash-transition-completed":
            return "  [apply] ✓ Source hash transition verified";
        case "rollback.artifact-selected":
            return `  [rollback] Applied artifact selected · ${event.targetPath}`;
        case "rollback.postimage-verified":
            return "  [rollback] Current source matches applied postimage";
        case "rollback.preimage-written":
            return `  [rollback] Original preimage restored · ${event.targetPath}`;
        case "rollback.receipt-state-persisted":
            return `  [rollback] Audit receipt persisted · revision ${event.revision}`;
        case "rollback.hash-transition-completed":
            return "  [rollback] ✓ Original source hash verified";
    }
}
export function createTerminalRunOptions(args, write) {
    if (args.json || args.command === "install" || args.command === "status") {
        return {};
    }
    return {
        lifecycleReporter: (event) => write(formatTerminalLifecycleLine(event)),
        evolutionProgressObserver: (event) => write(formatSourceEvolutionProgressLine(event)),
    };
}
export function isHelpRequest(argv) {
    return argv.length === 1 && (argv[0] === "--help" || argv[0] === "help");
}
async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, "utf8"));
}
export async function executeCommand(argv, terminalOptions = {}) {
    const args = parseArguments(argv);
    if (args.mode === "terminal") {
        return runTerminalCommand(args, {}, terminalOptions);
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
    if (isHelpRequest(argv)) {
        process.stdout.write(`${usage()}\n`);
        return;
    }
    const args = parseArguments(argv);
    const terminalOptions = args.mode === "terminal"
        ? createTerminalRunOptions(args, (line) => process.stderr.write(`${line}\n`))
        : {};
    const output = await executeCommand(argv, terminalOptions);
    process.stdout.write(args.mode === "terminal" && !args.json
        ? formatTerminalResult(output)
        : args.mode === "root" && args.command === "analyze" && !args.json
            ? formatAnalyzeResult(output)
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