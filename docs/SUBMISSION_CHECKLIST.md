# Submission checklist

Deadline: **Tuesday, July 21, 2026 at 5:00 PM PT** / **Wednesday, July 22 at 02:00 Europe/Madrid**.

## Repository and provenance

- [x] Separate challenge repository created after the submission period opened.
- [x] Prior work and last pre-period commit disclosed.
- [x] MIT license added.
- [x] Public repository linked from the Devpost project.
- [x] Standalone CRM and simulator kept outside the challenge dependency graph.
- [x] README distinguishes the implemented generic GPT-authored lifecycle from runtime verification, post-change measurement, and future platform support.
- [ ] Fresh-clone verification completed against the exact submission commit.
- [ ] Windows 11 / Node.js 22-or-newer judge instructions reconfirmed; current Node.js 24.14.1 proof recorded and any additional platforms tested before claiming support.
- [ ] Judge path that does not require rebuilding from scratch implemented and verified.

## Product verification

- [ ] `npm install`
- [ ] `npm run build:cli`
- [ ] `npm run living -- map --fixture samples/neutral-host/host-fixture.json`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run demo:neutral`
- [ ] `npm run dev:studio`
- [x] Current automatic support is scoped to TypeScript Next.js App Router 15.3+ repositories using `src/app`.
- [x] `map --root` is read-only; `init --root` and `uninstall --root` are dry-run by default and require explicit `--apply`.
- [x] Create-only artifacts, hash journal, evidence path, and modified-file preservation are documented.
- [x] Generated observer and collector code is self-contained and installation does not edit the host `package.json`.
- [x] Normal observation excludes text, input values, keystrokes, query strings and hashes, DOM or HTML, cookies, headers, request bodies, screenshots, and persistent user/cross-tab identifiers.
- [x] Independent supported-host installation, runtime capture, privacy, and byte-preserving removal proof completed.
- [x] Neutral sample data is explicitly synthetic.
- [x] Studio distinguishes neutral/unmatched read-only views from an exactly bound captured-host connection; its loopback-only development broker and the CLI use the same governed lifecycle, and Current vs Proposed remains display-only.
- [x] Strict proof validation, mismatch handling, privacy-minimized proof projection, and non-rendering of raw event IDs and evidence aliases are tested.
- [x] Real GPT-5.6 Terra run completed through authenticated Codex and reproducible sanitized evidence saved.
- [x] The fixed CRM navigation adapter is removed from the active engine; offline tests accept materially different GPT-authored proposals and source targets.
- [x] A live generic GPT-authored proposal was exact-hash approved, applied, CRM-tested/built, and browser-verified.
- [ ] The live generic path is reproduced or preserved from the exact final submission commit.
- [ ] Exact rollback is executed and the restored CRM plus complete receipt chain are browser-verified.
- [x] Connected Evolution Review explains the automatic/manual trigger boundary and hides unrelated neutral proof during the active decision flow.
- [ ] Every final claim tied to the submission commit.

## Codex and GPT-5.6 evidence

- [x] Codex collaboration is documented chronologically.
- [x] Both GPT-5.6 runtime roles use strict structured outputs and offline transport/validation tests.
- [x] Deterministic detector evidence is wired into explicit Codex CLI and Responses API providers with local reference validation and no automatic fallback.
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
- [ ] Video shows install/observation, a live generic GPT-authored proposal, exact artifact/proof-hash approval and application, the verified CRM result, and rollback without implying continuous Studio ingestion or automatic measurement.
- [ ] Audio explains what was built and how Codex and GPT-5.6 were used.
- [ ] No unlicensed media, private data, or unsupported product claims appear.
- [ ] Link works without login.

## Final submission

- [ ] Latest Devpost announcements and requirements rechecked.
- [ ] `npm run submit:check` passes.
- [ ] Team members, if any, have joined and accepted before the deadline.
- [ ] Free judge access remains available through at least August 12, 2026.
- [ ] OpenAI Build Week status is **Submitted**; a published standalone project page is not sufficient.
