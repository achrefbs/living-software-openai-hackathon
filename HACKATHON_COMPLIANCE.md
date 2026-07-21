# OpenAI Build Week compliance record

Checked against the Devpost hackathon information and official rules on **July 21, 2026**. The official [rules](https://openai.devpost.com/rules) remain authoritative.

## Event status

- **Hackathon:** OpenAI Build Week
- **Devpost slug:** `openai`
- **Status:** Submissions open
- **Entrant registration:** Confirmed
- **Project page:** [Living Software](https://devpost.com/software/living-software-x69rd1), published but not yet submitted
- **Deadline:** Tuesday, July 21, 2026 at 5:00 PM PT / Wednesday, July 22 at 02:00 Europe/Madrid
- **Category:** Developer Tools

## Current repository evidence

- Build Week work is isolated from the disclosed pre-period prototype; see [PRIOR_WORK.md](PRIOR_WORK.md).
- The repository implements bounded Next.js discovery, create-only installation, automatic browser observation, a same-origin local collector, deterministic workflow/metric/opportunity analysis, a terminal-first evolution lifecycle, Living Studio, explicit GPT-5.6 transports and exact rollback.
- `living analyze` is human-readable by default and reports actual capture totals, detector support, a readable evidence sequence, exact supporting-event counts, and explicit-signal counts; `--json` preserves the canonical machine view. Model, proof, apply, and rollback commands emit bounded progress only around real awaited operations and never expose prompts or private reasoning.
- Automatic discovery and installation currently require a TypeScript Next.js App Router 15.3+ repository using `src/app`. Universal Node or other-framework support is not claimed.
- Normal capture excludes text, form values, keystrokes, query strings/hashes, DOM/HTML, cookies, headers, screenshots, request bodies and persistent identity.
- GPT-5.6 is material in two runtime steps: it interprets an exact opportunity into a structured `EvolutionBrief`, then authors a source-patch proposal from a bounded manifest-linked source projection.
- Product context is evidence-first: evidence-linked nodes and their direct graph neighbors are retained before deterministic lexical fill, and GPT's affected-node references are restricted to that relevant set.
- The source projection contains at most three eligible UI files, 64 KB each and 96 KB total. The model has no host tools and can select only one supplied existing UI file with one to eight exact anchor/replacement edits.
- Living treats that patch as untrusted. Static defense-in-depth guards reject disallowed paths, multi/new-file edits, dependencies, Git, declared server/host/network/process/storage/secret/dynamic-code/raw-HTML/loader authority patterns, non-exact or overlapping anchors, changed preimages and oversized diffs. Passing those guards is not semantic proof that a patch is correct or secure.
- A passing proposal remains `prepared` and does not edit the host. A human must resupply the exact artifact and proof hashes shown during review; the engine also binds the stored contract and current receipt revision. Living's engine alone applies the exact postimage and can restore the exact preimage.
- `--provider codex` explicitly selects saved Codex authentication and `gpt-5.6-terra`; `--provider api` explicitly selects the Responses API and `gpt-5.6`. There is no automatic fallback.
- The public CRM and its simulator remain separate projects. Synthetic simulator output is a post-run oracle, never an input to Living's discovery, detector or patch prompt.
- The July 21 synthetic CRM evidence used by the recorded GPT evolution contains three cases, 135 captured events and 18 independently detected backtracking revisits under the then-current detector v1.1. This proves the observation/detection path for that historical run, not general production behavior or a predetermined fix.
- Current deterministic opportunity rules include generic `repeated-sequence` mining: at least two non-overlapping occurrences in each of three cases across three independent sessions. Corrections can produce `rework-loop`, dead/rage clicks can produce `failure-cluster`, and backtracking v1.2 requires per-case technical-signal or failed/abandoned corroboration. These are hypothesis triggers, not outcome claims; recurrence alone is not causal proof of friction.
- The generic patch engine contains no CRM-specific Previous/Next transform. GPT may propose any change inside the one-existing-UI-file policy.
- The [clean generic recurring-workflow proof](docs/proof/generic-recurring-workflow-discovery.md) starts from a fresh separate synthetic CRM install with 144 nodes and 180 edges. Its detector-bound snapshot is 79 events in 22 records across three sessions, with six occurrences of a learned four-step sequence, exactly 24 evidence events, and zero `metadata.signal` events. Live Codex GPT-5.6 prepared `evolution.source.v2.bd05a314a3b6e29d4971bc8e`; one exact `Back to leads` edit passed 13 checks, exact approval/application, a visible browser check, 112/112 CRM tests, and rollback to `sha256:6f39fc74f30bc132cf3ba9b2975961a911be5e7197ba536ad4f7b69b907526e5`.
- An independent second clean host contributed 68 detector-bound events in 12 records across three cases/sessions and zero explicit signals. Six `/leads` → `/tasks` occurrences produced `opportunity.repeated-sequence.bc1fd36d9f4d`; new GPT-5.6 threads selected `src/app/tasks/page.tsx` and authored a two-edit `Lead context` card. Evolution `evolution.source.v2.672622f9c94f7121dcc8217c` passed 13 checks, exact application, 112/112 CRM tests and browser inspection, then rolled back to its exact preimage with nine valid receipts. This different workflow, source target, and feature is anti-hardcoding evidence, not measured improvement.
- A later rapid-sort stress attempt is recorded only as secondary arbitration evidence: three explicit rage signals caused `failure-cluster` to win. It is not represented as generic discovery or improvement proof.
- A July 21 authorized live run used Codex threads `019f81cc-aa13-7390-a670-268f173b3542` and `019f81cc-f009-7323-8803-4383a158587f`. GPT selected `src/app/leads/[id]/page.tsx` and authored `Leads` to `Back to leads`; Living exact-hash approved and applied artifact `sha256:c1c6408afee5b06ddad6f0ec6571576a902daf8094c7e9b30461f49e96ccb390` with proof `sha256:29e4ab3134ba2748666d43b218626bd05ee5415569808b62f6855d96bef0f866` and 13 passing checks.
- The independent CRM passed 111/111 tests and its production build, and browser verification showed the applied label on `/leads/lead-04`. A later explicit rollback restored `src/app/leads/[id]/page.tsx` from the exact sealed postimage to the byte-identical preimage `sha256:e37b5c1bb7fe8665fd2d4dd313859e5cfa86256d1040afd07ade3117dfb1d5ab`. The evolution is `rolled-back` with nine valid receipts and chain head `sha256:5855158cfb287e3ffce076353283db50626e8621ec93586126c3cb6967cb882f`; Living health checks report the restored CRM integration healthy.
- A separate adversarial run rejected a below-threshold correction cohort, then produced a `rework-loop` proposal in `src/app/leads/[id]/page.tsx` and a `failure-cluster` proposal in `src/components/leads-table.tsx`. Both changes were independently authored by GPT-5.6 from bounded context, exact-hash applied, CRM-tested/built, browser-verified and byte-exact rolled back. The [stress record](docs/proof/gpt56-live-stress-evolutions.md) preserves hashes, model threads, observed behavior, defects found and explicit non-claims.
- Studio has two explicit modes. Connected Live Run receives its canonical root only at server startup, tails the exact active-release evidence chain, projects all four detector families through the shared evaluator, persists strict hash-linked events, resumes SSE after `Last-Event-ID`, reports real model/proof/lifecycle operations, and invokes the existing exact-governance functions. The older synchronized capture remains an offline fixture/regression path. Both connected frames and the mutation broker are loopback-only development surfaces; comparison is display-only.
- Live Run is not a remote control plane. The browser cannot choose a root, lifecycle events exclude prompts/reasoning/source/raw workflow values, and evidence or ledger integrity failures stop monitoring. A responding host frame is only a visual-inspection cue; it is not runtime proof.
- Source application and runtime verification are distinct. Automatic post-change measurement is not implemented.
- Claude Fable 5 provided disclosed UI implementation assistance. Codex audited, hardened and tested the accepted work; chronology remains in [BUILD_LOG.md](BUILD_LOG.md).
- Windows 11, Node.js 22+ and npm 10+ are the verified platform family.
- Final package JavaScript is committed as a platform-neutral terminal distribution. After npm ci, npm run judge:neutral runs the credential-free proof without compiling TypeScript or rebuilding Studio.
- The integrated Live Run gate passes 335 product tests plus 33 integration tests; one read-only-filesystem lifecycle test is intentionally skipped on Windows. Every workspace typecheck, `npm run build:cli`, the compliance baseline, and the Studio production build pass. The exact-commit connected browser walkthrough remains pending and is not implied by these automated results.
- A disposable fresh clone of implementation commit `2659d51e396821a6ce23a6e192850f26233f1c6c` passed `npm ci` and `npm run judge:neutral` on Windows 11 with Node.js 24.14.1 and npm 11.11.0. The committed package JavaScript was used directly; no TypeScript or Studio build ran in that judge proof.
- `npm ci` currently reports two moderate audit entries representing one transitive PostCSS advisory through stable Next.js 16.2.10. There are no high or critical entries. npm's offered automatic fix downgrades Next.js to 9.3.3 and was not applied; update to a compatible patched stable Next.js release when available.
- The required primary Codex `/feedback` Session ID is pending.

## Material OpenAI use

Codex has been used for architecture, implementation, tests, security review, documentation and integration. GPT-5.6 runs inside the product: one request interprets the evidence and another authors the exact bounded code proposal reviewed by the operator. Strict schemas, provider provenance and local proof bind those model outputs to the governed lifecycle.

The [clean generic recurring-workflow proof](docs/proof/generic-recurring-workflow-discovery.md) records the latest two-call GPT-5.6 path from mined recurrence through exact rollback. The preserved [GPT-5.6 Terra proof](docs/proof/gpt56-live-codex-cli.json) records an earlier structured interpretation run from clean commit `4c1480f220fb88283a63e160d9dc6da8c6fa82d5`. The separate [live CRM evolution record](docs/proof/gpt56-live-crm-source-evolution.md) and [live stress record](docs/proof/gpt56-live-stress-evolutions.md) preserve historical and adversarial paths. None proves measured workflow improvement.

## Verification commands

```bash
npm install
npm run build:cli
npm run check
npm run typecheck
npm run test
npm run demo:neutral
npm run judge:neutral

# terminal 1: start connected Studio before Living is installed
npm run studio:live -- --root ../crm-workflow-lab --host-url http://127.0.0.1:3000 --port 3001

# terminal 2
npm run living -- install --root ../crm-workflow-lab --synthetic
# exercise the CRM in three independent browser tabs
npm run living -- analyze --root ../crm-workflow-lab
npm run living -- improve --root ../crm-workflow-lab --provider codex
npm run living -- status --root ../crm-workflow-lab

# optional, explicit offline snapshot/fixture path
npm run studio:sync -- --root ../crm-workflow-lab
npm run dev --workspace @living-software/studio -- --port 3001
```

After reviewing the exact proposal and proof:

```bash
npm run living -- approve --root ../crm-workflow-lab --evolution <id> --actor judge-demo --artifact-hash <artifact-sha256> --proof-hash <proof-sha256> --apply
# build/reload and verify the CRM
npm run living -- rollback --root ../crm-workflow-lab --evolution <id> --actor judge-demo
```

For the API path, set `OPENAI_API_KEY` at runtime and replace `--provider codex` with `--provider api`. Never commit the key.

## Required final deliverables

- Working non-trivial project built with Codex and materially using GPT-5.6.
- Exactly one category.
- Entrant-written project description.
- Public YouTube demo under three minutes with audio explaining Codex and GPT-5.6 use.
- Repository URL with install, platform, test and a judge path that does not require rebuilding from scratch.
- Real `/feedback` Codex Session ID from the primary build task.
- Free test access through judging.

## Open compliance gates

- Record the real primary `/feedback` Session ID.
- Reproduce or preserve the live generic path from the exact final submission commit; the July 21 run occurred from the corrected working tree before the final documentation commit.
- Do not claim a closed improvement loop until post-change capture and measurement exist.
- Record and verify the public video URL.
- Re-fetch announcements and rules immediately before submission.
- Confirm Devpost status is **Submitted**; a published project page is not sufficient.

Run `npm run submit:check` immediately before submission and reconcile every claim with the exact commit shown in the video.

The latest required submission check was run after the integrated gate and fails only because 21 manual submission checklist items and the real `/feedback` Codex Session ID remain open. This repository does not claim submission readiness.
