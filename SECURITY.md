# Security and trust model

Living Software treats host source, observed events, and every model response as untrusted. GPT-5.6 may author a bounded source proposal, but it receives no host tools and never owns filesystem, approval, application, or rollback authority.

## Implemented authority boundaries

| Component | Authority | Fail-closed boundary |
| --- | --- | --- |
| Discovery | Read supported TypeScript/Next.js source and derive a source-linked manifest | Next.js App Router 15.3+ using `src/app`; no module import, JSX execution, host scripts, arbitrary configuration, or path escape |
| Installer | Create declared observation files after explicit installation | Create-only, repository-relative, symlink-safe, atomic and hash-journaled; no `package.json` edit or overwrite |
| Observer and collector | Record bounded same-origin workflow, performance, friction and CSS-pixel geometry evidence | No text, form values, keystrokes, query strings, DOM/HTML, cookies, headers, bodies, screenshots, or persistent user identifiers |
| Analyzer | Deterministically derive workflows, metrics, exact-evidence candidates for corroborated backtracking, repeated corrections and dead/rage-click failures, then select at most one through input-order-independent arbitration | No model inference, business-outcome truth, causality, or host mutation |
| GPT brief call | Interpret one exact privacy-minimized opportunity | Strict schema and evidence references; no tools, approval or source authority |
| Source projection | Read UI files linked by the brief's affected manifest nodes | At most 3 regular UTF-8 files, 64 KB each and 96 KB total; only eligible existing source; symlinks and read races fail closed |
| GPT patch call | Select one supplied candidate and author 1-8 exact anchor/replacement edits | Strict schema; no terminal, filesystem, browser, network tool, or access to any unprojected file |
| Patch engine | Validate and deterministically compile the untrusted proposal | Exact target/preimage, allowed path and extension, unique exact anchors, static authority guards, bounded diff and one postimage |
| Human approval | Authorize the exact contract, artifact and proof | Caller-supplied artifact and proof hashes plus the engine-bound stored contract and current receipt revision are required; the operator label is audit metadata, not authenticated identity |
| Application and rollback | Engine writes one approved postimage or restores one preimage | Exact source hashes, capture-then-verify with no-overwrite publication, journal recovery, append-only receipts, exact-postimage rollback |
| Studio | Visualize snapshots, proposals, proofs and receipts; expose a loopback development broker | Exact connection/evidence/lifecycle identity checks; comparison alone has no mutation authority |

## Model-authored source proposal

Living intentionally allows GPT-5.6 to invent the proposed UI change. It confines that creativity before and after the request:

1. For exact built-in detector versions, Living recomputes metrics, evidence counts, samples, time bounds, confidence, configuration and opportunity identity from the minimized events before model transport. Unknown detector versions remain subject to the generic contract and evidence checks only.
2. The model context always retains evidence-linked product nodes and then their included one-edge manifest neighbors. Only that relevant set may appear in `affectedProductNodeIds`; lexically selected fill nodes are context only.
3. Living maps the cited affected nodes to eligible source provenance below `src/app` or `src/components`.
4. It sends no more than three candidate files, no file larger than 64 KB, and no more than 96 KB in total.
5. The model is instructed to select exactly one candidate and return one to eight exact anchor/replacement edits.
6. Both the brief and patch calls use strict Structured Outputs and no requested tools. The Codex CLI transport runs from a private read-only temporary workspace with installed host-capable features disabled; the Responses API transport uses `store: false`.
7. Living revalidates the response locally. Model prose or source comments never become authority.

Eligible patch targets are existing `.ts`, `.tsx`, `.js`, `.jsx`, or `.css` files below `src/app` or `src/components`. Route handlers, API directories, tests, E2E files, configuration, hidden paths, declarations, lock files, new files, multiple files and dependencies are excluded.

