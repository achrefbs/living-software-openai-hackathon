# Build and Codex collaboration log

This is the chronological evidence trail for OpenAI Build Week. Add an entry for every material Codex session, major implementation slice, proof run, and submission milestone.

## Required session ID

Primary `/feedback` Codex Session ID: `SESSION-ID-PENDING`

Replace this only with the real ID from the task where the majority of core functionality is built. Do not invent or infer an ID.

## 2026-07-19 - Repository and compliance baseline

**Scope**

- Pulled the authoritative OpenAI Build Week overview, official rules, judging criteria, key dates, submission fields, and latest announcements through the Devpost Hackathons plugin.
- Verified that the entrant is registered and that no Devpost project existed before setup.
- Audited the local workspace and identified the separate pre-hackathon prototype ending at commit `9f43232` on July 12.
- Created a clean, isolated repository rather than modifying or relabeling the earlier private prototype.
- Added prior-work disclosure, rule-mapped documentation, repository checks, licensing, and judge-path placeholders.

**How Codex accelerated the work**

- Compared live Devpost requirements against the repository plan.
- Located collision and provenance risks across existing worktrees.
- Drafted the compliance automation and documentation structure.
- Checked that the README explicitly covers setup, testing, sample data, Codex, GPT-5.6, and judge access.

**How GPT-5.6 was used**

- GPT-5.6 powered the Codex reasoning used for the compliance audit and repository initialization.
- No runtime model integration is claimed in this entry; that will be documented when implemented and tested.

**Entrant direction and working decisions**

- The entrant selected Living Software as the likely project direction.
- "Living Software" and "Software that earns the right to evolve." are the current working name and thesis from the accepted concept brief; confirm the final wording before submission.
- A governed rather than autonomous mutation loop is the current product guardrail; confirm or revise it during implementation.
- The entrant explicitly required a compliant, fresh challenge repository before implementation begins.

**Evidence**

- Initial repository commit: `3bfd744` (`chore: establish Build Week compliance baseline`).
- Eligibility marker: annotated tag `build-week-start`.
- Devpost rules snapshot: July 19, 2026.
- Validation command: `npm run check`.

## 2026-07-19 - Public repository and Devpost project linked

**Scope**

- Created the public GitHub repository from the audited local baseline without generated starter files.
- Pushed `main` and the annotated `build-week-start` eligibility tag.
- Linked the public repository to the Living Software Devpost project page.

**How Codex accelerated the work**

- Carried the verified local history into the remote repository without rewriting the provenance boundary.
- Independently checked the local history, tag, tests, tracked filenames, and likely secret patterns before publication.

**How GPT-5.6 was used**

- GPT-5.6 powered the Codex workflow that configured, published, and remotely verified the challenge baseline.

**Entrant direction and working decisions**

- The repository is public and MIT-licensed for straightforward judge access.
- The Devpost description remains explicitly labeled as work in progress until the demonstrated product claims are final.
- Devpost published the standalone project page after its required fields were completed; it has not been submitted to the hackathon.

**Evidence**

- Public repository: <https://github.com/achrefbs/living-software-openai-hackathon>
- First verified remote HEAD before the publication-record commits: `ff33c05b498f0bf3030c74da2f94f44c8a466b88`.
- Baseline tag: `build-week-start` at `3bfd744f7e8d43ebe34730af0adcdb2c0b27d6cf`.
- Devpost project page: <https://devpost.com/software/living-software-x69rd1> (version 2; no hackathon submission).
- Validation: `npm test`, `git fsck --full`, and GitHub connector commit verification.

---

## 2026-07-19 - Product map and first build spine

**Scope**

- Grounded product discovery in the accepted Living Software thesis, Founder Inbox vertical slice, trust model, judging criteria, and prior-work boundary.
- Created and organized the `living-software-product-map` canvas through the locally configured SuperDraw MCP server.
- Mapped users and jobs, the governed evolution loop, trust primitives, the three-minute demo, Build Week scope, risks and experiments, metrics, exclusions, and the later platform.
- Captured a recommended implementation order that proves installation and rollback before adding model intelligence.

**How Codex accelerated the work**

- Synthesized independent product, architecture, safety, and hackathon perspectives into one connected 89-element canvas.
- Challenged the product framing so Founder Inbox remains a thin host and the governed evolution lifecycle remains the actual product.
- Converted the map into a repository-backed working artifact without treating every brainstormed idea as an accepted decision.

**How GPT-5.6 was used**

- GPT-5.6 powered the product reasoning, assumption testing, map structure, safety differentiation, and MVP sequencing performed through Codex.

