# `@living-software/intelligence`

This package gives GPT-5.6 two material but bounded roles:

1. interpret a validated workflow opportunity as a strict `EvolutionBrief`;
2. author a strict one-file source-patch proposal from a small manifest-bound UI source projection.

GPT is creative inside that proposal. It does **not** receive approval, application, rollback, terminal, filesystem, browser or network-tool authority. Both outputs remain untrusted drafts and are revalidated by Living.

## Runtime

```ts
import {
  createCodexCliTransport,
  createIntelligenceClient,
} from "@living-software/intelligence";

const intelligence = createIntelligenceClient(createCodexCliTransport(), {
  timeoutMs: 120_000,
  maxPatchOutputTokens: 8_000,
});

const brief = await intelligence.draftEvolutionBrief({
  opportunity,
  manifest,
  evidenceEvents,
});

const patch = await intelligence.draftSourcePatch({
  brief: brief.draft,
  candidates,
});
```

The caller must construct `candidates` from affected manifest-node provenance. Living's CLI and Studio orchestrators limit this projection to at most three eligible existing UI files, 64 KB per file and 96 KB total. The patch schema requires exactly one supplied path and preimage hash plus one to eight exact anchor/replacement edits.

The package validates request contracts, strict Structured Outputs, provider provenance and result references. The evolution engine separately validates target eligibility, exact hashes and anchors, static authority patterns and diff bounds before creating a prepared artifact. Schema and static checks do not prove semantic correctness.

## Providers

The Build Week terminal flow requires an explicit provider:

```bash
living improve --root <next-app> --provider codex
living improve --root <next-app> --provider api
```

- `codex` uses saved Codex authentication and requests `gpt-5.6-terra`.
- `api` requires `OPENAI_API_KEY`, requests `gpt-5.6`, and sets `store: false`.
- There is no automatic fallback.

Both use medium reasoning, strict JSON schemas, bounded output and a configurable timeout. The product requests no tools. The Codex transport runs in a private read-only temporary workspace, ignores user/project instructions, disables installed host-capable feature surfaces, clears the model-shell environment, uses ephemeral files, and rejects surfaced items beyond reasoning and the final message.

## Evidence and source minimization

Before the brief call, Living recomputes manifest/event-set hashes and validates app, opportunity, event, origin, time-window and case/session links. Raw event IDs become opaque aliases; host display text, paths, unrelated source, metadata, release data and user/session/subject identities are excluded.

The patch call receives the validated brief and only the bounded candidate source text needed to author the proposal. Source contents and all embedded comments/strings are explicitly treated as untrusted data, not instructions. Operators must have authority to disclose candidate code to the selected OpenAI transport.

The returned provenance preserves requested model, transport, run ID and provider-specific storage/session facts without inventing fields the transport did not report.
