# Security and trust model

Living Software treats host source, observed events, and model output as untrusted. The current automatic slice may create only its declared observation artifacts after explicit `--apply`; it does not change host business logic or layout, install a generated capability, approve a proposal, or activate behavior.

## Controls implemented now

| Component | Current authority | Current boundary |
| --- | --- | --- |
| Versioned contracts | Strictly parse known discovery, installation, observation, metric, workflow, opportunity, capability, host-interface, receipt, and Studio shapes | Unknown or malformed input is rejected; parsing does not grant authority |
| Static discovery | Read bounded TypeScript and Next.js App Router structure and derive source-linked nodes, edges, route templates, and runtime locators | Current support is Next.js App Router 15.3+ with `src/app`; the scanner does not import modules, evaluate JSX, execute scripts, load arbitrary configuration, or follow paths outside the repository |
| CLI and installer | Preview `map`, `init`, `doctor`, `analyze`, and `uninstall` operations; create or remove documented artifacts only after explicit `--apply` | `init` and `uninstall` are dry-run by default; writes are repository-relative, symlink-safe, atomic, preimage-checked, content-hashed, and journaled; existing files are not overwritten |
| Generated observer | Observe mapped route/action events, sanitized errors, performance and friction signals, and bounded viewport/CSS-pixel geometry | No text, form values, keystrokes, query strings or hashes, DOM or HTML, cookies, headers, request bodies, screenshots, or persistent user/cross-tab identifiers |
| Local collector | Accept bounded same-origin event batches and append hash-linked records to a manifest-scoped log under `.living/data/releases/` | Strict validation, ordering, duplicate, tamper, release-isolation, size, and rate checks; no read endpoint; single-process local proof only, with no production authentication, database durability, or multi-instance coordination |
| Workflow and metric analyzer | Deterministically project cases and variants, calculate technical metrics, and emit an opportunity only when configured thresholds pass | No automatic knowledge of business outcomes or causality, no model inference, and no host mutation |
| Host SDK | Validate explicitly declared events, enforce bounded queues and batches, and reject sensitive metadata keys | No arbitrary payload capture; transport is supplied by the host |
| GPT-5.6 intelligence | Draft a strict `EvolutionBrief` from a hash-verified, privacy-minimized neutral manifest/opportunity/event context | The current runner consumes neutral replay evidence, not automatic host evidence; no raw event IDs, paths, symbols, metadata, release data, or user/session/subject identifiers leave; no host-tool authority, permissions, approval, or activation is granted; schema and references are revalidated locally |
| Living Studio | Display five surfaces from a labeled neutral fixture or validated synthetic-only static snapshot | Read-only; no live host connection, observer ingestion, model call, lifecycle action, or claim that the static bridge is live |

The intelligence boundary has two explicit transports with no automatic fallback. The Responses API path uses `store: false`, fixed `gpt-5.6` selection, bounded output tokens, no requested tools, and an abort timeout; `OPENAI_API_KEY` is read only when a request is sent and must never be committed or logged. The current Codex CLI path reuses saved authentication, pins `gpt-5.6-terra` (GPT-5.6 Terra) and medium reasoning, runs from a private read-only temporary workspace, ignores user/project instructions, explicitly disables every installed host-capable feature surface, clears the model-shell environment, uses ephemeral session files, bounds streams before buffering output files, and rejects any surfaced item beyond reasoning and the final message. The read-only sandbox and isolated workspace remain the outer effect boundary; JSONL rejection is an additional acceptance gate, not a claim that Codex has no internal control surfaces. Provenance records the exact transport-requested model but does not expose an unreported CLI actual-model or API-storage claim; CLI thread ID and usage remain separate. Automated tests use both injected transports and a real fake-CLI subprocess harness. Application validation proves schema and reference integrity, not that model prose is semantically true; every brief remains a human-reviewed hypothesis. A successful live GPT-5.6 run is still pending.

## Installation and removal safety

The root-mode installer generates only:

```text
.living/config.json
.living/metric-catalog.json
.living/observation-runtime.json
.living/product-manifest.json
.living/install-record.json
.living/.gitignore
src/instrumentation-client.ts
src/living-observer.generated.ts
src/living-collector.generated.ts
src/app/api/living/events/route.ts
```

The generated observer and collector are self-contained; installation does not edit `package.json`. An existing target file causes a conflict. Repeating an identical installation is a no-op. Uninstall removes only unchanged files whose hashes match `.living/install-record.json`; it preserves modified generated files, every file below `.living/data`, and the data ignore rule for manual review. New evidence is isolated by manifest hash; a compatible legacy `.living/data/events.ndjson` remains readable but is never mixed with another release.

## Data policy

The neutral replay and current Studio use synthetic fixtures. The automatic integration proof also uses a separately built synthetic CRM simulator; its traces and scenario labels are not ingested by Living and are compared only after Living's analysis.

- Event schemas reject unknown top-level fields.
- Metadata is deny-by-default and rejects sensitive key patterns including names, messages, contact details, credentials, tokens, and free-form text.
- Normal observation captures mapped identities and bounded numbers, booleans, and enums rather than content.
- Per-tab session identifiers are ephemeral; persistent user and cross-tab identifiers are excluded.
- Queue size, batch size, request size, object depth, key count, and string length are bounded.
- Values are not copied into privacy error messages.
- Collector records form an append-only hash chain, but hashing is integrity evidence, not encryption or access control.
- Synthetic provenance stays visible in configuration, replay output, and Studio.
- Before the current neutral model call, raw event IDs become opaque aliases and host display text, source details, metadata, release data, and identity-bearing fields are omitted.
- Real inboxes, customer records, credentials, request bodies, keystrokes, cookies, DOM snapshots, screenshots, and secrets are outside the current data boundary.

## Current operational limits

- The automatic adapter is not universal Node or arbitrary-codebase support.
- The local collector is a same-origin, single-process development proof, not a production telemetry service.
- The evidence file is local and Git-ignored but is not encrypted by Living.
- Automatic host evidence is not connected to GPT-5.6 or Studio.
- Simulator output is an independent post-run oracle, not a discovery input.

## Future lifecycle, not a current claim

Declarative broker execution, proof bundles, separate contract and activation approvals, hash-linked receipts, capability activation, disable, and rollback are represented in contracts or product direction but are not implemented end to end. Before any runtime capability is added, it must enforce default-deny operations, exact versions and schemas, call budgets, confirmation requirements, deterministic proof, explicit human approval, and reversible activation.

## Reporting a vulnerability

Do not open a public issue if it would expose a secret or unsafe execution path. Contact the repository owner privately with reproduction steps, affected commit, and impact.
