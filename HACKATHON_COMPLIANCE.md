# OpenAI Build Week compliance record

This record was checked against the live Devpost Hackathons plugin and official rules on **July 20, 2026**. The official rules and hackathon website remain authoritative if anything changes.

## Event status

- **Hackathon:** OpenAI Build Week
- **Devpost slug:** `openai`
- **Status:** Submissions open
- **Entrant registration:** Confirmed
- **Project page:** [Living Software](https://devpost.com/software/living-software-x69rd1), published but not submitted to the hackathon
- **Deadline:** Tuesday, July 21, 2026 at 5:00 PM PT / Wednesday, July 22 at 02:00 Europe/Madrid
- **Planned category:** Developer Tools
- **Official rules:** <https://openai.devpost.com/rules>

## Current repository evidence

- The repository is isolated from the disclosed pre-period prototype; see [PRIOR_WORK.md](PRIOR_WORK.md).
- Current Build Week code includes versioned contracts; a bounded TypeScript Next.js App Router 15.3+ scanner; dry-run-first, create-only installation and hash-guarded uninstall; automatic browser observation; a same-origin local collector; deterministic workflow and metric analysis; a neutral synthetic replay; a read-only Studio with neutral fallback and validated synthetic-only static snapshot ingestion; and a GPT-5.6 structured-draft package.
- The supported automatic adapter currently requires a TypeScript Next.js App Router repository using `src/app`. Arbitrary Node applications and other frameworks are not current claims.
- Normal capture is limited to mapped routes and actions, performance and friction signals, and bounded CSS-pixel geometry. It excludes text, input values, keystrokes, query strings and hashes, DOM or HTML, cookies, headers, screenshots, request bodies, and persistent user or cross-tab identifiers.
- The GPT-5.6 package has explicit authenticated Codex CLI and Responses API transports over one deterministic validation boundary. The current Codex path pins `gpt-5.6-terra` ([GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)); the later API path requests `gpt-5.6`. The opt-in `npm run demo:gpt56` path currently selects Codex CLI and has offline coverage plus a create-only sanitized proof recorder, but no successful live model call or saved runtime evidence is claimed yet.
- The standalone CRM and its simulator are separate projects and are not dependencies of the challenge repository. The independent proof completed supported installation, runtime capture, privacy checks, and byte-preserving removal.
- Living Studio is read-only. It can render an explicitly synced, privacy-minimized static export of synthetic captured evidence, but it does not ingest the host live or connect that evidence to the model runner or governed lifecycle.
- The Studio visual redesign used disclosed third-party technical assistance from Claude Fable 5. Codex performed the subsequent correctness audit, implemented the accepted hardening fixes, and verified the repository-wide result; see [BUILD_LOG.md](BUILD_LOG.md).
- Windows 11 with Node.js 22 or newer is the verified platform family; the current proof runtime is Node.js 24.14.1. Other operating systems remain unverified.
- The required primary Codex `/feedback` Session ID is pending.

## Required final deliverables

- A working, non-trivial project built with Codex and using GPT-5.6 materially.
- Exactly one category.
- An entrant-written project description.
- A public YouTube demo shorter than three minutes, with audio explaining the product and the use of Codex and GPT-5.6.
- A repository URL with installation, supported-platform, test, and a judge path that does not require rebuilding from scratch.
- A real `/feedback` Codex Session ID from the task where the majority of core functionality was built.
- Free test access maintained through judging.

## Verification commands

```bash
npm install
npm run build:cli
npm run living -- map --fixture samples/neutral-host/host-fixture.json
npm run typecheck
npm run test
npm run demo:neutral
npm run studio:sync -- --root <next-app>
npm run dev:studio
```

For a separate supported Next.js repository, `npm run living -- map --root <next-app>` is read-only discovery. `init --root` and `uninstall --root` are dry-run by default and require an explicit `--apply`; see [Automatic discovery and observation](docs/AUTOMATIC_DISCOVERY.md).

`npm run proof:gpt56:cli` is the current explicit live proof path using saved Codex authentication. `npm run demo:gpt56:api` is the later API-key toggle. Neither silently falls back to the other. Preserve a sanitized, validated proof before making a live-model claim.

Before submission, also run `npm run submit:check` and verify every claim against the exact submission commit.

## Open compliance gates

- Perform and preserve sanitized evidence from a real GPT-5.6 run through an allowed provider.
- Record the real primary `/feedback` Session ID.
- Verify a fresh-clone judge path and finalize supported-platform wording.
- Implement and document the required judge path that does not require rebuilding from scratch; no separate prebuilt distribution is currently claimed.
- Record the public video URL and confirm it is viewable without login.
- Re-fetch live announcements and requirements immediately before submission.
- Confirm Devpost status is **Submitted**. A published standalone project page is not sufficient.
