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
- Automatic discovery and installation currently require a TypeScript Next.js App Router 15.3+ repository using `src/app`. Universal Node or other-framework support is not claimed.
- Normal capture excludes text, form values, keystrokes, query strings/hashes, DOM/HTML, cookies, headers, screenshots, request bodies and persistent identity.
- GPT-5.6 is material in two runtime steps: it interprets an exact opportunity into a structured `EvolutionBrief`, then authors a source-patch proposal from a bounded manifest-linked source projection.
- The source projection contains at most three eligible UI files, 64 KB each and 96 KB total. The model has no host tools and can select only one supplied existing UI file with one to eight exact anchor/replacement edits.
- Living treats that patch as untrusted. Static defense-in-depth guards reject disallowed paths, multi/new-file edits, dependencies, Git, declared server/host/network/process/storage/secret/dynamic-code/raw-HTML/loader authority patterns, non-exact or overlapping anchors, changed preimages and oversized diffs. Passing those guards is not semantic proof that a patch is correct or secure.
- A passing proposal remains `prepared` and does not edit the host. A human must resupply the exact artifact and proof hashes shown during review; the engine also binds the stored contract and current receipt revision. Living's engine alone applies the exact postimage and can restore the exact preimage.
- `--provider codex` explicitly selects saved Codex authentication and `gpt-5.6-terra`; `--provider api` explicitly selects the Responses API and `gpt-5.6`. There is no automatic fallback.
- The public CRM and its simulator remain separate projects. Synthetic simulator output is a post-run oracle, never an input to Living's discovery, detector or patch prompt.
- The current synthetic CRM evidence contains three cases, 135 captured events and 18 independently detected backtracking revisits. This proves the observation/detection path for that run, not general production behavior or a predetermined fix.
- The generic patch engine contains no CRM-specific Previous/Next transform. GPT may propose any change inside the one-existing-UI-file policy.
- A July 21 authorized live run used Codex threads `019f81cc-aa13-7390-a670-268f173b3542` and `019f81cc-f009-7323-8803-4383a158587f`. GPT selected `src/app/leads/[id]/page.tsx` and authored `Leads` to `Back to leads`; Living exact-hash approved and applied artifact `sha256:c1c6408afee5b06ddad6f0ec6571576a902daf8094c7e9b30461f49e96ccb390` with proof `sha256:29e4ab3134ba2748666d43b218626bd05ee5415569808b62f6855d96bef0f866`, 13 passing checks, and eight receipts.
- The independent CRM passed 111/111 tests and its production build, and browser verification showed the applied label on `/leads/lead-04`. A preservation-aware reinstall remapped observation to the new source revision while retaining the original evolution ledger.
- Studio can display synchronized synthetic capture, the exact GPT-authored proposal, proof and receipts. Its connected mutation broker is loopback-only in development; comparison is display-only.
- Source application and runtime verification are distinct. Automatic post-change measurement is not implemented.
- Claude Fable 5 provided disclosed UI implementation assistance. Codex audited, hardened and tested the accepted work; chronology remains in [BUILD_LOG.md](BUILD_LOG.md).
- Windows 11, Node.js 22+ and npm 10+ are the verified platform family.
- The required primary Codex `/feedback` Session ID is pending.

## Material OpenAI use

Codex has been used for architecture, implementation, tests, security review, documentation and integration. GPT-5.6 runs inside the product: one request interprets the evidence and another authors the exact bounded code proposal reviewed by the operator. Strict schemas, provider provenance and local proof bind those model outputs to the governed lifecycle.

The preserved [GPT-5.6 Terra proof](docs/proof/gpt56-live-codex-cli.json) records an earlier structured interpretation run from clean commit `4c1480f220fb88283a63e160d9dc6da8c6fa82d5`. The separate [live CRM evolution record](docs/proof/gpt56-live-crm-source-evolution.md) records the July 21 generic prepare, exact-hash apply, and browser-visible runtime result. Neither artifact proves measured workflow improvement.

## Verification commands

```bash
npm install
npm run build:cli
npm run check
npm run typecheck
npm run test
npm run demo:neutral

npm run living -- install --root ../crm-workflow-lab --synthetic
# exercise the CRM
npm run living -- improve --root ../crm-workflow-lab --provider codex
npm run living -- status --root ../crm-workflow-lab
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
- Verify a fresh-clone path and the required no-rebuild judge distribution.
- Reproduce or preserve the live generic path from the exact final submission commit; the July 21 run occurred from the corrected working tree before the final documentation commit.
- Execute exact rollback and browser-verify the restored CRM; only the rollback precondition and retained preimage are currently verified.
- Do not claim a closed improvement loop until post-change capture and measurement exist.
- Record and verify the public video URL.
- Re-fetch announcements and rules immediately before submission.
- Confirm Devpost status is **Submitted**; a published project page is not sufficient.

Run `npm run submit:check` immediately before submission and reconcile every claim with the exact commit shown in the video.
