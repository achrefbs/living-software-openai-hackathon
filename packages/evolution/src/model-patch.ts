import {
  identifierSchema,
  sha256Schema,
  type Sha256,
} from "@living-software/contracts";
import ts from "typescript";
import { z } from "zod";

import { hashBytes } from "./canonical.js";
import { SourceEvolutionError } from "./errors.js";

const MAX_SOURCE_BYTES = 2_000_000;
const MAX_ANCHOR_BYTES = 8_192;
const MAX_REPLACEMENT_BYTES = 16_384;
const MAX_DIFF_BYTES = 128 * 1024;
const MAX_DIFF_LINES = 2_000;
const UNSAFE_CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const UNSAFE_FORMAT_CHARACTER = /\p{Cf}/u;
const UNSAFE_UNICODE_PADDING = /[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u;
const EXCESSIVE_HORIZONTAL_PADDING = /[ \t]{1025,}/u;
const EXCESSIVE_VERTICAL_PADDING = /(?:\r?\n){129,}/u;

const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);

const DISALLOWED_REPLACEMENT_PATTERNS = [
  { label: "server directive", pattern: /["']use server["']/iu },
  { label: "server-only module", pattern: /\bserver-only\b/iu },
  { label: "server request API", pattern: /\b(?:NextRequest|NextResponse)\b/u },
  { label: "server header API", pattern: /\b(?:cookies|headers)\s*\(/u },
  {
    label: "network API",
    pattern:
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|BroadcastChannel|SharedWorker|Worker)\b/u,
  },
  { label: "process authority", pattern: /\bprocess\b/u },
  {
    label: "host module authority",
    pattern:
      /\b(?:child_process|fs|http|https|net|tls|worker_threads)\b/u,
  },
  { label: "dynamic import", pattern: /\bimport\s*\(/u },
  { label: "CommonJS execution", pattern: /\brequire\s*\(/u },
  { label: "dynamic evaluation", pattern: /\b(?:eval|Function)\b/u },
  { label: "dynamic evaluation", pattern: /\bnew\s+Function\b/u },
  {
    label: "browser secret store",
    pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b/u,
  },
  {
    label: "raw HTML execution",
    pattern: /\b(?:dangerouslySetInnerHTML|insertAdjacentHTML)\b/u,
  },
  { label: "script URL", pattern: /(?:<script\b|javascript\s*:)/iu },
  { label: "CSS import", pattern: /@import\b/iu },
  {
    label: "string callback execution",
    pattern: /\bset(?:Timeout|Interval)\s*\(\s*["'\x60]/u,
  },
  {
    label: "secret-bearing token",
    pattern:
      /\b(?:secret|password|cookie|credentials?|authorization|bearer|api[_-]?key|apiKey|OPENAI_API_KEY)\b/iu,
  },
] as const;

const DISALLOWED_CANONICAL_PATTERNS = [
  { label: "navigator authority", pattern: /\bnavigator\b/u },
  {
    label: "document authority",
    pattern: /\bdocument\b/u,
  },
  {
    label: "window network or navigation authority",
    pattern:
      /\bwindow(?:\.|\[)(?:fetch|xmlhttprequest|websocket|eventsource|sendbeacon|location|open|postmessage|eval|function|localstorage|sessionstorage|indexeddb)/u,
  },
  {
    label: "computed window authority",
    pattern: /\bwindow\s*\[/u,
  },
  { label: "global object authority", pattern: /\bglobalthis\b/u },
  {
    label: "worker-global authority",
    pattern: /\bself\b/u,
  },
  {
    label: "network, secret, or worker capability token",
    pattern:
      /\b(?:fetch|xmlhttprequest|websocket|eventsource|sendbeacon|localstorage|sessionstorage|indexeddb|broadcastchannel|sharedworker|worker|cookie)\b/u,
  },
  {
    label: "global navigation authority",
    pattern: /\blocation(?:\.|\[)(?:assign|replace|reload|href)/u,
  },
  {
    label: "dynamic constructor execution",
    pattern: /(?:\.constructor|\[constructor\])\s*\(/u,
  },
  {
    label: "programmatic external loader",
    pattern:
      /\breact\.createelement\((?:script|iframe|object|embed|form|link)\b/u,
  },
  {
    label: "form submission authority",
    pattern:
      /(?:<form\b|\bformaction\s*=|\bform(?:\.|\[)(?:submit|requestsubmit)|\.setattribute\(action)/u,
  },
  {
    label: "dynamic loader attribute assignment",
    pattern: /\.(?:src|srcdoc|href|action)\s*=/u,
  },
  {
    label: "dynamic loader setAttribute",
    pattern: /\.setattribute\((?:src|srcdoc|href|action)/u,
  },
  { label: "external URL", pattern: /\b(?:https?|wss?):\/\//u },
  { label: "image beacon authority", pattern: /\bnew\s+image\s*\(/u },
] as const;

const sourcePatchEditSchema = z
  .object({
    anchor: z.string().min(1).max(MAX_ANCHOR_BYTES),
    replacement: z.string().max(MAX_REPLACEMENT_BYTES),
  })
  .strict();

export const sourcePatchProposalSchema = z
  .object({
    schemaVersion: z.literal("living.source-patch-proposal/v1"),
    proposalId: identifierSchema,
    appId: z.string().min(1).max(160),
    opportunityId: z.string().min(1).max(160),
    manifestHash: sha256Schema,
    briefId: z.string().min(1).max(160),
    summary: z.string().min(1).max(1_000),
    rationale: z.string().min(1).max(2_000),
    target: z
      .object({
        path: z.string().min(1).max(512),
        preimageHash: sha256Schema,
      })
      .strict(),
    edits: z.array(sourcePatchEditSchema).min(1).max(8),
    governance: z
      .object({
        status: z.literal("draft"),
        humanApprovalRequired: z.literal(true),
        applicationAllowed: z.literal(false),
      })
      .strict(),
  })
  .strict()
  .superRefine((proposal, context) => {
    const anchors = proposal.edits.map((edit) => edit.anchor);
    if (new Set(anchors).size !== anchors.length) {
      context.addIssue({
        code: "custom",
        path: ["edits"],
        message: "Patch edit anchors must be unique",
      });
    }
  });

export type SourcePatchProposal = z.infer<typeof sourcePatchProposalSchema>;

export const MODEL_PATCH_PROOF_CHECK_IDS = [
  "proposal.schema",
  "governance.preview-only",
  "target.allowed",
  "target.preimage-hash",
  "edits.bounded",
  "anchors.exact-nonoverlap",
  "replacements.declared-authority-denylist",
  "postimage.changed",
  "diff.bounded",
] as const;

export type ModelPatchProofCheck = Readonly<{
  id: (typeof MODEL_PATCH_PROOF_CHECK_IDS)[number];
  status: "passed";
  detail: string;
}>;

export type CompiledModelPatch = Readonly<{
  proposal: SourcePatchProposal;
  preimageHash: Sha256;
  postimage: string;
  postimageHash: Sha256;
  diff: Readonly<{
    editCount: number;
    removedBytes: number;
    addedBytes: number;
    changedLines: number;
  }>;
  checks: readonly ModelPatchProofCheck[];
}>;

type LocatedEdit = Readonly<{
  anchor: string;
  replacement: string;
  start: number;
  end: number;
}>;

function invalidInput(message: string, cause?: unknown): never {
  throw new SourceEvolutionError(
    "INVALID_INPUT",
    message,
    cause === undefined ? undefined : { cause },
  );
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function lineCount(value: string): number {
  if (value.length === 0) return 0;
  return value.split(/\r\n|\r|\n/u).length;
}

function extension(path: string): string {
  const fileName = path.split("/").at(-1) ?? "";
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot).toLowerCase();
}

function assertAllowedTarget(candidate: string): void {
  if (candidate.includes("\\") || candidate !== candidate.replaceAll("\\", "/")) {
    throw new SourceEvolutionError(
      "UNSAFE_TARGET",
      "Model patch targets must use normalized repository-relative forward slashes",
    );
  }
  const segments = candidate.split("/");
  if (
    segments.length < 3 ||
    segments[0] !== "src" ||
    (segments[1] !== "app" && segments[1] !== "components") ||
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        segment.startsWith("."),
    )
  ) {
    throw new SourceEvolutionError(
      "UNSAFE_TARGET",
      "Model patches are limited to regular source files below src/app or src/components",
    );
  }

  const fileName = segments.at(-1)!.toLowerCase();
  const targetExtension = extension(candidate);
  if (!ALLOWED_EXTENSIONS.has(targetExtension)) {
    throw new SourceEvolutionError(
      "UNSAFE_TARGET",
      "Model patch targets must be .ts, .tsx, .js, .jsx, or .css files",
    );
  }
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  if (
    /^route\.(?:ts|tsx|js|jsx)$/u.test(fileName) ||
    lowerSegments.some((segment) =>
      ["api", "test", "tests", "__tests__", "e2e", "config", "configs"].includes(segment),
    ) ||
    /(?:^|\.)(?:test|spec|config)\.(?:ts|tsx|js|jsx|css)$/u.test(fileName)
  ) {
    throw new SourceEvolutionError(
      "UNSAFE_TARGET",
      "Model patches cannot target route handlers, API surfaces, tests, or configuration files",
    );
  }
}

function decodeEscapesForPolicy(value: string): string {
  const decode = (digits: string): string => {
    const codePoint = Number.parseInt(digits, 16);
    if (
      !Number.isSafeInteger(codePoint) ||
      codePoint < 0 ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return "";
    }
    return String.fromCodePoint(codePoint);
  };
  return value
    .replace(/\\u\{([0-9a-f]{1,6})\}/giu, (_match, digits: string) =>
      decode(digits))
    .replace(/\\u([0-9a-f]{4})/giu, (_match, digits: string) =>
      decode(digits))
    .replace(/\\x([0-9a-f]{2})/giu, (_match, digits: string) =>
      decode(digits));
}

function canonicalPolicyText(value: string): string {
  return decodeEscapesForPolicy(value)
    .toLowerCase()
    .replace(/(["'\x60])\s*\+\s*(["'\x60])/gu, "")
    .replace(/["'\x60\\]/gu, "")
    .replace(/\s+/gu, " ");
}

function assertReplacementSafe(replacement: string): void {
  const decoded = decodeEscapesForPolicy(replacement);
  for (const disallowed of DISALLOWED_REPLACEMENT_PATTERNS) {
    if (disallowed.pattern.test(decoded)) {
      throw new SourceEvolutionError(
        "UNSUPPORTED_ADAPTER_INPUT",
        `Model patch replacement contains disallowed ${disallowed.label}`,
      );
    }
  }
  const canonical = canonicalPolicyText(replacement);
  for (const disallowed of DISALLOWED_CANONICAL_PATTERNS) {
    if (disallowed.pattern.test(canonical)) {
      throw new SourceEvolutionError(
        "UNSUPPORTED_ADAPTER_INPUT",
        "Model patch replacement contains disallowed " + disallowed.label,
      );
    }
  }
  if (
    /<(?:img|video|audio|source|track|iframe|script|link|object|embed)\b[^>]*\b(?:src|srcDoc|href|data)\s*=\s*\{/iu.test(decoded) ||
    /<iframe\b[^>]*\bsrc\s*=\s*["']\s*(?:https?:|\/\/)/iu.test(decoded)
  ) {
    throw new SourceEvolutionError(
      "UNSUPPORTED_ADAPTER_INPUT",
      "Model patch replacement contains a dynamic or external iframe source",
    );
  }
}

function assertSourceCharactersSafe(value: string): void {
  const unsafeControl = UNSAFE_CONTROL_CHARACTER.exec(value)?.[0];
  const withoutInitialBom = value.startsWith("\uFEFF") ? value.slice(1) : value;
  const unsafeFormat = UNSAFE_FORMAT_CHARACTER.exec(withoutInitialBom)?.[0];
  const unsafePadding = UNSAFE_UNICODE_PADDING.exec(value)?.[0];
  const unsafeCharacter = unsafeControl ?? unsafeFormat ?? unsafePadding;
  if (unsafeCharacter !== undefined) {
    const codePoint = unsafeCharacter.codePointAt(0)!;
    throw new SourceEvolutionError(
      "UNSUPPORTED_ADAPTER_INPUT",
      `Model patch postimage contains unsafe control, format, or Unicode padding character U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
    );
  }
  if (
    EXCESSIVE_HORIZONTAL_PADDING.test(value) ||
    EXCESSIVE_VERTICAL_PADDING.test(value)
  ) {
    throw new SourceEvolutionError(
      "UNSUPPORTED_ADAPTER_INPUT",
      "Model patch postimage contains excessive whitespace padding",
    );
  }
}

function assertScriptPostimageParses(targetPath: string, postimage: string): void {
  if (extension(targetPath) === ".css") return;
  const result = ts.transpileModule(postimage, {
    fileName: targetPath,
    reportDiagnostics: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      isolatedModules: true,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const diagnostic = result.diagnostics?.find(
    (candidate) => candidate.category === ts.DiagnosticCategory.Error,
  );
  if (diagnostic !== undefined) {
    throw new SourceEvolutionError(
      "UNSUPPORTED_ADAPTER_INPUT",
      `Model patch postimage is not syntactically valid (${diagnostic.code}): ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
    );
  }
}

function assertExecutablePostimage(targetPath: string, postimage: string): void {
  assertSourceCharactersSafe(postimage);
  assertScriptPostimageParses(targetPath, postimage);
}

function locateEdits(
  preimage: string,
  edits: SourcePatchProposal["edits"],
): LocatedEdit[] {
  if (new Set(edits.map((edit) => edit.anchor)).size !== edits.length) {
    invalidInput("Every model patch anchor must be unique");
  }
  const located = edits.map((edit) => {
    if (byteLength(edit.anchor) > MAX_ANCHOR_BYTES) {
      invalidInput("A model patch anchor exceeds the byte limit");
    }
    if (byteLength(edit.replacement) > MAX_REPLACEMENT_BYTES) {
      invalidInput("A model patch replacement exceeds the byte limit");
    }
    if (edit.anchor === edit.replacement) {
      invalidInput("Every model patch edit must change its anchor");
    }
    assertReplacementSafe(edit.replacement);
    const start = preimage.indexOf(edit.anchor);
    if (start < 0 || start !== preimage.lastIndexOf(edit.anchor)) {
      throw new SourceEvolutionError(
        "UNSUPPORTED_ADAPTER_INPUT",
        "Every model patch anchor must occur exactly once in the target preimage",
      );
    }
    return {
      ...edit,
      start,
      end: start + edit.anchor.length,
    };
  });

  const ordered = [...located].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (current.start < previous.end) {
      invalidInput("Model patch anchors must not overlap");
    }
  }
  return ordered;
}

function applyLocatedEdits(preimage: string, edits: readonly LocatedEdit[]): string {
  let postimage = preimage;
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    postimage =
      postimage.slice(0, edit.start) +
      edit.replacement +
      postimage.slice(edit.end);
  }
  return postimage;
}

function compileModelPatchInternal(
  proposalInput: unknown,
  preimage: string,
  validateExecutableSource: boolean,
): CompiledModelPatch {
  const parsed = sourcePatchProposalSchema.safeParse(proposalInput);
  if (!parsed.success) {
    invalidInput("Model source patch failed strict schema validation", parsed.error);
  }
  const proposal = parsed.data;
  assertAllowedTarget(proposal.target.path);

  const preimageBytes = byteLength(preimage);
  if (preimageBytes < 1 || preimageBytes > MAX_SOURCE_BYTES) {
    invalidInput("The model patch preimage must contain between 1 byte and 2 MB");
  }
  const preimageHash = hashBytes(preimage);
  if (preimageHash !== proposal.target.preimageHash) {
    throw new SourceEvolutionError(
      "TARGET_PREIMAGE_MISMATCH",
      "Model patch target preimage hash does not match the exact supplied bytes",
    );
  }

  const edits = locateEdits(preimage, proposal.edits);
  const removedBytes = edits.reduce(
    (total, edit) => total + byteLength(edit.anchor),
    0,
  );
  const addedBytes = edits.reduce(
    (total, edit) => total + byteLength(edit.replacement),
    0,
  );
  const changedLines = edits.reduce(
    (total, edit) =>
      total + lineCount(edit.anchor) + lineCount(edit.replacement),
    0,
  );
  if (
    removedBytes + addedBytes > MAX_DIFF_BYTES ||
    changedLines > MAX_DIFF_LINES
  ) {
    throw new SourceEvolutionError(
      "UNSUPPORTED_ADAPTER_INPUT",
      "Model patch exceeds the bounded diff budget",
    );
  }

  const postimage = applyLocatedEdits(preimage, edits);
  const postimageBytes = byteLength(postimage);
  if (
    postimage === preimage ||
    postimageBytes < 1 ||
    postimageBytes > MAX_SOURCE_BYTES
  ) {
    throw new SourceEvolutionError(
      "UNSUPPORTED_ADAPTER_INPUT",
      "Model patch must produce one nonempty changed source file within the size limit",
    );
  }

  if (validateExecutableSource) {
    assertExecutablePostimage(proposal.target.path, postimage);
  }

  const checks: readonly ModelPatchProofCheck[] = Object.freeze([
    {
      id: "proposal.schema",
      status: "passed",
      detail: "The model patch passed its strict versioned schema.",
    },
    {
      id: "governance.preview-only",
      status: "passed",
      detail: "The proposal remains a draft that requires human approval and grants no application authority.",
    },
    {
      id: "target.allowed",
      status: "passed",
      detail: `The target is one allowed client source path: ${proposal.target.path}.`,
    },
    {
      id: "target.preimage-hash",
      status: "passed",
      detail: "The supplied source bytes match the proposal's exact SHA-256 preimage.",
    },
    {
      id: "edits.bounded",
      status: "passed",
      detail: `${edits.length} edit${edits.length === 1 ? "" : "s"} passed count and per-edit bounds.`,
    },
    {
      id: "anchors.exact-nonoverlap",
      status: "passed",
      detail: "Every unique anchor occurs exactly once and no anchor ranges overlap.",
    },
    {
      id: "replacements.declared-authority-denylist",
      status: "passed",
      detail: "Inserted replacements passed the declared server, browser-authority, network, process, secret, and dynamic-code denylist. This is a bounded static check, not semantic proof.",
    },
    {
      id: "postimage.changed",
      status: "passed",
      detail: validateExecutableSource
        ? "The deterministic substitutions produce one nonempty changed postimage that passes control-character, padding, and compiler syntax validation."
        : "The deterministic substitutions reproduce the stored nonempty changed postimage for legacy integrity inspection.",
    },
    {
      id: "diff.bounded",
      status: "passed",
      detail: `The diff changes ${removedBytes + addedBytes} bytes across ${changedLines} bounded lines.`,
    },
  ]);

  return Object.freeze({
    proposal,
    preimageHash,
    postimage,
    postimageHash: hashBytes(postimage),
    diff: Object.freeze({
      editCount: edits.length,
      removedBytes,
      addedBytes,
      changedLines,
    }),
    checks,
  });
}

export function compileModelPatch(
  proposalInput: unknown,
  preimage: string,
): CompiledModelPatch {
  return compileModelPatchInternal(proposalInput, preimage, true);
}

export function compileStoredModelPatchForIntegrity(
  proposalInput: unknown,
  preimage: string,
): CompiledModelPatch {
  return compileModelPatchInternal(proposalInput, preimage, false);
}
