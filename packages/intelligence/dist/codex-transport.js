import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, extname, isAbsolute, join, resolve, } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { assertIntelligenceRequestContract, governanceForRequest, } from "./request-contract.js";
import { reportIntelligenceLifecycle } from "./lifecycle.js";
const MAX_STREAM_BYTES = 2 * 1024 * 1024;
const MAX_FINAL_MESSAGE_BYTES = 1024 * 1024;
const ALLOWED_ITEM_TYPES = new Set(["agent_message", "reasoning"]);
const ALLOWED_EVENT_TYPES = new Set([
    "thread.started",
    "turn.started",
    "turn.completed",
    "item.started",
    "item.completed",
]);
export const CODEX_CLI_DISABLED_FEATURES = [
    "apps",
    "auth_elicitation",
    "browser_use",
    "browser_use_external",
    "browser_use_full_cdp_access",
    "code_mode_host",
    "computer_use",
    "fast_mode",
    "goals",
    "hooks",
    "image_generation",
    "in_app_browser",
    "mentions_v2",
    "multi_agent",
    "plugin_sharing",
    "plugins",
    "remote_plugin",
    "shell_snapshot",
    "shell_tool",
    "skill_mcp_dependency_install",
    "tool_call_mcp_elicitation",
    "tool_suggest",
    "workspace_dependencies",
];
export const CODEX_CLI_GPT56_MODEL = "gpt-5.6-terra";
function codexCliDeveloperInstructions(request) {
    return [
        governanceForRequest(request),
        "This is a non-interactive structured-output invocation.",
        "Do not call any tool, inspect any file, browse, execute commands, plan work, or modify anything.",
        "Return only one JSON object conforming to the supplied output schema.",
    ].join("\n");
}
export class CodexCliUnavailableError extends Error {
    constructor(message = "Codex CLI is not installed or is not available on PATH") {
        super(message);
        this.name = "CodexCliUnavailableError";
    }
}
export class CodexCliExecutionError extends Error {
    constructor(message) {
        super(message);
        this.name = "CodexCliExecutionError";
    }
}
function configuredExecutable(path) {
    const extension = extname(path).toLowerCase();
    if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
        return { file: process.execPath, prefixArgs: [path] };
    }
    if (process.platform === "win32" && (extension === ".cmd" || extension === ".ps1")) {
        const architecture = process.arch === "arm64"
            ? ["codex-win32-arm64", "aarch64-pc-windows-msvc"]
            : ["codex-win32-x64", "x86_64-pc-windows-msvc"];
        const nativeExecutable = join(dirname(path), "node_modules", "@openai", "codex", "node_modules", "@openai", architecture[0], "vendor", architecture[1], "bin", "codex.exe");
        if (existsSync(nativeExecutable)) {
            return { file: nativeExecutable, prefixArgs: [] };
        }
        const moduleEntry = join(dirname(path), "node_modules", "@openai", "codex", "bin", "codex.js");
        if (existsSync(moduleEntry)) {
            return { file: process.execPath, prefixArgs: [moduleEntry] };
        }
        throw new CodexCliUnavailableError("LIVING_CODEX_CLI_PATH must point to codex.exe or the Codex cli.js entry on Windows");
    }
    return { file: path, prefixArgs: [] };
}
function resolveCodexExecutable(cliPath) {
    const configured = cliPath?.trim() || process.env.LIVING_CODEX_CLI_PATH?.trim();
    if (configured !== undefined && configured !== "") {
        const executablePath = /[\\/]/u.test(configured) && !isAbsolute(configured)
            ? resolve(configured)
            : configured;
        if (!existsSync(executablePath) && /[\\/]/u.test(executablePath)) {
            throw new CodexCliUnavailableError("Configured Codex CLI path does not exist");
        }
        return configuredExecutable(executablePath);
    }
    if (process.platform !== "win32") {
        return { file: "codex", prefixArgs: [] };
    }
    const pathValue = process.env.Path ?? process.env.PATH ?? "";
    for (const entry of pathValue.split(delimiter).filter((value) => value !== "")) {
        const nativeExecutable = join(entry, "codex.exe");
        if (existsSync(nativeExecutable)) {
            return { file: nativeExecutable, prefixArgs: [] };
        }
        const commandShim = join(entry, "codex.cmd");
        const architecture = process.arch === "arm64"
            ? ["codex-win32-arm64", "aarch64-pc-windows-msvc"]
            : ["codex-win32-x64", "x86_64-pc-windows-msvc"];
        const packagedNativeExecutable = join(entry, "node_modules", "@openai", "codex", "node_modules", "@openai", architecture[0], "vendor", architecture[1], "bin", "codex.exe");
        if (existsSync(commandShim) && existsSync(packagedNativeExecutable)) {
            return { file: packagedNativeExecutable, prefixArgs: [] };
        }
        const moduleEntry = join(entry, "node_modules", "@openai", "codex", "bin", "codex.js");
        if (existsSync(commandShim) && existsSync(moduleEntry)) {
            return { file: process.execPath, prefixArgs: [moduleEntry] };
        }
    }
    throw new CodexCliUnavailableError();
}
function codexEnvironment() {
    const allowed = new Set([
        "APPDATA",
        "CODEX_HOME",
        "COMSPEC",
        "HOME",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "LANG",
        "LC_ALL",
        "LOCALAPPDATA",
        "NODE_EXTRA_CA_CERTS",
        "NO_PROXY",
        "PATH",
        "PATHEXT",
        "SSL_CERT_DIR",
        "SSL_CERT_FILE",
        "SYSTEMROOT",
        "TEMP",
        "TERM",
        "TMP",
        "TMPDIR",
        "USERPROFILE",
        "WINDIR",
        "XDG_CONFIG_HOME",
    ]);
    const result = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && allowed.has(key.toUpperCase())) {
            result[key] = value;
        }
    }
    return result;
}
function buildPrompt(request) {
    const governance = governanceForRequest(request);
    const developer = request.input.filter((message) => message.role === "developer");
    const user = request.input.filter((message) => message.role === "user");
    if (developer.length !== 1 ||
        developer[0]?.content !== governance ||
        user.length !== 1) {
        throw new CodexCliExecutionError("Codex CLI transport accepts only the fixed Living Software role contract");
    }
    return user[0].content;
}
function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function safeDetail(value) {
    const detail = typeof value === "string"
        ? value
        : JSON.stringify(value) ?? "unknown error";
    return detail.slice(0, 500);
}
function usageInteger(usage, key) {
    const value = usage[key];
    return Number.isSafeInteger(value) && Number(value) >= 0
        ? Number(value)
        : undefined;
}
function completeUsage(value) {
    const usage = record(value);
    if (usage === undefined) {
        throw new CodexCliExecutionError("Codex CLI did not report complete token usage");
    }
    const inputTokens = usageInteger(usage, "input_tokens");
    const cachedInputTokens = usageInteger(usage, "cached_input_tokens");
    const outputTokens = usageInteger(usage, "output_tokens");
    const reasoningOutputTokens = usageInteger(usage, "reasoning_output_tokens");
    if (inputTokens === undefined ||
        cachedInputTokens === undefined ||
        outputTokens === undefined ||
        reasoningOutputTokens === undefined) {
        throw new CodexCliExecutionError("Codex CLI did not report complete token usage");
    }
    return Object.freeze({
        inputTokens,
        cachedInputTokens,
        outputTokens,
        reasoningOutputTokens,
    });
}
function createJsonlInspector(schemaName, lifecycleReporter) {
    let threadId;
    let lifecycle = "initial";
    let threadStarted = 0;
    let turnStarted = 0;
    let turnCompleted = 0;
    let usage;
    let agentMessage;
    let lineCount = 0;
    const acceptLine = (line) => {
        if (line.trim() === "")
            return;
        lineCount += 1;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            throw new CodexCliExecutionError("Codex CLI returned malformed JSONL");
        }
        const event = record(parsed);
        if (event === undefined || typeof event.type !== "string") {
            throw new CodexCliExecutionError("Codex CLI returned an invalid JSONL event");
        }
        if (event.type === "turn.failed" || event.type === "error") {
            throw new CodexCliExecutionError("Codex CLI reported a failed turn");
        }
        if (!ALLOWED_EVENT_TYPES.has(event.type)) {
            throw new CodexCliExecutionError("Codex CLI returned an unexpected event type: " + safeDetail(event.type));
        }
        if (event.type === "thread.started") {
            if (lifecycle !== "initial") {
                throw new CodexCliExecutionError("Codex CLI returned an invalid event order");
            }
            lifecycle = "thread";
            threadStarted += 1;
            if (typeof event.thread_id !== "string" ||
                !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(event.thread_id)) {
                throw new CodexCliExecutionError("Codex CLI did not report a valid thread id");
            }
            threadId = event.thread_id;
            reportIntelligenceLifecycle(lifecycleReporter, {
                type: "thread.started",
                schemaName,
                transport: "codex-cli",
                threadId,
            });
        }
        else if (event.type === "turn.started") {
            if (lifecycle !== "thread") {
                throw new CodexCliExecutionError("Codex CLI returned an invalid event order");
            }
            lifecycle = "turn";
            turnStarted += 1;
            reportIntelligenceLifecycle(lifecycleReporter, {
                type: "turn.started",
                schemaName,
                transport: "codex-cli",
                threadId: threadId,
            });
        }
        else if (event.type === "turn.completed") {
            if (lifecycle !== "turn") {
                throw new CodexCliExecutionError("Codex CLI returned an invalid event order");
            }
            usage = completeUsage(event.usage);
            lifecycle = "completed";
            turnCompleted += 1;
            reportIntelligenceLifecycle(lifecycleReporter, {
                type: "turn.completed",
                schemaName,
                transport: "codex-cli",
                threadId: threadId,
                tokenUsage: usage,
            });
        }
        else if (event.type === "item.started" || event.type === "item.completed") {
            if (lifecycle !== "turn") {
                throw new CodexCliExecutionError("Codex CLI returned an invalid event order");
            }
            const item = record(event.item);
            const itemType = item?.type;
            if (typeof itemType !== "string" || !ALLOWED_ITEM_TYPES.has(itemType)) {
                throw new CodexCliExecutionError("Codex CLI attempted a disallowed tool or plan item: " + safeDetail(itemType));
            }
            if (event.type === "item.completed" && itemType === "agent_message") {
                if (agentMessage !== undefined ||
                    typeof item?.text !== "string" ||
                    item.text.trim() === "" ||
                    Buffer.byteLength(item.text, "utf8") > MAX_FINAL_MESSAGE_BYTES) {
                    throw new CodexCliExecutionError("Codex CLI returned an invalid final agent message");
                }
                agentMessage = item.text;
            }
        }
    };
    return {
        acceptLine,
        finish(finalMessage) {
            if (lineCount === 0) {
                throw new CodexCliExecutionError("Codex CLI returned no JSONL events");
            }
            if (threadId === undefined ||
                threadStarted !== 1 ||
                turnStarted !== 1 ||
                turnCompleted !== 1 ||
                lifecycle !== "completed" ||
                usage === undefined ||
                agentMessage === undefined) {
                throw new CodexCliExecutionError("Codex CLI did not complete a verifiable turn");
            }
            const normalizeMessage = (value) => value.replace(/\r\n/gu, "\n").trimEnd();
            if (normalizeMessage(agentMessage) !== normalizeMessage(finalMessage)) {
                throw new CodexCliExecutionError("Codex CLI JSONL message did not match its structured output file");
            }
            return { threadId, usage };
        },
    };
}
function inspectJsonl(stdout, finalMessage, schemaName, lifecycleReporter) {
    const inspector = createJsonlInspector(schemaName, lifecycleReporter);
    for (const line of stdout.split(/\r?\n/u))
        inspector.acceptLine(line);
    return inspector.finish(finalMessage);
}
function abortError() {
    const error = new Error("Codex CLI request aborted");
    error.name = "AbortError";
    return error;
}
async function defaultRun(invocation, schemaName, lifecycleReporter, cliPath) {
    const executable = resolveCodexExecutable(cliPath);
    const directory = await mkdtemp(join(tmpdir(), "living-gpt56-"));
    const schemaPath = join(directory, "output-schema.json");
    const outputPath = join(directory, "last-message.json");
    let primaryError;
    try {
        await writeFile(schemaPath, JSON.stringify(invocation.schema), {
            encoding: "utf8",
            flag: "wx",
        });
        const args = [
            ...executable.prefixArgs,
            "exec",
            "--strict-config",
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--model",
            invocation.model,
            ...CODEX_CLI_DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
            "-c",
            'model_reasoning_effort="' + invocation.reasoningEffort + '"',
            "-c",
            'web_search="disabled"',
            "-c",
            "project_doc_max_bytes=0",
            "-c",
            'shell_environment_policy.inherit="none"',
            "-c",
            "skills.include_instructions=false",
            "-c",
            "developer_instructions=" + JSON.stringify(invocation.developerInstructions),
            "--output-schema",
            schemaPath,
            "--output-last-message",
            outputPath,
            "--json",
            "--cd",
            directory,
            "-",
        ];
        const result = await new Promise((resolve, reject) => {
            if (invocation.signal?.aborted) {
                reject(abortError());
                return;
            }
            const child = spawn(executable.file, args, {
                cwd: directory,
                env: codexEnvironment(),
                shell: false,
                stdio: ["pipe", "pipe", "pipe"],
                windowsHide: true,
            });
            const stdout = [];
            const stderr = [];
            const decoder = new StringDecoder("utf8");
            const incrementalInspector = createJsonlInspector(schemaName, lifecycleReporter);
            let pendingLine = "";
            let incrementalFailed = false;
            let stdoutBytes = 0;
            let stderrBytes = 0;
            let settled = false;
            let terminalError;
            const stopWithError = (error) => {
                if (settled || terminalError !== undefined)
                    return;
                terminalError = error;
                child.kill("SIGKILL");
            };
            const onAbort = () => stopWithError(abortError());
            const inspectDecoded = (decoded, ending = false) => {
                if (incrementalFailed)
                    return;
                pendingLine += decoded;
                try {
                    let newline = pendingLine.indexOf("\n");
                    while (newline >= 0) {
                        incrementalInspector.acceptLine(pendingLine.slice(0, newline).replace(/\r$/u, ""));
                        pendingLine = pendingLine.slice(newline + 1);
                        newline = pendingLine.indexOf("\n");
                    }
                    if (ending && pendingLine !== "") {
                        incrementalInspector.acceptLine(pendingLine.replace(/\r$/u, ""));
                        pendingLine = "";
                    }
                }
                catch {
                    // The strict full-stream validator below remains authoritative. Stop
                    // reporting this unverified stream prefix, but do not affect the run.
                    incrementalFailed = true;
                }
            };
            reportIntelligenceLifecycle(lifecycleReporter, {
                type: "request.dispatched",
                schemaName,
                transport: "codex-cli",
            });
            invocation.signal?.addEventListener("abort", onAbort, { once: true });
            if (invocation.signal?.aborted)
                onAbort();
            child.once("error", (error) => {
                if (settled)
                    return;
                settled = true;
                invocation.signal?.removeEventListener("abort", onAbort);
                reject(error instanceof Error
                    ? new CodexCliUnavailableError(error.message)
                    : new CodexCliUnavailableError());
            });
            child.stdout.on("data", (chunk) => {
                stdoutBytes += chunk.length;
                if (stdoutBytes > MAX_STREAM_BYTES) {
                    stopWithError(new CodexCliExecutionError("Codex CLI stdout exceeded the safety limit"));
                    return;
                }
                stdout.push(chunk);
                inspectDecoded(decoder.write(chunk));
            });
            child.stderr.on("data", (chunk) => {
                stderrBytes += chunk.length;
                if (stderrBytes > MAX_STREAM_BYTES) {
                    stopWithError(new CodexCliExecutionError("Codex CLI stderr exceeded the safety limit"));
                    return;
                }
                stderr.push(chunk);
            });
            child.once("close", (code) => {
                inspectDecoded(decoder.end(), true);
                invocation.signal?.removeEventListener("abort", onAbort);
                if (settled)
                    return;
                settled = true;
                if (terminalError !== undefined) {
                    reject(terminalError);
                    return;
                }
                resolve({
                    exitCode: code ?? 1,
                    stdout: Buffer.concat(stdout).toString("utf8"),
                    stderr: Buffer.concat(stderr).toString("utf8"),
                });
            });
            child.stdin.once("error", (error) => stopWithError(error));
            child.stdin.end(invocation.prompt, "utf8");
        });
        if (invocation.signal?.aborted)
            throw abortError();
        let finalMessage = "";
        if (result.exitCode === 0) {
            let outputInfo;
            try {
                outputInfo = await lstat(outputPath);
            }
            catch {
                throw new CodexCliExecutionError("Codex CLI did not write its final structured message");
            }
            if (!outputInfo.isFile() ||
                outputInfo.isSymbolicLink() ||
                outputInfo.size < 1 ||
                outputInfo.size > MAX_FINAL_MESSAGE_BYTES) {
                throw new CodexCliExecutionError("Codex CLI final message was not a bounded regular file");
            }
            finalMessage = await readFile(outputPath, "utf8");
            if (invocation.signal?.aborted)
                throw abortError();
            if (finalMessage.trim() === "" ||
                Buffer.byteLength(finalMessage, "utf8") !== outputInfo.size) {
                throw new CodexCliExecutionError("Codex CLI final message was empty or changed after exit");
            }
        }
        return {
            ...result,
            finalMessage,
            ...(result.exitCode === 0
                ? {
                    inspection: inspectJsonl(result.stdout, finalMessage, schemaName),
                }
                : {}),
        };
    }
    catch (error) {
        primaryError = error;
        throw error;
    }
    finally {
        try {
            await rm(directory, { force: true, recursive: true, maxRetries: 3, retryDelay: 100 });
        }
        catch (error) {
            if (primaryError === undefined)
                throw error;
        }
    }
}
export function createCodexCliTransport(options = {}) {
    return {
        kind: "codex-cli",
        async send(request, sendOptions) {
            try {
                assertIntelligenceRequestContract(request);
            }
            catch (error) {
                throw new CodexCliExecutionError("Codex CLI transport rejected a modified model or output contract" +
                    (error instanceof Error ? `: ${error.message}` : ""));
            }
            const schemaName = request.text.format.name;
            const invocation = {
                prompt: buildPrompt(request),
                developerInstructions: codexCliDeveloperInstructions(request),
                schema: request.text.format.schema,
                model: CODEX_CLI_GPT56_MODEL,
                reasoningEffort: request.reasoning.effort,
                ...(sendOptions?.signal === undefined ? {} : { signal: sendOptions.signal }),
            };
            let result;
            let inspected;
            if (options.run === undefined) {
                const executed = await defaultRun(invocation, schemaName, sendOptions?.lifecycleReporter, options.cliPath);
                result = executed;
                inspected = executed.inspection;
            }
            else {
                reportIntelligenceLifecycle(sendOptions?.lifecycleReporter, {
                    type: "request.dispatched",
                    schemaName,
                    transport: "codex-cli",
                });
                result = await options.run(invocation);
            }
            if (result.exitCode !== 0) {
                throw new CodexCliExecutionError("Codex CLI exited with code " + result.exitCode +
                    "; verify local authentication and CLI compatibility");
            }
            inspected ??= inspectJsonl(result.stdout, result.finalMessage, schemaName, sendOptions?.lifecycleReporter);
            return {
                status: 200,
                body: {
                    type: "codex-cli-result",
                    threadId: inspected.threadId,
                    status: "completed",
                    requestedModel: CODEX_CLI_GPT56_MODEL,
                    text: result.finalMessage,
                    usage: inspected.usage,
                },
            };
        },
    };
}
//# sourceMappingURL=codex-transport.js.map