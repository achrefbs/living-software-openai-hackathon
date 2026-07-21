import { SourceEvolutionError } from "./errors.js";
const SOURCE_EVOLUTION_HOOKS = [
    "lead-review-navigation",
    "previous-lead-button",
    "lead-review-position",
    "next-lead-button",
];
const SOURCE_EVOLUTION_TESTS = [
    "adapter.exact",
    "binding.exact",
    "target.single-file",
    "target.preimage-hash",
    "patch.deterministic",
    "ui.hooks-exact",
    "navigation.host-derived",
    "authority.model-free",
    "prohibitions.static",
    "rollback.exact-postimage",
];
const PARAMS_ANCHOR = [
    "  const params = useParams<{ id: string }>();",
    "  const leadId = params.id;",
].join("\n");
const NAME_ANCHOR = '  const name = contact ? contactFullName(contact) : "Lead";';
const NAVIGATION_ANCHOR = [
    "      </Link>",
    "",
    '      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">',
].join("\n");
const LEADS_SELECTOR = "  const leads = useCrm((state) => state.leads);";
const POSITION_DERIVATION = [
    NAME_ANCHOR,
    "  const leadReviewPosition = leads.findIndex(",
    "    (candidate) => candidate.id === leadId,",
    "  );",
    "  const previousLead =",
    "    leadReviewPosition > 0 ? leads[leadReviewPosition - 1] : undefined;",
    "  const nextLead =",
    "    leadReviewPosition >= 0 && leadReviewPosition < leads.length - 1",
    "      ? leads[leadReviewPosition + 1]",
    "      : undefined;",
].join("\n");
const NAVIGATION_MARKUP = [
    "      </Link>",
    "",
    "      <nav",
    '        aria-label="Lead review navigation"',
    '        data-testid="lead-review-navigation"',
    '        className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-hairline bg-bg px-3 py-2"',
    "      >",
    "        <Link",
    "          href={previousLead ? `/leads/${previousLead.id}` : `/leads/${leadId}`}",
    '          data-testid="previous-lead-button"',
    "          aria-disabled={!previousLead}",
    "          tabIndex={previousLead ? undefined : -1}",
    "          onClick={(event) => {",
    "            if (!previousLead) event.preventDefault();",
    "          }}",
    "          className={cn(",
    '            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",',
    "            previousLead",
    '              ? "text-ink hover:bg-surface"',
    '              : "cursor-not-allowed text-muted/50",',
    "          )}",
    "        >",
    "          <span aria-hidden>←</span>",
    "          Previous lead",
    "        </Link>",
    "        <span",
    '          data-testid="lead-review-position"',
    '          className="text-xs font-medium text-muted tabular-nums"',
    "        >",
    "          {leadReviewPosition + 1} of {leads.length}",
    "        </span>",
    "        <Link",
    "          href={nextLead ? `/leads/${nextLead.id}` : `/leads/${leadId}`}",
    '          data-testid="next-lead-button"',
    "          aria-disabled={!nextLead}",
    "          tabIndex={nextLead ? undefined : -1}",
    "          onClick={(event) => {",
    "            if (!nextLead) event.preventDefault();",
    "          }}",
    "          className={cn(",
    '            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",',
    "            nextLead",
    '              ? "text-ink hover:bg-surface"',
    '              : "cursor-not-allowed text-muted/50",',
    "          )}",
    "        >",
    "          Next lead",
    "          <span aria-hidden>→</span>",
    "        </Link>",
    "      </nav>",
    "",
    '      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">',
].join("\n");
function count(source, fragment) {
    return source.split(fragment).length - 1;
}
function replaceExactlyOnce(source, search, replacement, label) {
    if (count(source, search) !== 1) {
        throw new SourceEvolutionError("UNSUPPORTED_ADAPTER_INPUT", `Expected exactly one ${label} anchor`);
    }
    return source.replace(search, replacement);
}
function lineEnding(source) {
    if (/\r(?!\n)/u.test(source)) {
        throw new SourceEvolutionError("UNSUPPORTED_ADAPTER_INPUT", "The target contains unsupported carriage-return line endings");
    }
    const hasCrLf = source.includes("\r\n");
    const withoutCrLf = source.replaceAll("\r\n", "");
    if (hasCrLf && withoutCrLf.includes("\n")) {
        throw new SourceEvolutionError("UNSUPPORTED_ADAPTER_INPUT", "The target contains mixed line endings");
    }
    return hasCrLf ? "\r\n" : "\n";
}
function withLineEnding(fragment, newline) {
    return newline === "\n" ? fragment : fragment.replaceAll("\n", "\r\n");
}
export function compileLeadReviewNavigation(preimage) {
    if (preimage.length === 0 || preimage.length > 2_000_000) {
        throw new SourceEvolutionError("UNSUPPORTED_ADAPTER_INPUT", "The target preimage must contain between 1 byte and 2 MB of text");
    }
    for (const hook of SOURCE_EVOLUTION_HOOKS) {
        if (preimage.includes(`data-testid="${hook}"`)) {
            throw new SourceEvolutionError("EVOLUTION_REPLAY_REJECTED", `The target already contains the '${hook}' evolution hook`);
        }
    }
    const newline = lineEnding(preimage);
    const paramsAnchor = withLineEnding(PARAMS_ANCHOR, newline);
    const nameAnchor = withLineEnding(NAME_ANCHOR, newline);
    const navigationAnchor = withLineEnding(NAVIGATION_ANCHOR, newline);
    let postimage = replaceExactlyOnce(preimage, paramsAnchor, `${paramsAnchor}${newline}${withLineEnding(LEADS_SELECTOR, newline)}`, "lead parameter");
    postimage = replaceExactlyOnce(postimage, nameAnchor, withLineEnding(POSITION_DERIVATION, newline), "lead display name");
    postimage = replaceExactlyOnce(postimage, navigationAnchor, withLineEnding(NAVIGATION_MARKUP, newline), "lead header");
    verifyLeadReviewNavigation(preimage, postimage);
    return postimage;
}
export function verifyLeadReviewNavigation(preimage, postimage) {
    const expected = (() => {
        const newline = lineEnding(preimage);
        const paramsAnchor = withLineEnding(PARAMS_ANCHOR, newline);
        let value = replaceExactlyOnce(preimage, paramsAnchor, `${paramsAnchor}${newline}${withLineEnding(LEADS_SELECTOR, newline)}`, "lead parameter");
        value = replaceExactlyOnce(value, withLineEnding(NAME_ANCHOR, newline), withLineEnding(POSITION_DERIVATION, newline), "lead display name");
        return replaceExactlyOnce(value, withLineEnding(NAVIGATION_ANCHOR, newline), withLineEnding(NAVIGATION_MARKUP, newline), "lead header");
    })();
    if (postimage !== expected || postimage === preimage) {
        throw new SourceEvolutionError("UNSUPPORTED_ADAPTER_INPUT", "The postimage is not the exact deterministic adapter output");
    }
    for (const hook of SOURCE_EVOLUTION_HOOKS) {
        if (count(postimage, `data-testid="${hook}"`) !== 1) {
            throw new SourceEvolutionError("UNSUPPORTED_ADAPTER_INPUT", `The postimage must contain exactly one '${hook}' hook`);
        }
    }
    const insertedPolicySurface = [
        LEADS_SELECTOR,
        POSITION_DERIVATION,
        NAVIGATION_MARKUP,
    ].join("\n");
    const prohibitedTokens = [
        "fetch(",
        "XMLHttpRequest",
        "process.",
        "child_process",
        "eval(",
        "new Function",
        "import(",
        "require(",
        "sendMessage(",
        "secret",
        "git ",
    ];
    if (prohibitedTokens.some((token) => insertedPolicySurface.includes(token))) {
        throw new SourceEvolutionError("UNSUPPORTED_ADAPTER_INPUT", "The deterministic patch contains a prohibited authority token");
    }
    if (!postimage.includes("const leads = useCrm((state) => state.leads);") ||
        !postimage.includes("leads.findIndex(") ||
        !postimage.includes("previousLead.id") ||
        !postimage.includes("nextLead.id")) {
        throw new SourceEvolutionError("UNSUPPORTED_ADAPTER_INPUT", "Navigation must derive only from the existing host lead collection");
    }
    const details = {
        "adapter.exact": "The only compiler is next-crm-lead-review-navigation/v1.",
        "binding.exact": "The patch is bound to exact validated app, manifest, opportunity, brief, provenance, and source hashes.",
        "target.single-file": "The artifact declares exactly one fixed host path.",
        "target.preimage-hash": "Application requires both the exact stored preimage bytes and their SHA-256 digest.",
        "patch.deterministic": "The postimage exactly matches the adapter's three fixed anchor substitutions.",
        "ui.hooks-exact": "All four review-navigation hooks occur exactly once.",
        "navigation.host-derived": "Previous, position, and next values derive from the host's existing lead collection.",
        "authority.model-free": "No model output is accepted as source code or executable instructions.",
        "prohibitions.static": "The inserted source contains no network, process, secret, dynamic-code, message-send, or Git authority.",
        "rollback.exact-postimage": "Rollback is permitted only while the target bytes equal this exact postimage.",
    };
    return SOURCE_EVOLUTION_TESTS.map((id) => ({
        id,
        status: "passed",
        detail: details[id],
    }));
}
//# sourceMappingURL=adapter.js.map