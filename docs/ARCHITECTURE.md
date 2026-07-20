# Architecture

## Current Build Week slice

Living Software is an installable developer tool, not the reference CRM. The current automatic adapter supports TypeScript Next.js App Router 15.3+ repositories that use `src/app`; arbitrary Node applications and other frameworks are not current claims. The CRM and its simulator remain separate repositories and must work without Living Software.

```text
supported Next.js source
  -> bounded, non-executing discovery
  -> Product Manifest + observation runtime map + metric catalog

explicit --apply
  -> create-only generated browser observer + same-origin collector
  -> hash-guarded install journal

public UI activity
  -> privacy-safe, hash-linked local evidence
  -> deterministic workflow projection + technical metrics
  -> optional threshold-based Opportunity

verified neutral evidence bundle + Opportunity
  -> privacy-minimized GPT-5.6 request
  -> schema/reference-validated EvolutionBrief draft
  -> human review required

labeled neutral fixture OR validated synthetic capture
  -> privacy-minimized static snapshot
  -> read-only Living Studio
```

The automatic path can export verified synthetic analysis to Studio through an explicit static sync. Studio validates that minimized snapshot before rendering it and otherwise falls back to the labeled neutral fixture. It does not ingest the host live or call the model runner. The current GPT-5.6 runner separately consumes neutral replay evidence.

## Implemented boundaries

| Component | What is implemented | What is not implemented |
| --- | --- | --- |
| Public contracts | Strict, versioned schemas for discovery, installation, observation, metrics, workflow evidence, opportunities, capability contracts, broker descriptions, receipts, and Studio messages | A schema does not itself provide production storage, approval, execution, or rollback |
| Discovery | Bounded static analysis of a TypeScript Next.js App Router 15.3+ repository using `src/app`, with source-linked nodes, edges, normalized routes and runtime locators | Arbitrary Node, other frameworks, execution of host code, or automatic knowledge of business success |
| CLI and automatic planner | `map --root`; dry-run-first `init --root [--synthetic] [--apply]`; `doctor --root [--synthetic]`; `analyze --root`; read-only `snapshot --root`; and dry-run-first `uninstall --root [--apply]` | Package-manager publication, universal installation, or a production deployment service |
| Installer | Create-only, symlink-safe, atomic writes; preimage and content hashes; idempotency; install journal; exact-hash uninstall that preserves changed files and captured evidence | Editing existing integration files, editing `package.json`, deleting changed files, or deleting evidence by default |
| Browser observer | Route and mapped action events, sanitized errors, performance and friction signals, viewport facts, visibility, scroll burden, and bounded CSS-pixel geometry | Text, values, keystrokes, query strings or hashes, DOM or HTML, cookies, headers, request bodies, screenshots, or persistent user/cross-tab identifiers |
| Local collector | Same-origin bounded POST batches and append-only hash-linked, manifest-scoped logs below `.living/data/releases/` for single-process local proof | Authentication, evidence-reading API, database durability, multi-instance coordination, or production telemetry operations |
| Analyzer | Deterministic workflow cases and variants, technical metrics, and optional threshold-based friction opportunity | Business-outcome truth, causal claims, or automatic layout mutation |
| Host SDK | Event validation, sensitive-key rejection, bounded queues and batches, host-supplied transport, retry restoration, and close/flush behavior | Automatic instrumentation or a production collector service |
| Intelligence | Explicit Codex CLI and Responses API transports fixed to GPT-5.6, exact neutral evidence/hash checks, privacy-minimized context, opaque evidence aliases, strict structured output, provider-specific isolation/bounds, truthful provenance, and local reference validation | Automatic-host evidence ingestion, semantic truth guarantees, approval, code generation, host tools, or activation; a successful live proof run is still pending |
| Neutral replay | A synthetic descriptor and event stream that exercise the fixture CLI, projection, detector, and evidence hashing offline | Production telemetry or a claim that synthetic behavior represents real users |
| Living Studio | Five read-only routes; empty, disconnected, and invalid-data previews; neutral fixture fallback; and validated ingestion of an explicitly synced synthetic-only static snapshot | Live ingestion, model calls, command handling, proof, activation, disable, or rollback |

## Authority model