**Entrant direction and working decisions**

- The entrant explicitly asked to begin implementation from a SuperDraw product map containing ideas, features, and open thoughts.
- Canvas content remains working product discovery until the entrant accepts or revises individual decisions.

**Evidence**

- Canvas: `living-software-product-map`.
- Canvas file: `C:\Users\acera\Desktop\SuperDraw\canvases\living-software-product-map.superdraw.json`.
- SuperDraw MCP verification: 89 elements, 30 nodes, 29 connections, one connected group.
- Repository artifact: [docs/PRODUCT_MAP.md](docs/PRODUCT_MAP.md).

---

## 2026-07-19 - Host-agnostic implementation slice

**Scope**

- Reframed the current build as a reusable Living Software tool, with Living Studio as its own interface and the standalone CRM plus simulator kept in separate repositories.
- Added strict, versioned contracts for configuration, manifests, workflow events, opportunities, capability drafts, host interfaces, receipts, and Studio messages.
- Added an explicit-descriptor Next.js/TypeScript CLI that creates deterministic `init`, `map`, `doctor`, and `uninstall` plans. This slice is dry-run only and performs no source scanning or writes.
- Added a privacy-safe host event SDK with validation, sensitive-key rejection, bounded batching and queues, and failed-batch restoration.
- Added deterministic workflow case/variant projection and a repeated-backtracking detector.
- Added a neutral synthetic host fixture and offline replay that expects two variants and one opportunity affecting three cases.
- Added a read-only, fixture-backed Studio with Product Map, Workflows, Opportunities, Evolutions, and Receipts routes plus preview states.
- Added a GPT-5.6 Responses API intelligence package with canonical manifest/evidence verification, privacy-minimized normalized events, opaque evidence aliases, strict structured output, timeout/token bounds, local reference validation, and injected offline tests.
- Connected the detector's exact affected evidence bundle to an explicit `npm run demo:gpt56` runner without making the live call implicit in tests or setup.

**How Codex accelerated the work**

- Rechecked live Devpost requirements before implementation.
- Designed and implemented the package boundaries, schemas, deterministic engine, SDK, CLI, Studio, neutral replay, intelligence boundary, and tests.
- Kept current claims separate from planned broker, proof, approval, activation, measurement, and rollback work.

**How GPT-5.6 was used**

- GPT-5.6 powered the Codex reasoning used for this architecture and implementation session.
- The product integration is implemented to request `gpt-5.6` through the Responses API and reject malformed, wrongly referenced, or non-GPT-5.6 responses. Its checks establish schema/reference integrity; model interpretation still requires human review.
- Automated intelligence tests use an offline injected transport. No live product API call or saved GPT-5.6 output is claimed in this entry; that proof remains required before submission.

**Human decisions**

- The entrant rejected embedding the CRM in this repository and selected a reusable tool, separate reference host, and separate Studio.
- The entrant required continued alignment with the live hackathon rules.
- Model authority remains proposal-only; deterministic validation and human review bound the current and future lifecycle.

**Evidence**

- Implementation paths: `packages/contracts`, `packages/cli`, `packages/host-sdk`, `packages/core`, `packages/intelligence`, `apps/studio`, `samples/neutral-host`, `scripts/run-neutral-demo.mjs`, and `scripts/run-gpt56-demo.mjs`.
- Verification commands: `npm install`, `npm run typecheck`, `npm run test`, `npm run demo:neutral`, and `npm run dev:studio`.
- Verified platform claim is limited to Windows 11 with Node.js 22; other operating systems are not yet verified.
- Primary `/feedback` Codex Session ID: pending.

---

## 2026-07-20 - Automatic discovery and friction proof against the separate CRM

**Scope**

- Kept the CRM in its separate repository and filesystem path; no CRM source was imported into this Living Software repository.
- Scanned the CRM into a source-linked map with 170 nodes, 180 edges, and 92 runtime locators. The resulting manifest hash was `sha256:93ff373a868ebf4c221c512f07532b99a2b7ea382ccfe2979097bcf0cf435dbe`.
- Applied the explicit installation, which created nine generated files. `living doctor` then reported `CONTRACTS_VALID` and `INSTALL_HEALTHY`.
- Discarded the first runtime attempt because it reached a stale server and produced no evidence.
- Started the CRM fresh on port 3210. The baseline smoke completed two of two synthetic browser sessions with 46 simulator events. At that point Living had two cases, two variants, 64 metric values, and no threshold opportunity.
- Added a deterministic friction cohort using seed 202 and pace 0. It completed three of three synthetic sessions with 75 simulator events, including 69 actions and zero retries or errors.
- Confirmed that the collector accepted the browser requests and stored the final release-scoped evidence as 58 hash-linked records containing 204 Living events across five sessions and five cases.
- Analyzed the cumulative evidence into five raw variants and 72 metric values. `detector.backtracking@1.1.0` detected `opportunity.backtracking.ef9a14112819` with four affected cases, 13 revisits, an affected ratio of 0.8, confidence 0.82, and 13 sample references.
- Kept simulator traces outside Living's analysis. They were used only as a post-run oracle for comparison, never as detector or workflow input.
- Did not connect this captured evidence to Living Studio at the time of this proof; that integration remained subsequent work.

