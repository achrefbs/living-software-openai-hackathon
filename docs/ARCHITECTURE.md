# Architecture

## Product boundary

Living Software is an installable developer tool, not the reference CRM. Current automatic discovery and installation support TypeScript Next.js App Router 15.3+ repositories using `src/app`. The CRM and simulator remain independent projects.

```text
supported Next.js source
  -> bounded non-executing discovery
  -> Product Manifest + observation map + metric catalog

living install
  -> create-only observer + same-origin collector + hash journal

ordinary UI activity
  -> privacy-minimized, hash-linked local evidence
  -> deterministic workflows + metrics + opportunity

living improve --provider codex|api
  -> GPT-5.6 evidence interpretation
  -> up to 3 manifest-bound UI candidates / 96 KB
  -> second tool-less GPT-5.6 call authors 1-8 edits to 1 existing file
  -> deterministic compilation + static proof
  -> prepared state; host unchanged

human exact-hash approval
  -> engine-owned capture-verify/no-overwrite source application
  -> manual host build/reload and verification
  -> exact-postimage rollback when requested

explicit studio:sync
  -> Studio map, workflow, opportunity, proposal, proof and receipt views
```

## Implemented components

| Component | Implemented | Excluded |
| --- | --- | --- |
| Discovery | Source-linked nodes, edges, routes and runtime locators for supported `src/app` repositories | Arbitrary Node/framework support; host execution; business-goal inference |
| Installer | Create-only atomic writes, journaled hashes, idempotency and exact-hash removal | Existing-file overwrite, dependency editing, evidence deletion |
| Observer/collector | Route/action/performance/friction events and bounded CSS-pixel geometry in manifest-scoped hash chains | Content, DOM, screenshots, persistent identity, production telemetry |
| Analyzer | Deterministic workflow cases, variants, metrics and the current threshold-based backtracking opportunity | Causality or automatic knowledge of success |
| Intelligence | Explicit Codex CLI and Responses API transports; evidence brief plus source-patch Structured Outputs; provenance and local validation | Tools, filesystem authority, approval or application authority |
| Candidate selector | Source provenance from affected manifest nodes; at most 3 files, 64 KB each and 96 KB total | Repository-wide context, API/tests/configuration, symlinks, binary or changed-during-read files |
| Evolution engine | One existing UI file, 1-8 exact edits, static guards, exact hashes, proof, receipts, approval, apply, recovery and rollback | New/multiple files, dependencies, Git, server/network/process/secret/dynamic-code authority |
| CLI | Human-readable `install`, `improve`, `status`, `approve`, `apply`, `rollback`; canonical `--json` | Background or automatic approval/application |
| Studio | Validated static capture plus loopback connected lifecycle, proposal inspection and optional comparison | Continuous live ingestion, remote production control plane, automatic measurement |

## Two model calls, one authority boundary

The first GPT-5.6 call receives the exact privacy-minimized opportunity context and returns an `EvolutionBrief`. Living validates all cited evidence, metrics and affected product nodes.

Living then resolves those affected nodes to eligible UI source provenance. It reads at most three exact candidates, capped at 96 KB total. The second GPT-5.6 call receives only the validated brief and those candidates. It selects one file and authors one to eight exact anchor/replacement edits.

Both calls are tool-less from the product's perspective. The model cannot browse the repository, call a terminal, read another file, write source or execute the result. The Codex CLI transport uses an isolated read-only temporary workspace; the API transport uses `store: false`. There is no automatic provider fallback.

The model output is not accepted as arbitrary executable authority. The deterministic compiler verifies:

- strict schema and draft-only governance;
- supplied candidate path and exact preimage SHA-256;
- one eligible existing UI file;
- 1-8 unique anchors that each occur exactly once and do not overlap;
- bounded replacements, aggregate diff and postimage;
- absence of declared server, network, process, secret, dynamic-code and raw-HTML authority;
- exact app, manifest, opportunity, model-run, proposal, contract, artifact and proof bindings.

Passing this proof creates a `prepared` evolution and does not edit the host.

## Lifecycle and ownership

State transitions are:

```text
prepared -> approved -> applied -> rolled-back
```

- GPT can create only an untrusted proposal.
- Deterministic code owns source selection, validation, hashes, proof and filesystem operations.
- A human resupplies and approves the exact artifact and proof hashes; the engine binds the stored contract and current receipt revision.
- Application writes only while the target equals the approved preimage.
- Rollback restores only while the target equals the applied postimage.
- Every transition extends the receipt chain; interrupted transactions are recovered before further work.
- An application-scoped lease lock serializes mutations; a same-app sibling cannot also become approved or applied until the active evolution is rolled back.

`approve --apply` combines two explicit engine transitions for terminal convenience: record exact human approval, then apply that same approved postimage. Omitting `--apply` preserves separate approval and application commands.

## Terminal-first path

```bash
npm run living -- install --root <next-app> --synthetic
# exercise the application
npm run living -- improve --root <next-app> --provider codex
npm run living -- status --root <next-app>
npm run living -- approve --root <next-app> --evolution <id> --actor <operator> --artifact-hash <artifact-sha256> --proof-hash <proof-sha256> --apply
# build/reload and inspect the host
npm run living -- rollback --root <next-app> --evolution <id> --actor <operator>
```

Select `--provider api` explicitly when using the Responses API. The CLI is sufficient for the complete governed source lifecycle. Studio is a visual companion that consumes an explicitly synchronized, minimized capture and the same local evolution ledger.

## Reference CRM boundary

The separate CRM exposes an ordinary product surface and has no dependency on Living core or Studio. Its simulator drives synthetic browser behavior but does not tell Living what to detect or what patch to create. Living independently derives the map, evidence, opportunity and model context.

The engine contains no CRM-specific Previous/Next transform. GPT may propose any change that fits the one-file UI envelope and passes the static policy.

## Current non-claims

- Universal or zero-configuration support for arbitrary codebases.
- Automatic knowledge of business goals, outcomes or causality.
- Semantic proof that a generated patch is correct, accessible or buildable.
- Automatic source application without human approval.
- Runtime success merely because source was written.
- Automatic capture and measurement of a post-change cohort.
- Production multi-tenant telemetry or remote lifecycle control.
