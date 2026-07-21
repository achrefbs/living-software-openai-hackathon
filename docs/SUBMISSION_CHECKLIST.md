# Submission checklist

Deadline: **Tuesday, July 21, 2026 at 5:00 PM PT** / **Wednesday, July 22 at 02:00 Europe/Madrid**.

## Repository and provenance

- [x] Separate challenge repository created after the submission period opened.
- [x] Prior work and last pre-period commit disclosed.
- [x] MIT license added.
- [x] Public repository linked from the Devpost project.
- [x] Standalone CRM and simulator kept outside the challenge dependency graph.
- [x] README distinguishes the implemented generic GPT-authored lifecycle from runtime verification, post-change measurement, and future platform support.
- [ ] Historical fresh-clone verification exists for the committed no-build judge distribution; rerun it from the exact final commit after the Live Run documentation and distribution are committed.
- [x] Windows 11 / Node.js 22-or-newer judge instructions reconfirmed with Node.js 24.14.1 and npm 11.11.0; no additional platform is claimed.
- [x] Judge path that does not require rebuilding from scratch implemented with committed package JavaScript and npm run judge:neutral.

## Product verification

- [x] `npm install` / locked fresh-clone `npm ci`
- [x] `npm run build:cli`
- [x] `npm run living -- map --fixture samples/neutral-host/host-fixture.json`
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run demo:neutral`
- [x] `npm run dev:studio`
- [x] `npm run studio:live -- --root <supported-host> --host-url <loopback-url> --port 3001`
- [x] Current automatic support is scoped to TypeScript Next.js App Router 15.3+ repositories using `src/app`.
- [x] `map --root` is read-only; `init --root` and `uninstall --root` are dry-run by default and require explicit `--apply`.
- [x] Create-only artifacts, hash journal, evidence path, and modified-file preservation are documented.
- [x] Generated observer and collector code is self-contained and installation does not edit the host `package.json`.
- [x] Normal observation excludes text, input values, keystrokes, query strings and hashes, DOM or HTML, cookies, headers, request bodies, screenshots, and persistent user/cross-tab identifiers.
- [x] Independent supported-host installation, runtime capture, privacy, and byte-preserving removal proof completed.
- [x] Neutral sample data is explicitly synthetic.
- [x] Studio distinguishes neutral/unmatched read-only views from an exactly bound captured-host connection; its loopback-only development broker and the CLI use the same governed lifecycle, and Current vs Proposed remains display-only.
- [x] Connected Live Run uses a server-supplied canonical root, strict durable events, replay/SSE reconnect, safe active-release evidence tailing, behavior-matrix and diagnostic progress, real model/proof milestones, serialized exact lifecycle commands, and separate source/runtime facts.
- [x] The generic preview generator copies a bounded stable Git-tracked snapshot into new paths, verifies the exact target preimage, seals before/proposed identity endpoints, and never edits the connected host.
- [x] Strict proof validation, mismatch handling, privacy-minimized proof projection, and non-rendering of raw event IDs and evidence aliases are tested.
- [x] Real GPT-5.6 Terra run completed through authenticated Codex and reproducible sanitized evidence saved.
- [x] The fixed CRM navigation adapter is removed from the active engine; offline tests accept materially different GPT-authored proposals and source targets.
- [x] Product-context truncation is evidence-first, retains direct graph neighbors before lexical fill, and rejects model-cited affected nodes outside that relevant set.
- [x] Legacy repeated-sequence, correction, dead/rage-click, and corroborated-backtracking diagnostics retain threshold and negative-control regression coverage, but do not gate AI-first discovery.
- [ ] Final exact-commit verification confirms `analyze` builds the full privacy-safe event/metric matrix and `improve` passes all verified events plus all current metrics to GPT-5.6 without a fixed detector gate.
- [x] A live generic GPT-authored proposal was exact-hash approved, applied, CRM-tested/built, and browser-verified.
- [x] Historical adversarial detector-era runs exercised correction and interaction-failure evidence through two different GPT-authored targets, CRM tests/builds, browser verification, and exact rollback; they are labeled historical.
- [ ] The live generic path is reproduced or preserved from the exact final submission commit.
- [ ] Final acceptance walkthrough uses one Living terminal plus the CRM: install/map, representative unscripted behavior, matrix-ready `analyze`, a real variable GPT proposal, the printed exact-hash approve/apply command, visible CRM inspection, the printed rollback, and visible restoration.
- [x] Exact rollback restored the target byte-for-byte to its sealed preimage; `rolled-back` state, nine-receipt chain, and healthy CRM integration were verified.
- [x] Connected Evolution Review explains the automatic/manual trigger boundary and hides unrelated neutral proof during the active decision flow.
- [ ] Every final claim tied to the submission commit.

## Codex and GPT-5.6 evidence

- [x] Codex collaboration is documented chronologically.
- [x] Both GPT-5.6 runtime roles use strict structured outputs and offline transport/validation tests.
- [ ] The full verified event/metric matrix is wired into explicit Codex CLI and Responses API providers with local identity/reference validation and no automatic fallback.
- [x] An authenticated GPT-5.6 Terra interpretation run is preserved as historical transport evidence; it is not claimed as proof of the current generic patch/apply path.
- [ ] Real `/feedback` Session ID from the task containing the majority of core functionality recorded.
- [ ] Key entrant product, engineering, and design decisions finalized.

## Devpost project

- [ ] Title, tagline, and entrant-edited description are final and match demonstrated behavior.
- [ ] Exactly one allowed category selected.
- [ ] Submitter type and eligible country selected by the entrant.
- [ ] Built-with technologies are accurate.
- [x] Repository link is present.
- [ ] Developer-tool installation, verified platform, no-rebuild judge path, and free judge access are final.

## Demo video

- [ ] Public YouTube video is under three minutes.
- [ ] Video shows the terminal lifecycle and CRM: install/map, representative unscripted behavior, matrix-ready `analyze`, a real variable GPT proposal in `prepared`, the printed exact-hash approve/apply command, the applied UI, the printed rollback, and the restored original UI without implying automatic measurement.
- [ ] Audio explains what was built and how Codex and GPT-5.6 were used.
- [ ] No unlicensed media, private data, or unsupported product claims appear.
- [ ] Link works without login.

## Final submission

- [x] Latest Devpost announcements and requirements rechecked.
- [ ] `npm run submit:check` passes.
- [ ] Team members, if any, have joined and accepted before the deadline.
- [ ] Free judge access remains available through at least August 12, 2026.
- [ ] OpenAI Build Week status is **Submitted**; a published standalone project page is not sufficient.