- Host source, observed events, and model output are untrusted inputs.
- Discovery never imports application modules, evaluates JSX, executes scripts, or follows paths outside the repository.
- Installation can create only the previewed generated files after explicit `--apply`; existing files cause a conflict instead of being overwritten.
- Deterministic code owns parsing, canonical hashes, projections, detector thresholds, evidence linkage, install integrity, and model-response reference checks.
- GPT-5.6 may interpret a bounded neutral evidence bundle and draft a hypothesis only.
- A draft remains `status: draft`, requires human review, and has `activationAllowed: false`.
- Uninstall removes only unchanged generated files recorded in the hash journal and preserves modified files and evidence.
- No current code path changes host business logic or layout, approves a proposal, or activates a capability.

Application-side validation establishes schema and reference integrity, not semantic or causal truth. Human review remains necessary even when every deterministic check passes.

## Reproducible paths

### Supported automatic host path

1. Run `map --root` to scan a supported repository without executing or changing it.
2. Run `init --root` to preview the exact create-only file set.
3. Add `--synthetic --apply` for an explicitly synthetic test installation.
4. Run `doctor --root --synthetic`, start the host normally, and drive its public UI.
5. Read the current manifest's `.living/data/releases/<manifest-hash>/events.ndjson` through `analyze --root` to project workflows and technical metrics. A compatible legacy log can be read when no current segment exists; evidence from different manifests is never combined.
6. Optionally run `snapshot --root` directly, or `npm run studio:sync -- --root <next-app>`, to produce a validated, privacy-minimized static Studio snapshot. Only explicitly synthetic evidence is accepted by the sync script.
7. Preview and then apply `uninstall --root`; verify changed generated files and evidence are preserved.

The independent CRM proof completed supported installation, runtime capture, privacy checks, and byte-preserving removal. Its simulator remained a post-run oracle and was never input to Living's discovery or observation.

### Neutral offline path

1. Convert the explicit neutral descriptor into a deterministic integration plan and Product Manifest.
2. Build and validate synthetic semantic events against the generated host configuration.
3. Project workflow cases and variants deterministically.
4. Detect repeated backtracking and bind the opportunity to the exact affected event set.

### Opt-in live-model path

1. Recompute and verify the neutral manifest and evidence hashes, event links, time window, origin, session count, and projected case count.
2. Remove host display text, paths, symbols, metadata, release data, and user/session/subject identifiers; replace raw event IDs with opaque aliases.
3. Send the bounded neutral evidence to GPT-5.6 through one explicitly selected transport. The Codex CLI path uses an isolated read-only temporary workspace, ephemeral files, an explicit disable list for installed host-capable feature surfaces, strict schema/stream/file bounds, and fail-closed JSONL acceptance. The API path uses `store: false`, no requested tools, strict Structured Outputs, and bounded output tokens.
4. Revalidate the returned schema, citations, metrics, product nodes, evidence scope, and provider-specific provenance before returning a local draft. API response IDs and actual models remain distinct from CLI thread IDs and requested-model evidence.

## Planned lifecycle, not current functionality

The intended later lifecycle is human-confirmed capability contract -> Codex-generated artifact -> deterministic proof -> separate activation approval -> broker execution -> measurement -> disable or rollback -> hash-linked receipts.

None of the following is implemented end to end: additional framework adapters, production evidence storage, Codex artifact generation, broker execution, proof gates, lifecycle state storage, activation, measurement, disable, rollback, or live Studio/host integration.

## Reference CRM boundary

The standalone CRM and its user-workflow simulator were built separately. The CRM exposes an ordinary application surface and does not import Living core or Studio. Living's supported adapter may add only its documented generated integration files. Simulator traces provide synthetic post-run ground truth; Living must independently derive its map, evidence, metrics, and opportunities rather than consume simulator conclusions.

## Current non-claims

- Universal or zero-configuration support for arbitrary codebases.
- Automatic knowledge of business goals, outcomes, or causality.
- Whole-desktop, hidden-content, or screenshot observation.
- Background installation or mutation.
- Production-readiness or universal safety.
- Multi-tenant or multi-instance deployment.
- Live Studio ingestion or a completed governed activation lifecycle.
- Production generalization from synthetic evidence.