**How Codex accelerated the work**

- Ran the scan, guarded installation, health check, fresh-server capture, evidence verification, and cumulative deterministic analysis while preserving the simulator-oracle boundary across repositories.
- Identified the stale-server attempt from the absence of evidence and excluded it instead of presenting it as a successful run.

**How GPT-5.6 was used**

- No product-runtime GPT-5.6 interpretation is claimed for this proof. This entry records deterministic discovery, browser capture, and analysis only.

**Human decisions**

- The CRM remains an independent host rather than becoming part of the Living Software repository.
- All proof sessions are explicitly synthetic, and simulator traces remain post-run validation data rather than Living analysis input.
- A detector result is reported only after its deterministic threshold passes.

**Evidence**

- Applied manifest: `sha256:93ff373a868ebf4c221c512f07532b99a2b7ea382ccfe2979097bcf0cf435dbe`.
- Release evidence: `.living/data/releases/93ff373a868ebf4c221c512f07532b99a2b7ea382ccfe2979097bcf0cf435dbe/events.ndjson` with 58 records and 204 Living events.
- Evidence chain head: `sha256:f5d96c7e272e537c5bbf03aceec06db6246acb80e9432149ee1da55befbd46bb`.
- Smoke baseline: two of two synthetic sessions, 46 simulator events, two Living cases, two raw variants, 64 metric values, and no opportunity.
- Added friction cohort: three of three synthetic sessions, 75 simulator events, seed 202, pace 0, 69 actions, and zero retries or errors.
- Final analysis: five sessions/cases, five raw variants, 72 metric values, and `opportunity.backtracking.ef9a14112819` from `detector.backtracking@1.1.0` with four affected cases, 13 revisits, affected ratio 0.8, confidence 0.82, and 13 sample references.

---

## 2026-07-20 - Exclude simulator and test harnesses from automatic discovery

**Scope**

- Audited the installed CRM manifest and found 29 provenance references from `sim/`, `scripts/`, and `tests/`, contributing 26 non-product nodes to the map.
- Restricted the supported Next.js reader to root `package.json`, `app/**`, `src/app/**`, `src/components/**`, and `src/lib/**`.
- Pruned `.living` before traversal, retained the exact generated-integration exclusions, and excluded conventional co-located tests and stories.
- Added a regression proving simulator, seed-script, test, installed-runtime, and build-harness decoys cannot change the source digest, manifest, runtime locators, metric catalog, or scan statistics while a host integration below `src/lib` remains discoverable.
- Ran a read-only CRM rescan. It produced 144 nodes, 180 edges, 92 locators, and 212 metrics from 34 application files, with no harness provenance. The scan was not applied to the CRM and did not alter preserved evidence.

**How Codex accelerated the work**

- Traced the contamination from the repository-wide source reader through unconditional AST analysis into entity and local-storage nodes.
- Implemented the source boundary, adversarial regression fixture, package verification, and read-only independent-host check.

**How GPT-5.6 was used**

- No product-runtime GPT-5.6 call is claimed for this correction. The change and its proof are deterministic.

**Human decisions**

- Automatic discovery represents supported application code, not repository simulators, tests, seed scripts, or tooling.
- The historical 170-node CRM scan remains evidence of the pre-boundary run and must not be presented as the corrected product map.

**Evidence**

- Corrected read-only CRM digest: `sha256:609342b5a2d495b7bc99824a33ef2070ebb374fbef5cbdca21dbee94642ced2d`.
- Corrected manifest content hash: `sha256:63d3da3f26c4eaca269f7063e75ea3db0657e7aa7d735df69ab5e6050091e265`.
- Verification: `npm run build:cli`; discovery tests 10/10; automatic tests 9/9; CLI tests 19/19; discovery, automatic, and CLI typechecks all passed.

---

