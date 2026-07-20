# `@living-software/intelligence`

This package gives GPT-5.6 one narrow, material role in Living Software: interpret a validated opportunity, its hash-verified workflow evidence, and a bounded product-map context, then draft an `EvolutionBrief` hypothesis for human review.

It does **not** approve or activate changes, mutate a host application, or expose host tools to the model. Every response is constrained by a strict Structured Outputs schema and then validated again in the application. Those checks establish schema and reference integrity—not semantic truth. The draft remains a hypothesis that requires human review.

## Runtime

```ts
import {
  createCodexCliTransport,
  createIntelligenceClient,
} from "@living-software/intelligence";

const intelligence = createIntelligenceClient(createCodexCliTransport(), {
  timeoutMs: 120_000,
});
const result = await intelligence.draftEvolutionBrief({
  opportunity,
  manifest,
  evidenceEvents,
});
```

The library default remains the Responses API transport. The Build Week demo explicitly selects `createCodexCliTransport()` so it can reuse saved Codex authentication; `--provider api` selects the API path later. There is no automatic fallback. Set `OPENAI_API_KEY` only in the runtime environment for the API transport. Tests use injected offline transports and make no network calls.

Before any network call, the client recomputes the canonical manifest and event-set hashes, validates sample IDs, projected-case/session counts and app/manifest links, and verifies observed/synthetic origin. Outbound context contains only bounded identifiers, enums, counts, and normalized events. Raw event IDs are replaced with deterministic opaque aliases; source paths, symbols, release revisions, event metadata, session/actor/subject IDs, and host display text are excluded. Validated aliases are mapped back to event IDs only in the local result and its provenance.

Both paths stay in the GPT-5.6 family, use medium reasoning, a strict JSON schema, and a configurable abort timeout. The API requests `gpt-5.6` with `store: false`, no requested tools, and bounded output tokens. The authenticated CLI requests `gpt-5.6-terra` (GPT-5.6 Terra), runs from a private read-only temporary workspace, ignores user/project instructions, explicitly disables every installed host-capable feature surface, clears the model-shell environment, uses ephemeral session files, bounds streams before reading a regular output file, and rejects any surfaced item beyond reasoning and the final message. Results preserve the logical boundary model and exact transport-requested model, keep API response IDs and CLI thread IDs separate, and never claim an actual model or API storage value that the CLI did not report. Synthetic drafts carry a deterministic `synthetic-only` evidence scope and can never claim production generalization.
