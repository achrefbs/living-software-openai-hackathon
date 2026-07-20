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
- Current Build Week code includes versioned contracts; a bounded TypeScript Next.js App Router 15.3+ scanner; dry-run-first, create-only installation and hash-guarded uninstall; automatic browser observation; a same-origin local collector; deterministic workflow and metric analysis; a neutral synthetic replay; Studio with read-only fixture/proof states plus a loopback-only captured-host lifecycle; a GPT-5.6 structured-interpretation package; and one deterministic exact-source adapter.
- The supported automatic adapter currently requires a TypeScript Next.js App Router repository using `src/app`. Arbitrary Node applications and other frameworks are not current claims.
- Normal capture is limited to mapped routes and actions, performance and friction signals, and bounded CSS-pixel geometry. It excludes text, input values, keystrokes, query strings and hashes, DOM or HTML, cookies, headers, screenshots, request bodies, and persistent user or cross-tab identifiers.
- The GPT-5.6 package has explicit authenticated Codex CLI and Responses API transports over one deterministic validation boundary. The current Codex path pins `gpt-5.6-terra` ([GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)); the later API path requests `gpt-5.6`. A successful create-only live proof from clean commit `4c1480f220fb88283a63e160d9dc6da8c6fa82d5` is preserved in [`docs/proof/gpt56-live-codex-cli.json`](docs/proof/gpt56-live-codex-cli.json).
- The standalone CRM and its simulator are separate projects and are not dependencies of the challenge repository. The public host is [`achrefbs/crm-workflow-lab`](https://github.com/achrefbs/crm-workflow-lab) at tested clean revision `843331c`. Generated Living instrumentation is intentionally absent from that commit and is created only by explicit `init --apply`.
- The current synthetic-only captured CRM input contains three cases, three variants, 135 captured events, and one deterministic opportunity with 18 backtracking revisits across all three cases. The exact detector-bound model subset contains 46 events; unrelated/control events remain outside the intelligence request. Its exact app, manifest, opportunity, event-set, and snapshot identities are bound in gitignored local Studio files; no real customer data is used.
- Neutral fixture and unmatched committed-proof modes remain read-only. For an exactly bound captured snapshot, the development-only loopback broker can call the operator-selected GPT-5.6 transport for interpretation, compile the independent `next-crm-lead-review-navigation/v1` adapter for `src/app/leads/[id]/page.tsx`, require exact artifact/proof hashes plus an operator label, apply only to the exact preimage, and roll back only the exact postimage. The label is audit metadata, not authenticated identity.
- GPT-5.6 does not select or generate the source patch and cannot approve or activate it. Source application is distinct from runtime verification, activation is never automatic, a rolled-back evolution is terminal for the same evidence, and measurement-after-change is not implemented. An authenticated Codex CLI Prepare completed locally as thread `019f7fc2-e97a-74f2-8705-ea02ef4bb517`, producing a passing static proof and a four-receipt prepared state. Approval and application are null, the CRM target still matches its exact preimage, and no live CRM source activation is claimed.
- Studio includes a read-only Current vs Proposed surface for the prepared CRM draft. The current frame is shown only while Studio's fresh source hash matches the governed preimage; the proposed frame points at a separate server whose runtime-computed target hash and evolution identity match the governed postimage. The committed `preview:crm` generator reproduces that isolated tree from clean Git-tracked CRM files without editing the host. Studio hides drift or mismatches, limits frames to documented loopback origins, removes form permission, and stops offering the comparison after source application. The route has no mutation controls, and neither rendering nor interacting with that preview is counted as approval, source application, or runtime activation.
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
npm run living -- init --root ../crm-workflow-lab --synthetic --apply
npm run living -- doctor --root ../crm-workflow-lab --synthetic
npm run living -- analyze --root ../crm-workflow-lab
npm run studio:sync -- --root ../crm-workflow-lab
npm run dev --workspace @living-software/studio -- --port 3001
```

For a separate supported Next.js repository, `npm run living -- map --root <next-app>` is read-only discovery. `init --root` and `uninstall --root` are dry-run by default and require an explicit `--apply`; see [Automatic discovery and observation](docs/AUTOMATIC_DISCOVERY.md). The complete two-repository path pins the public CRM to clean revision `843331c`, runs its real-browser `friction` simulator for three synthetic cases, analyzes the resulting evidence, and syncs the exact snapshot/connection pair; see [Judge path](README.md#judge-path).

`npm run proof:gpt56:cli` is the explicit live proof path using saved Codex authentication. `npm run demo:gpt56:api` is the later API-key toggle. Neither silently falls back to the other. The sanitized, validated Codex proof is preserved in [`docs/proof/gpt56-live-codex-cli.json`](docs/proof/gpt56-live-codex-cli.json).

Captured-host Evolution Review runs at `http://127.0.0.1:3001` alongside the CRM on port 3000. It requires the operator to prepare, inspect the GPT-5.6 interpretation and independent deterministic diff/static proof, confirm exact hashes, and provide an operator label before source application is enabled. The operator must verify the CRM after its normal hot reload or rebuild and then exercise exact rollback. The source-application record alone is not runtime proof.

When an isolated postimage server is available on port 3002, the read-only
comparison is at
`http://127.0.0.1:3001/apps/crm-workflow-lab/compare`. It demonstrates the
visible proposal beside the unchanged host; it is not the activation proof
required by the open compliance gate below.

Before submission, also run `npm run submit:check` and verify every claim against the exact submission commit.

## Open compliance gates

- Record the real primary `/feedback` Session ID.
- Verify a fresh-clone judge path and finalize supported-platform wording.
- Implement and document the required judge path that does not require rebuilding from scratch; no separate prebuilt distribution is currently claimed.
- Record browser-verified CRM runtime evidence for an operator-approved source apply and its exact rollback; no such live activation is claimed yet.
- Implement post-change evidence comparison before claiming a closed measurement loop.
- Record the public video URL and confirm it is viewable without login.
- Re-fetch live announcements and requirements immediately before submission.
- Confirm Devpost status is **Submitted**. A published standalone project page is not sufficient.