## 2026-07-20 - Corrected CRM capture and static Studio bridge

**Scope**

- Removed only the eight unchanged generated artifacts from the pre-boundary CRM install, verified that the prior 58-line evidence file remained byte-identical, and installed the reviewed eight-artifact corrected plan.
- Verified `CONTRACTS_VALID` and `INSTALL_HEALTHY`, a 144-node/180-edge manifest from 34 application files, 92 runtime locators, 212 metric definitions, and zero simulator/test/script/generated provenance.
- Ran a fresh two-session smoke and three-session friction cohort. Living independently stored 48 hash-linked records containing 224 events, projected five cases and five variants, and computed 70 metric values.
- Detected `opportunity.backtracking.fcf5d947adf8` with `detector.backtracking@1.1.0`: three affected cases, 17 revisits, affected ratio 0.6, confidence 0.74, and 17 sample event references.
- Added the strict `living.studio-snapshot/v1` bridge and synced only the verified synthetic, privacy-minimized analysis into the gitignored Studio `.local` directory.
- Browser-verified Product Map, Workflows, Opportunities, Evolutions, and Receipts. The interface labels the export as static synthetic evidence, makes no live-host or GPT-5.6 claim, and leaves captured-snapshot Evolutions and Receipts explicitly unconnected.

**How Codex accelerated the work**

- Guarded the uninstall/reinstall with plan-state and content-hash checks, ran both browser cohorts, verified the new release chain, checked deterministic snapshot output and minimization, and performed the responsive browser review.
- The visual review found both the original harness contamination and a narrow-screen readability weakness; both were corrected and regression-tested before final proof was recorded.

**How GPT-5.6 was used**

- No product-runtime GPT-5.6 call is claimed for this proof. Automatic-host evidence is not yet connected to the separate model runner.

**Human decisions**

- The CRM and simulator remain independent; simulator output is a post-run oracle only.
- Studio accepts only an explicitly synced synthetic static export and stays read-only.
- The corrected 144-node manifest supersedes the earlier 170-node diagnostic for product claims without deleting the historical evidence.

**Evidence**

- Source digest: `sha256:609342b5a2d495b7bc99824a33ef2070ebb374fbef5cbdca21dbee94642ced2d`.
- Manifest: `sha256:63d3da3f26c4eaca269f7063e75ea3db0657e7aa7d735df69ab5e6050091e265`.
- Corrected release chain head: `sha256:58ededd51d06ea7e3ee66af41dcaa9273059ac4722fa611c93d6d120c0a147b2`.
- Corrected NDJSON: 48 lines, SHA-256 `82b38b1032a430849fefbd29343a53bff36fef9e3bad0488c3914b94b392cf8a`.
- Preserved prior NDJSON: 58 lines, unchanged SHA-256 `471ff2be4f9629f2f2247a02048974c4592fcd74724bb8c7ca22f180871d1b26`.
- Snapshot: five cases, five variants, 144 nodes, 180 edges, 224 events, 70 metric values, explicit synthetic origin, and no raw event/session/case/user identifiers or absolute host path.

---

## 2026-07-20 - Studio interface redesigned as a guided evidence pipeline

**Scope**

- Redesigned the Studio shell and all five surfaces around a visible Map → Observe → Detect → Review → Audit journey with honestly locked stages, a persistent pipeline rail, and a next-action pointer.
- Consolidated the repeated synthetic/provenance banners into one topbar trust label plus a provenance disclosure; hashes and versions stay reachable on every surface without dominating it.
- Product Map gained client-side search, layer filters, and per-node relationship exploration over the existing 144-node/180-edge manifest; Workflow Explorer gained genuinely interactive variant selection with explicit backtracking visualization; the Opportunity Feed leads with "3 of 5 captured cases crossed the backtracking threshold, producing 17 revisits"; Evolution Review and Receipts render educational locked previews using conditional language only.
- Raised the type scale (body 14–16px, metadata ≥12px) and reworked colors for WCAG AA contrast; no fixture, snapshot, scanner, or contract data changed.

**How Codex accelerated the work**

- Codex was not used for this interface pass; it was implemented and browser-verified by Claude (Fable 5). Verification: Studio tests 9/9, typecheck, production build, and browser review of all five routes at 1280×720 and 390×844 against both the captured snapshot and the fixture fallback. After-screenshots: `docs/ui-audit/fable-2026-07-20/after-*.png`.

**How GPT-5.6 was used**

- Not used. The interface continues to state that no GPT-5.6 interpretation exists for the captured snapshot.

**Human decisions**

