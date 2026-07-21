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
  -> deterministic workflows + metrics
  -> generic repeated-sequence, corroborated-backtracking, correction-rework and dead/rage-click candidates
  -> deterministic single-opportunity arbitration

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

studio:live --root <host> --host-url <loopback>
  -> server-canonicalized read-only map before installation
  -> bounded active-release tailer + shared deterministic evaluator
  -> durable strict event hash chain + replay + SSE Last-Event-ID resume
  -> the same model, proof, approval, apply and rollback functions
  -> source verification separate from host-frame inspection

preview:host --root <host> --out <new-path>
  -> bounded stable Git-tracked snapshot in an isolated copy
  -> sealed preimage/postimage identity endpoint for display only

explicit studio:sync
  -> separate offline map, workflow, opportunity, proposal, proof and receipt views
```

## Implemented components

| Component | Implemented | Excluded |
| --- | --- | --- |
| Discovery | Source-linked nodes, edges, routes and runtime locators for supported `src/app` repositories | Arbitrary Node/framework support; host execution; business-goal inference |
| Installer | Create-only atomic writes, journaled hashes, idempotency and exact-hash removal | Existing-file overwrite, dependency editing, evidence deletion |
| Observer/collector | Route/action/performance/friction events and bounded CSS-pixel geometry in manifest-scoped hash chains | Content, DOM, screenshots, persistent identity, production telemetry |
| Analyzer | Deterministic workflow cases, variants, metrics, generic repeated subsequence mining, exact-evidence candidates for corroborated backtracking, repeated corrections and dead/rage-click failures, plus input-order-independent arbitration | Product-specific workflow rules, causality or automatic knowledge of success |
| Intelligence | Explicit Codex CLI and Responses API transports; evidence brief plus source-patch Structured Outputs; provenance and local validation | Tools, filesystem authority, approval or application authority |
| Candidate selector | Source provenance from affected manifest nodes; at most 3 files, 64 KB each and 96 KB total | Repository-wide context, API/tests/configuration, symlinks, binary or changed-during-read files |
| Evolution engine | One existing UI file, 1-8 exact edits, static guards, exact hashes, proof, receipts, approval, apply, recovery and rollback | New/multiple files, dependencies, Git, server/network/process/secret/dynamic-code authority |
| CLI | Human-readable `install`, `improve`, `status`, `approve`, `apply`, `rollback`; canonical `--json` | Background or automatic approval/application |
| Studio | Server-started loopback Live Run; durable strict events; active-release evidence tailing; shared detector progress; real model/proof/lifecycle milestones; exact governed commands; optional isolated comparison; separate explicit offline capture | Remote production control plane, arbitrary browser-selected roots, model reasoning, automatic runtime proof or post-change measurement |

## Generic recurring-workflow discovery

The generic detector operates on normalized journey-step tuples of event kind, manifest node ID, and event name. Within each workflow case it enumerates contiguous subsequences from 2 to 64 steps, counts only non-overlapping occurrences, and retains a candidate only when it occurs at least twice per case in at least three cases spanning three independent sessions.

Candidates are ordered by affected cases, independent sessions, total occurrences, sequence length, and stable tuple identity. The algorithm contains no lead, CRM, route-name, or feature-specific pattern. It also requires no `metadata.signal`; deterministic means identical validated evidence yields identical mining and selection.

The result is a `repeated-sequence` hypothesis with an exact minimized event set. Recurrence alone does not establish friction, user intent, or causality. The [clean generic proof](proof/generic-recurring-workflow-discovery.md) learned a four-step workflow from zero explicit signal events before GPT interpreted its possible meaning.

## Two model calls, one authority boundary

Before the first GPT-5.6 call, Living revalidates the exact minimized evidence and recomputes the semantics of known built-in detector versions. Product context is evidence-first: evidence-linked nodes are retained, included one-edge neighbors follow, and lexical fill is context only. The returned `EvolutionBrief` may name affected nodes only from the evidence-linked/neighbor set.

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
- Deterministic code owns candidate projection, target validation, hashes, proof and filesystem operations; GPT selects only among the supplied candidates.
- A human resupplies and approves the exact artifact and proof hashes; the engine binds the stored contract and current receipt revision.
- Application writes only while the target equals the approved preimage.
- Rollback restores only while the target equals the applied postimage.
- Every transition extends the receipt chain; interrupted transactions are recovered before further work.
- An application-scoped lease lock serializes mutations; a same-app sibling cannot also become approved or applied until the active evolution is rolled back.
- `improve` reuses an existing evolution only when the app, manifest, opportunity ID, and complete stored Opportunity contract are deeply equal.

Settled `status` and listing reads validate state and receipts without acquiring or modifying the mutation lease. If a pending journal exists, the read enters the locked recovery path. Mutations remain application- and evolution-locked.

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

Select `--provider api` explicitly when using the Responses API. The CLI is sufficient for the complete governed source lifecycle. Connected Studio observes and invokes those same functions; its display stream cannot mutate source or change authority. The older synchronized capture remains an explicit offline fixture/regression path.

## Live Studio event boundary

`studio:live` maps and canonicalizes the supported host before launching Next.js on loopback. Server-only environment values bind the root, session, mapped app, and host URL; no API accepts a root. The monitor reconstructs state from validated installation artifacts, the exact active-release evidence chain, deterministic analysis, evolution state, receipts, and the current sealed target hash.

Each `living.live-event/v1` event is strict, bounded, sequence-numbered, and hash-linked on disk under the server-owned live session. Duplicate semantic event IDs are idempotent; conflicting reuse fails. SSE uses the sequence as its event ID, replays only validated history after `Last-Event-ID`, and registers new delivery behind the same append barrier. The browser uses no lifecycle timer polling; an event triggers a fresh strict state read. A disconnected browser changes only presentation state.

Evidence reads use a bounded no-follow handle and accept only complete newline-terminated collector records. Previously accepted hashes may not disappear or change. Truncation, deletion, replacement, symlink traversal, invalid UTF-8, or chain corruption stops monitoring. Safe event clues contain only allowlisted event identity, mapped node identity, technical signal, origin, and aggregate counts.

Studio lifecycle instrumentation surrounds the real awaited model and evolution operations. It emits no optimistic completion and no reasoning content. Approval cannot write source. Apply and rollback become completed source transitions only after the engine returns, the receipt exists, and the current target hash equals the sealed result.

## Generic preview boundary

`preview:host` selects one prepared or approved evolution and copies only bounded Git-tracked regular files from a stable revision/status snapshot into new output directories outside the connected root. It does not require a clean worktree, but it rejects a snapshot that changes during capture, symlinks or unsafe paths, an untracked evolution target, a target that no longer matches the sealed preimage, and excessive file or byte counts.

The optional before copy receives the exact sealed preimage; the proposed copy receives the exact sealed postimage. Each gets a reserved loopback identity endpoint that reopens the target without following links and verifies the evolution, target path, view, and current source hash. Studio displays a frame only after that identity matches. The copy is not a sandbox for arbitrary untrusted code, grants no lifecycle authority, and provides no evidence about the connected host's runtime.

## Reference CRM boundary

The separate CRM exposes an ordinary product surface and has no dependency on Living core or Studio. Its simulator drives synthetic browser behavior but does not tell Living what to detect or what patch to create. Living independently derives the map, evidence, opportunity and model context.

The engine contains no CRM-specific Previous/Next transform. GPT may propose any change that fits the one-file UI envelope and passes the static policy.
The clean July 21 proof started from 144 discovered nodes and 180 edges, then learned the lead-link → detail-route → back-link → list-route sequence from generic manifest identities. The resulting `Back to leads` edit was GPT-authored; neither that workflow nor that replacement exists as an engine rule.

## Current non-claims

- Universal or zero-configuration support for arbitrary codebases.
- Automatic knowledge of business goals, outcomes or causality.
- A claim that recurrence alone means friction or that the mined sequence caused the generated change to improve outcomes.
- Semantic proof that a generated patch is correct, accessible or buildable.
- Automatic source application without human approval.
- Runtime success merely because source was written.
- Automatic capture and measurement of a post-change cohort.
- Production multi-tenant telemetry or remote lifecycle control.