Each proposal must bind the exact candidate path and SHA-256 preimage. Its anchors must be unique, occur exactly once and not overlap. The compiler permits one to eight edits, bounds each anchor and replacement, caps the aggregate diff at 128 KB and 2,000 changed lines, and caps source/postimage size at 2 MB.

Replacement guards reject declared:

- server directives and server request/header APIs;
- network, process, filesystem and host-module authority;
- dynamic import, CommonJS execution, `eval` and dynamic functions;
- raw HTML execution, script tags and JavaScript URLs;
- browser storage, global navigation, workers, form submission, external URLs/CSS imports, and programmatic or dynamic resource loaders;
- secret-, credential- and API-key-bearing tokens;
- Git, dependency, multi-file and new-file authority.

These are static defense-in-depth checks, not a semantic proof that arbitrary generated UI is correct or secure. A passing proposal may still have a product, accessibility, styling, type or build defect. The human must inspect the exact edit preview, and the host must be built or reloaded and verified after application.

## Approval, application and rollback

`living improve --provider <codex|api>` can prepare a proposal but cannot approve or write source. Prepared state binds the app, manifest, opportunity, supporting event set, both GPT runs, selected candidate, proposal, contract, artifact, proof, preimage and postimage.

`living approve --evolution <id> --actor <operator> --artifact-hash <artifact-sha256> --proof-hash <proof-sha256> --apply` is an explicit human action. The caller must resupply the two exact hashes shown during review; Living rejects a changed or mistyped digest. It then records that approval and asks the engine to write only the bound postimage. Omitting `--apply` keeps approval and application separate.

Application fails if the source no longer equals the approved preimage. Rollback fails unless it still equals the applied postimage. Transactions and receipts are recovered and revalidated after interruption. The model cannot satisfy any lifecycle transition.

Approval, application, and rollback are serialized by an application-scoped lease lock within the repository. Approval or application rejects another same-app evolution already in `approved` or `applied`; exact rollback releases that active slot.

Settled `status` and listing reads validate the hash-linked state and receipts without acquiring or modifying the mutation lease. If a pending transaction journal exists, the read falls back to the locked recovery path. Mutations remain application- and evolution-locked.

## Installation and removal safety

The root-mode installer creates only:

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

An existing target file is a conflict. Repeating an identical installation is a no-op. Uninstall removes only unchanged files whose hashes match the install record; modified files and captured evidence are preserved.

## Data policy

- Event schemas reject unknown fields and sensitive metadata keys.
- Capture uses mapped identities and bounded primitives, not page content.
- Per-tab session identifiers are ephemeral.
- Evidence logs are manifest-scoped append-only hash chains; hashing provides integrity, not encryption.
- Raw event IDs become local aliases before model interpretation; identities, metadata and unrelated source are omitted.
- Candidate source text is sent only because source authorship requires it. Operators must use Living only on code they are authorized to disclose to the explicitly selected OpenAI transport.
- API keys are read only at request time and must never be committed or logged.
- Synthetic provenance remains visible in evidence and Studio.

## Operational limits

- Current discovery/install support is not universal Node support.
- The collector and Studio broker are local development proof surfaces, not authenticated multi-instance production services.
- Evolution/application locks use a fixed 60-second local lease without heartbeat; an unusually long or stalled transition may be treated as stale and should be retried only after inspecting the ledger and host source.
- Model output is not a substitute for code review, typechecking, tests, accessibility review or runtime verification.
- The locked fresh-clone audit currently reports one moderate transitive PostCSS advisory as two dependency entries through stable Next.js 16.2.10. npm offers only an incompatible Next.js 9.3.3 downgrade. No override is claimed; monitor stable Next.js releases and update when a compatible patched dependency is available.
- Source application is not evidence that the product improved.
- Automatic post-change capture and before/after measurement are not implemented.
- Studio sync is explicit, not continuous live ingestion.

## Reporting a vulnerability

Do not open a public issue if it would expose a secret or unsafe execution path. Contact the repository owner privately with reproduction steps, affected commit and impact.