- The locked Review and Audit stages remain locked and explain their missing prerequisites instead of simulating progress.

**Evidence**

- Unchanged snapshot facts rendered by the new interface: 144 nodes, 180 edges, five cases, five variants, 224 events, one backtracking detection (3 affected cases, threshold 3, 17 revisits, ratio 0.6, confidence 0.74).

---

## 2026-07-20 - Codex hardened the redesigned Studio

**Scope**

- Audited the Fable implementation and kept its visual direction while fixing five correctness and navigation gaps.
- Derived locked Review and Audit states from actual snapshot evidence, including the valid case where analysis completes without a detected opportunity.
- Centralized route-safe application URLs so contract-valid IDs containing slashes, colons, or dot segments remain one reversible Next.js route segment.
- Preserved workflow node identity through the Studio bridge so duplicate display labels cannot fabricate backtracking.
- Replaced the persistent "Up next" self-link with a route-aware current-focus card and separated total manifest counts from explorable product capabilities.
- Added regression coverage for no-opportunity snapshots, route encoding and Next route matching, duplicate workflow labels, self-link suppression, and map scope copy.

**How Codex accelerated the work**

- Reviewed the redesigned implementation for evidence truthfulness, routing safety, and alternate valid datasets; implemented every accepted finding and verified the resulting production UI across all five Studio routes.
- Kept the Fable-authored visual system intact while making the smallest code and copy changes required for a truthful, self-explanatory judge experience.

**How GPT-5.6 was used**

- Not used for this hardening pass. The captured CRM snapshot still has no GPT-5.6 interpretation, and Studio continues to label that boundary explicitly.

**Human decisions**

- Retain the Fable visual redesign, disclose its authorship, and use Codex for the final correctness audit and implementation.
- Treat an analysis with no threshold crossing as a successful result with no proposal, not as missing or fabricated evidence.

**Evidence**

- npm run test passed repository compliance, typechecks, package tests, and integration tests.
- npm run build passed the complete package and Next.js production build.
- Final Studio verification passed 18/18 tests, strict typechecking, production build, and browser checks of Map, Workflows, Opportunities, Evolutions, and Receipts.

---

## 2026-07-20 - Add an authenticated Codex CLI path without weakening the API boundary

**Scope**

- Added an explicit `codex` / `api` provider toggle for the GPT-5.6 demo. The executable demo defaults to saved Codex CLI authentication for Build Week; the intelligence library retains its Responses API default, and neither path silently falls back.
- Isolated Codex CLI execution in a private read-only temporary workspace, pinned `gpt-5.6` with medium reasoning, ignored user/project instructions, disabled every installed host-capable feature surface, stripped credential-bearing environment variables, used ephemeral files and strict output schema, bounded streams before file reads, and rejected any surfaced item beyond reasoning and the final message.
- Kept the fixed governance instruction at developer priority rather than downgrading it into stdin, and kept API response IDs/actual models/storage requests separate from CLI thread IDs/requested model/local persistence.
- Removed unsupported `uniqueItems` keywords from the remote Structured Outputs schema while preserving local Zod uniqueness enforcement.
- Added a clean-commit, create-only sanitized proof recorder with request/schema hashes, evidence hashes/counts, local validation state, provider provenance, and token usage.

**How Codex accelerated the work**

- Checked the installed Codex CLI flags against the current OpenAI Codex manual, implemented the transport and provider switch, added adversarial role/tool/provenance tests, and reconciled README, architecture, security, and submission evidence.

**How GPT-5.6 was used**

- No product-runtime GPT-5.6 claim is made in this implementation entry. The live proof is intentionally a separate, explicit command run only after this code is committed and the worktree is clean.

**Human decisions**

- Use the already authenticated Codex CLI now and preserve the API-key path for later deployment.
- Require an explicit provider choice with no fallback and keep provider-specific provenance conservative.

**Evidence**

- Intelligence typecheck passed.
- Intelligence tests passed 35/35.
- Integration tests passed 18/18.
- The real GPT-5.6 proof artifact remains pending until the clean-commit run.

---

## 2026-07-20 - Correct the authenticated Codex model to GPT-5.6 Terra

**Scope**

- Ran the first proof attempt from clean commit `b303fa28d223fee06106f48b9a69bc2539909f96`. The authenticated Codex service rejected bare `gpt-5.6` for a ChatGPT-account login, so the command exited without creating a proof artifact and did not fall back to the API.
- Confirmed that the account's current Codex catalog exposes GPT-5.6 variants and that a minimal isolated `gpt-5.6-terra` invocation completed successfully.
- Kept the shared boundary request at `gpt-5.6` for the later Responses API path, mapped only the Codex transport to `gpt-5.6-terra`, and added separate boundary-model and transport-model provenance.
- Bumped the not-yet-materialized proof format to `living.gpt56-proof/v2` and added fail-closed provider/model agreement tests.

