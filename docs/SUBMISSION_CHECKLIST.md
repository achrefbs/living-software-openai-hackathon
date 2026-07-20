# Submission checklist

Deadline: **Tuesday, July 21, 2026 at 5:00 PM PT** / **Wednesday, July 22 at 02:00 Europe/Madrid**.

## Repository and provenance

- [x] Separate challenge repository created after the submission period opened.
- [x] Prior work and last pre-period commit disclosed.
- [x] MIT license added.
- [x] Public repository linked from the Devpost project.
- [x] Standalone CRM and simulator kept outside the challenge dependency graph.
- [x] README distinguishes implemented automatic discovery from future lifecycle work.
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
- [x] Studio documentation distinguishes its neutral fixture fallback, explicit synthetic-only static snapshot, and lack of live host/model ingestion.
- [ ] Real GPT-5.6 Responses API run completed and reproducible evidence saved.
- [ ] Every final claim tied to the submission commit.

## Codex and GPT-5.6 evidence

- [x] Codex collaboration is documented chronologically.
- [x] GPT-5.6 package uses strict structured output and offline mock tests.
- [x] Neutral detector evidence is wired into an explicit live GPT-5.6 runner with local reference validation.
- [ ] Material live GPT-5.6 product use demonstrated; offline mocks alone are insufficient.
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
- [ ] Video shows automatic discovery/observation, the explicit static Studio snapshot, and the separate GPT-5.6 contribution without implying live ingestion or a connected governed lifecycle.
- [ ] Audio explains what was built and how Codex and GPT-5.6 were used.
- [ ] No unlicensed media, private data, or unsupported product claims appear.
- [ ] Link works without login.

## Final submission

- [ ] Latest Devpost announcements and requirements rechecked.
- [ ] `npm run submit:check` passes.
- [ ] Team members, if any, have joined and accepted before the deadline.
- [ ] Free judge access remains available through at least August 12, 2026.
- [ ] OpenAI Build Week status is **Submitted**; a published standalone project page is not sufficient.