**How Codex accelerated the work**

- Exposed the authoritative account/model rejection, confirmed the supported Terra route, and enabled a targeted transport correction without weakening the API toggle or local evidence validation.

**How GPT-5.6 was used**

- GPT-5.6 Terra completed only a minimal compatibility response in this correction step. No product-runtime interpretation or proof artifact is claimed yet.

**Human decisions**

- Use the exact authenticated GPT-5.6 Terra model through Codex now and retain bare `gpt-5.6` for the explicit API-key path later.
- Preserve the rejected attempt in the audit trail and claim the CLI model only as requested/pinned, because Codex JSONL does not authoritatively report an actual response-model field.

**Evidence**

- Bare `gpt-5.6` returned a provider-level unsupported-model error through authenticated Codex.
- `gpt-5.6-terra` completed through the same authenticated CLI.
- The failed proof attempt created no `docs/proof/gpt56-live-codex-cli.json` file.
- Repository-wide `npm run test` passed, including 37/37 intelligence tests and 18/18 integration tests.
- `npm run build` passed the complete package and Next.js production build.

---

## 2026-07-20 - Preserve a real GPT-5.6 Terra evolution brief

**Scope**

- Ran `npm run proof:gpt56:cli` from clean source commit `4c1480f220fb88283a63e160d9dc6da8c6fa82d5` with saved Codex authentication and no API fallback.
- Sent the verified, bounded projection of 24 synthetic neutral events across three sessions and three subjects to the exact `gpt-5.6-terra` transport model.
- Locally revalidated the returned `living.evolution-brief/v1` schema, evidence citations, product-node references, synthetic-only scope, draft status, and `activationAllowed: false` before writing the create-only proof.
- Scanned the artifact for credentials, authorization material, absolute user paths, and session/actor/subject identifiers.

**How Codex accelerated the work**

- Codex CLI provided the authenticated structured-output transport and emitted the thread/token provenance used by the proof recorder.

**How GPT-5.6 was used**

- GPT-5.6 Terra materially interpreted the bounded workflow evidence and drafted an information-surface hypothesis with cited metrics, risks, open questions, limitations, and success criteria.
- The model did not approve, activate, mutate, browse, inspect the host, or receive host tools. Its draft remains subject to human review.

**Human decisions**

- Preserve the model output as a hypothesis rather than merge it into the captured Studio snapshot or claim automatic-host model ingestion.
- Report `gpt-5.6-terra` as requested/pinned and leave `actualResponseModel` null because Codex JSONL did not authoritatively report that field.

**Evidence**

- Artifact: `docs/proof/gpt56-live-codex-cli.json`.
- Artifact SHA-256: `c1f69d30cd2ce099d3d968631aa0784c29f9ea911fd5dc1e164a78f23058c819`.
- Recorded at `2026-07-20T10:46:25.677Z`; Codex thread `019f7f22-10bd-7fb3-8b05-96ba401b1df3`.
- Boundary request hash `sha256:107474a1fc8c7eb67031a551274db0bd931a100ffde733e0b78a4dbd29845bae` and output schema hash `sha256:3a810c751a1bb36b38d57233abec5d3859d12825cf1dcf2a163a81365395ba56`.
- Token usage: 9,721 input, 797 output, and 77 reasoning-output tokens.
- Artifact privacy/provenance validation passed.

---

## 2026-07-20 - Display the preserved GPT-5.6 proof in Studio without crossing evidence boundaries

**Scope**

- Added a strict public `living.gpt56-proof/v2` contract with closed nested records, provider/model agreement, cross-record identity, citation, scope, governance, count, and alias validation.
- Added a privacy-minimized Studio projector for the committed proof. It deliberately omits raw sample event IDs and evidence-alias mappings and preserves the CLI's unreported actual-model field as `null`.
- Added a fail-closed relation across app ID, manifest hash, opportunity ID, and event-set hash. The current neutral proof differs from both the CRM capture and neutral Studio fixture, so it is shown as a separate recorded run and never populates lifecycle state.
- Added the Evolution Review evidence panel, visible requested-model and actual-model boundaries, citations, success criteria, risks, limitations, human-review state, blocked activation, and technical provenance. Added a discoverable link from Opportunity Feed.
- Corrected the exact-320px horizontal overflow and kept sidebar copy snapshot-specific.

**How Codex accelerated the work**

- Designed and implemented the proof contract, Studio projection, evidence-relation boundary, UI, regression coverage, documentation reconciliation, responsive checks, and browser walkthrough.
- Ran adversarial review that caught the need to include the event-set hash in the relation and to distinguish a requested transport model from an unreported actual response model.

**How GPT-5.6 was used**

- No new product-runtime model call was made in this slice. Studio displays the previously preserved GPT-5.6 Terra result from `docs/proof/gpt56-live-codex-cli.json` after revalidating it through the public contract.

**Human decisions**

- Show the real neutral model contribution inside Studio so judges can inspect it without credentials, while refusing to present it as CRM evidence.
- Treat relation as a display label only. Even an exact relation cannot approve, create receipts, populate `dataset.evolution`, or unlock lifecycle controls.

**Evidence**

- Repository-wide `npm run test` passed: compliance check, all workspace typechecks, 24 Studio tests at that checkpoint, 21 contracts tests, the remaining package suites, and 18 integration tests. Final exact-relation authority and relation-aware page-copy regressions bring Studio to 27/27 passing tests.
- Repository-wide `npm run build` passed, including the complete package graph and the Next.js production build for all Studio routes.
- Browser verification passed on the CRM Evolution Review and Opportunity Feed at the default desktop viewport and at 320px: no horizontal overflow, no console warnings/errors, working disclosures, working Opportunity-to-Review link, separate-run banner present, and provenance fields visible.
- `git diff --check` passed.

---

## 2026-07-20 - Add one operator-governed source-evolution path

**Scope**

- Added an exact captured-host connection beside Studio's minimized snapshot. The local broker revalidates the app, snapshot, manifest, opportunity, and event-set identities before exposing any lifecycle state or accepting a command.
- Connected the existing authenticated Codex CLI / Responses API provider toggle to captured-evidence preparation. GPT-5.6 produces a strict evidence interpretation only; it does not select the source target or return executable code.
- Added the deterministic `next-crm-lead-review-navigation/v1` adapter. Its entire source authority is one installed Next.js host file, `src/app/leads/[id]/page.tsx`, and its candidate adds Previous/Next lead-review navigation for a deterministic backtracking opportunity.
- Added prepared, approved, applied, and rolled-back lifecycle states with exact artifact/proof hashes, an operator-supplied audit label, revision checks, a hash-linked receipt trail, bounded source transactions, and exact preimage/postimage gates. The label is not authenticated identity.
- Added Studio controls that keep GPT-5.6 interpretation visibly separate from the deterministic source candidate, show a bounded diff and static proof, require exact-hash operator approval, label source application separately from runtime verification, and expose explicit rollback.
- Kept neutral fixture and unmatched committed-proof states read-only. A rolled-back state is terminal for the same evidence, and measurement-after-change remains unimplemented.

**How Codex accelerated the work**

- Codex designed and implemented the installed-host input boundary, source-evolution contracts and engine, deterministic adapter, local Studio broker, UI lifecycle, receipts, concurrency/recovery guards, tests, and documentation.
- Parallel Codex reviews audited the independent CRM seam, evidence identity, stale-snapshot behavior, approval authority, diff bounds, polling concurrency, source transaction safety, and truthful UI language.

**How GPT-5.6 was used**

- The new prepare path can use either the explicitly selected authenticated Codex CLI transport (`gpt-5.6-terra`) or Responses API transport (`gpt-5.6`) to interpret the exact bounded evidence.
- A real CRM-bound Codex CLI Prepare completed as thread `019f7fc2-e97a-74f2-8705-ea02ef4bb517`, requesting `gpt-5.6-terra` with 24,027 input tokens, 959 output tokens, and 91 reasoning-output tokens. The validated interpretation is titled “Preserve lead-list context when returning from a lead.”
- Deterministic code compiled prepared evolution `evolution.source.7f3455d8686daf440c10fcdf`, artifact `sha256:09261a230f93d5f34a53871000b902ffe2ec72aed812ed177619b57e0b334e3e`, and static proof `sha256:e215a0ae94b8cf259e339129810c8d878ca9254fb6769f3c16a9ae96e9860757`. Approval and application remain null.
- GPT-5.6 has no patch-generation, approval, apply, rollback, network, process, Git, or secret authority in this lifecycle.

**Human decisions**

- Prove one useful lead-review change instead of claiming arbitrary self-modification.
- Require an operator-supplied audit label and confirmation of the exact artifact and proof hashes before source application; do not represent the label as authenticated identity.
- Treat source application, host hot reload/rebuild, and browser runtime verification as separate facts.
- Require newly captured evidence after rollback and defer automatic post-change measurement.

**Evidence**

- Public independent host: `https://github.com/achrefbs/crm-workflow-lab.git`, tested clean revision `843331c`. Living's generated instrumentation is intentionally not committed there.
- Current gitignored synthetic-only CRM input: three cases, three variants, 135 captured events, and 18 backtracking revisits across all three cases.
- The detector now hands intelligence the exact 46-event supporting subset; a 17-event regression fixture proves that only its 15 affected events cross the boundary, while the full set and tampered counts fail before transport.
- The CRM now contains one gitignored prepared state with four hash-linked receipts and a passing deterministic proof. Its target remains the exact preimage `sha256:e37b5c1bb7fe8665fd2d4dd313859e5cfa86256d1040afd07ade3117dfb1d5ab`; no approval, source application, hot-reload verification, or rollback is claimed by this entry.
- Adversarial lifecycle verification passes 17/17 tests, including forged approval, lifecycle-pointer substitution, install drift, untrusted lock-path traversal, concurrent approval, every apply crash point, rollback crash recovery, and exact rollback. CLI passes 19/19, Studio passes 31/31 plus typecheck, the repository-wide test gate passes, and the full production build succeeds.

---

## 2026-07-20 - Compare the unchanged CRM with the exact proposed postimage

**Scope**

- Added a read-only Current vs Proposed Studio route linked from a prepared Evolution Review. It embeds the connected CRM on port 3000 beside an isolated exact-postimage server on port 3002 and displays the bound preimage, postimage, artifact, proof, and lifecycle phase.
- Added a strict `living.preview-identity/v1` handshake. The isolated process computes the target SHA-256 at request time; Studio fetches it through a loopback-only bounded broker, renders frames only when its evolution ID and postimage hash match the governed draft, and fails closed on missing or stale identity. Phase-aware copy disables the old/new view after apply or rollback.
- Added a second live guard for the connected host: Evolution status re-hashes the bounded target, and Studio hides both frames unless it still matches the prepared preimage.
- Added `preview:crm`, a committed reproducible generator that requires a clean tracked host, copies only regular Git-tracked files to a new path, writes the exact ledger postimage, and creates the runtime-hashing identity route. It refuses existing outputs and never deletes or edits the CRM.
- Explained the six-step authority chain from evidence through GPT-5.6 interpretation, deterministic compilation, static proof, exact human approval, and hash-guarded apply or rollback. The page exposes no lifecycle mutation control.
- Built the isolated preview from the public CRM clean revision and verified that its target is postimage `sha256:d9ad4fa089148098d345fc5588b0eb12b91e9c7ca94996e9392f7cb2785624af`, while the connected CRM remains preimage `sha256:e37b5c1bb7fe8665fd2d4dd313859e5cfa86256d1040afd07ade3117dfb1d5ab`.

**How Codex accelerated the work**

- Codex implemented and independently reviewed the comparison surface, lifecycle projection, navigation, responsive presentation, regression tests, exact-postimage preview, and documentation.

**How GPT-5.6 was used**

- No new model call was made. The comparison renders the existing CRM-bound GPT-5.6 Terra interpretation and the independently compiled deterministic candidate without granting the model source authority.

**Human decisions**

- Let judges inspect the exact proposed experience before approval, while keeping the real CRM unchanged until the entrant confirms the exact hashes and explicitly applies them.

**Evidence**

- Browser verification showed no lead-review navigation in the connected CRM and working Previous/Next navigation in the isolated preview. The comparison page displayed the expected draft phase and hash bindings. The generator reproduced the preview from CRM revision `843331c51ed391e1110983da6cc513d4927ef330` in a fresh output, whose production build passed and whose target matched postimage `d9ad4fa08914…`. The broker returned matching live preimage/postimage identities, both applications and the comparison returned HTTP 200, Studio passed 39/39 tests plus typecheck and production build, and the final complete repository gate passed 227/227 tests (206 product and 21 integration).

---

## Entry template

### YYYY-MM-DD - Short outcome

**Scope**

- What changed.

**How Codex accelerated the work**

- Specific tasks Codex performed.

**How GPT-5.6 was used**

- Specific contribution from GPT-5.6.

**Human decisions**

- Product, engineering, or design decisions made by the entrant.

**Evidence**

- Commit SHA, tests, screenshots, proof bundle, or session ID.
