# Independent plan review: Claude Fable 5

**Date:** 2026-07-19
**Reviewer:** Claude Fable 5, run through Claude Code as an independent external review
**Input:** [`EXTERNAL_REVIEW_PACKET.md`](EXTERNAL_REVIEW_PACKET.md) plus the full repository documentation set, including [`INDEPENDENT_REVIEW_GPT56_TERRA.md`](INDEPENDENT_REVIEW_GPT56_TERRA.md)
**Scope:** Product, architecture, security, feasibility, judging, and first milestone
**Note:** This is an AI critique, not an accepted product decision or a human security audit. Where it agrees or disagrees with the Terra review, it says so explicitly.

## 1. Verdict

**Proceed with changes.** The thesis is sound, the compliance and provenance layer is genuinely excellent (the strongest I have seen in a hackathon repository), and the governed loop is differentiated. But as of today `src/` is empty and roughly 30–36 working hours remain before the July 21, 5:00 PM PT deadline (02:00 July 22 in Madrid). The packet as written — three named surfaces, three maps, a studio, a kit, an engine — is a two-week plan. It survives only as: one host, one screen, one capability, one lifecycle, fixture-driven, receipts everywhere. I concur with Terra's verdict and most of its cuts; I differ on what the fatal assumption is, on sequencing the host UI, and I add a falsifiability test Terra missed.

## 2. One-sentence product definition

Living Software is a developer tool that turns observed, consented evidence of repeated workflow friction in a host application into one contract-bounded, machine-proven, human-approved, and instantly reversible new capability.

## 3. Strongest part

The negative proof: an unsafe candidate blocked by a **named** deterministic gate, then a repaired candidate passing **without the policy being weakened**. Detection, interpretation, and generation all exist elsewhere; "the system refused its own AI's work and kept the receipt" is the thesis in one motion and the demo beat no other entrant will have. Protect it above live generation, above the map, above the dashboard. Immediately behind it: the receipts chain (evidence → contract hash → artifact hash → gate results → approval → rollback), which is what makes everything else believable.

## 4. Fatal assumption

**That the full nine-proof loop plus maps plus a studio fits in the working hours that remain.** The most likely death is not a wrong idea; it is arriving at T-6h with six 80%-complete subsystems, no coherent demo, and no video. Terra named the sandbox overclaim as fatal; I rank that second, because an overclaim is fixable with narrower words and a narrower ABI — time is not fixable with wording. The corollary assumption to kill now: that breadth (maps, studio, kit packaging) adds credibility. Judges will interrogate exactly two things — *was the friction really detected* and *was the code really generated and governed* — and every hour spent on breadth is taken from those two answers. Mitigations: adopt the cut list today, enforce the H+8 go/no-go, and pre-authorize the fallback ladder (question 2 in section 14).

## 5. Contradictions

1. **Baseline workflow vs. friction.** As scripted, the six-step Founder Inbox baseline is the *intended* workflow. Repetition of intended work is not friction, and the packet's own detector categories (loops, backtracking, re-entry) demand a detour. Concur with Terra, but rather than leave it as an open question: make the canonical fixture a **re-entry detour** — while qualifying, the user bounces between message and history two or three times mid-note, then creates a follow-up that re-enters data already typed. It is mechanically detectable, visibly annoying, and its cost is countable in steps.
2. **"Installable learning layer that maps an application"** vs. one repo-local Next.js host with a mostly declared manifest. This is the single most overreaching claim in the packet. Fix the words everywhere public: "a governed capability lifecycle demonstrated in one Next.js host."
3. **"Isolated extension runtime"** (SECURITY.md: "isolated, resource-bounded environment") vs. a TypeScript module running in the host process. No honest isolation ships by Tuesday. Claim "constrained ABI, policy-checked, human-reviewed" — never "sandboxed" or "isolated."
4. **Local-first / no credentials** vs. a live GPT-5.6 call in the loop. Judges may have no API key. The cached, clearly labeled receipt must be the *default* runnable path; the live call sits behind an env var; one saved live receipt proves material GPT-5.6 use.
5. **Section 4's "install an extension *or* merge a reviewed change"** leaves the core mechanism undecided two days out, while the must-demonstrate list presumes runtime install. Decide now: registry install. Drop the PR path — the artifact is a file on disk and therefore diffable, so the PR-shaped evidence comes free.
6. **PRODUCT_MAP's build order defers the host UI to step 5**, but its own "working product test" (before → install → appears → use → rollback → disappears) requires a visible host from the start. The skeleton must include the thin host from hour one, or the project looks like a plugin framework — the exact risk Option A names.
7. **Measurement is simulation.** With fixtures, the "after" measurement replays the improved path over the same synthetic cases. Show it and label it "simulated on the same cases"; presented unlabeled, it reads as circular.
8. **Three named surfaces vs. judge comprehension in seconds.** Living Kit / Evolution Studio / Evolution Engine is internal vocabulary. One product name in the demo; internal names live in docs only.
9. **Map ambition vs. map reality.** The packet lists routes, screens, actions, endpoints, entities, jobs, integrations, tests, permissions, and extension points; the hackathon reality is a dozen routes and actions. Call it a manifest and label each node's provenance (scanned vs. declared).

## 6. Cut list

- The workflow **graph visualization** — replace with a sequence table with counts and durations. (This is my answer to "which must-have item should be cut immediately.")
- The Software Map beyond a generated `manifest.json` (routes, actions, schema names, source paths, provenance labels) rendered as a list.
- The framework-adapter abstraction and the general "extension runtime" concept — one registry, one slot, one broker.
- `npx living-software init` and any npm packaging — workspace packages in one monorepo.
- SQLite — JSONL fixtures plus an append-only receipts log. This also removes native-module build risk on judge machines.
- The full Evolution Studio — one decision-room screen plus a receipt view.
- The pull-request generation path (see contradiction 5).
- Live code generation during the video — recorded, receipted generation, plus an optional live re-run command for judges with keys.
- Multiple opportunity types or capabilities; the canvas vocabulary (evolution budgets, fossil record, negative capabilities) as demo concepts — keep prohibitions and receipts, drop the branding.
- Hosted deployment unless everything else is done. Mild dissent from Terra: the fresh-clone path is the *required* Developer Tools path; hosted is a stretch goal, not a deliverable.

## 7. Missing requirements

1. **A falsifiability fixture.** Commit a second fixture set with a different (or absent) friction pattern that produces a different (or no) opportunity, switchable with one command. This is the strongest possible answer to "was detection real or scripted": a judge can edit the fixture and watch the outcome change. Neither the packet nor Terra has this.
2. **The contract-as-firewall rule.** Codex's generation prompt is templated *exclusively* from the schema-validated contract object; GPT-5.6's free prose never reaches Codex. Evidence packages contain only enums, ids, counts, and durations — no free text. That single rule is the prompt-injection story.
3. **A planned primary Codex `/feedback` session.** The rules require the session ID from the task where the majority of core functionality was built. Structure the core build deliberately as one substantial session; do not fragment across twenty small sessions and scramble for an ID later.
4. **A baseline-absence beat.** In the demo's first 20 seconds: grep the baseline source for the capability id (zero hits) and show the UI location without the button. Three seconds of footage; disarms "it was feature-flagged."
5. **A cross-platform fresh-clone test.** The repo is developed on Windows; judges may be on macOS. Zero native dependencies, then verify a fresh clone on a second OS or clean environment.
6. **A reserved recording-and-submission block.** Video, Devpost form, incognito link check, and confirming the status is **Submitted** (not merely published) need at least four protected hours. The deadline is 02:00 Wednesday in Madrid; do not plan to be building at 01:00.
7. **Run the judged demo under `next dev`.** Dynamically importing a generated artifact through a production bundle is where hours die. In dev, installation = write the artifact file to a fixed path + flip the registry JSON, and hot reload makes it visibly appear. Document the choice; it is honest and sufficient.
8. **Display-only rendering of model output.** The decision room renders GPT-5.6 prose and receipt contents as text — never interpolated into markup, never executed, never fed onward unvalidated.

## 8. Recommended architecture

```text
apps/founder-inbox   one Next.js app: host route group + /decision-room route group
packages/kit         typed event SDK, collector (zod allowlist that rejects
                     undeclared fields), JSONL fixtures + replay CLI
packages/engine      deterministic detector (documented thresholds),
                     contract schema + compiler, proof runner + named gates,
                     receipts (hash-chained, append-only)
packages/registry    capability registry, broker (typed effect API),
                     install / disable / rollback
samples/             fixture set A (friction), fixture set B (falsifiability),
                     cached GPT-5.6 receipt, the unsafe candidate
```

Deterministic and never model-owned: replay, detector thresholds, contract validation, the permission model, effect capture, all gates, the approval transition, registry state, install/disable/rollback, measurement, and receipts/hashes.

Exactly two model surfaces: GPT-5.6 turns the evidence package into a hypothesis and contract draft (strict JSON schema out, cached receipt committed); Codex turns the approved contract into the artifact (one receipted session).

Artifact ABI — this answers Terra's question 2 so it does not need to go to the owner: keep **generated TypeScript**, because "Codex wrote code" must be visibly true for the Technological Implementation criterion, but constrain it to a manifest JSON plus one pure module with zero imports, effects only through a broker parameter, verified by an AST scan and by effect capture during proof runs. The named gate that blocks the unsafe candidate should be an undeclared-effect gate (for example `undeclared-effect: sendMessage`), which is more meaningful than a contrived syntax violation.

## 9. Recommended build order

Assume roughly 30 working hours. Anchor: **submit by 22:00 Tuesday, Madrid time** — four hours before the deadline. Cut from the commodity end (live model calls), never from governance (gates, approval, rollback, receipts).

1. **H0–H2 — Scaffold.** npm-workspace monorepo, Next.js app, empty packages, `npm run check` still green, no native deps.
2. **H2–H8 — Walking skeleton with the host visible** (details in section 10). Thin Founder Inbox, capability slot, lifecycle state machine, registry, hand-authored safe and unsafe artifacts, named-gate block, install/use/disable/rollback, reset, receipts.
3. **Gate 1 (H8, go/no-go):** if the skeleton does not pass cold, cut model integration and map depth immediately and continue down the ladder below.
4. **H8–H12 — Evidence.** Typed event SDK, collector allowlist (reject one non-allowlisted field in a test), fixture sets A and B, replay CLI, detector with documented threshold emitting one opportunity with evidence references and baseline cost.
5. **H12–H16 — Decision room.** One screen, left to right: evidence summary → hypothesis → contract → proof results → approve → measured delta → rollback. This is the Design-criterion artifact; make this one screen coherent instead of five rough ones.
6. **H16–H20 — Contract and proof.** Contract schema and compiler, proof runner with named gates (schema, AST policy, effect capture, acceptance tests derived from the contract, replay comparison). Unsafe candidate blocked by a named gate; repaired candidate passes with the policy untouched.
7. **Gate 2 (H20):** if gates are not real, engage fallback C now.
8. **H20–H26 — Model integration.** GPT-5.6 structured interpretation (live once, receipt saved, cached copy committed, cached is the default path). Then the **primary Codex session**: contract in, artifact out, within the ABI — capture the `/feedback` session ID and the full receipt bundle (prompt, contract hash, artifact hash, gate results).
9. **Gate 3 (H26):** if generation is not real, ship fallback B with honest labeling.
10. **H26–H30 — Judge path.** `npm run judge`: reset → replay → detect → interpret (cached) → prove → approve → install → measure → rollback, keyless, one command. Fresh-clone test on a second environment. README judge instructions, BUILD_LOG entries, fixture-B demonstration.
11. **H30–H34 — Record and submit.** Re-record against the submission commit, verify the YouTube link in incognito, complete Devpost, confirm status **Submitted**.

**Pre-authorized fallback ladder** (the answer to "what narrower fallback preserves the thesis"):

- **A.** Full loop, generation receipted from a real prior Codex session, cached GPT-5.6 default.
- **B.** Same, but generation happened once offline; demo shows the receipt bundle and diff, labeled "generated by Codex in session X."
- **C.** Hand-authored artifact honestly labeled as such, with real detector, real gates, real approval, real install/rollback, cached GPT-5.6 interpretation. The thesis survives C. It does not survive cutting the blocked candidate or rollback.

## 10. First eight-hour milestone

I differ from Terra here: exclude the detector from the first eight hours and include the host UI from hour one. The milestone must prove the highest-risk, least-conventional subsystem — the governed lifecycle, visibly, in a real host — not conventional data processing. If the skeleton lands early, pull replay forward.

**Inputs**

- Thin Founder Inbox: lead list and lead detail (message, history, note, stage, follow-up) with a declared capability slot and no qualify shortcut.
- Lifecycle definition: `proposed → contracted → generated → proven → approved → installed → disabled → rolled-back`, with legal-transition table.
- One hand-authored safe artifact (manifest + pure module) and one unsafe artifact that attempts an undeclared broker effect.
- Registry JSON, receipts JSONL, reset script.

**Outputs**

- `npm run demo:walk` drives the safe artifact through every lifecycle state, writing an append-only receipt per transition.
- The unsafe artifact fails the named `undeclared-effect` gate and cannot reach approval even when requested.
- Installation visibly adds the capability to the lead detail; disable and rollback visibly remove it.

**Acceptance tests**

1. Fresh reset yields the baseline: grep for the capability id in host source returns zero hits and the UI shows no shortcut.
2. Every illegal state transition is rejected (unit-tested), including approve-before-proven and install-before-approved.
3. The unsafe artifact cannot be installed by any sequence of commands.
4. The safe artifact installs only after an explicit approval action, and using it produces the draft output.
5. Rollback restores byte-identical baseline state files while prior receipts remain readable and hash-consistent.
6. One command runs all of this with no network access and no API key.

## 11. Demo critique

A judge will understand within a minute: *the app saw a repeated workaround, proposed a bounded improvement, an unsafe version was blocked, a human installed the safe one, and it was rolled back.* That is strong Developer Tools material, and DEMO_PLAN.md's structure and closing line are good.

What a judge will doubt, and the answer to stage:

- *"The detector was scripted."* → Show the threshold firing over fixture A, then flip to fixture B and show a different (or no) opportunity. Offer in the README: edit the fixture, the outcome changes.
- *"The capability was pre-built and feature-flagged."* → The baseline-absence beat (grep + UI), then the receipt timeline: evidence hash → contract hash → artifact hash → gate results → approval → install.
- *"The AI rubber-stamps itself."* → Show the human **correcting one field** of the GPT-5.6 hypothesis before it is compiled into the contract. A visible correction proves confirm-or-correct is real. Add this beat; it is missing from the current plan.
- *"Proof is just unit tests."* → The named-gate block of the unsafe candidate, and the repaired candidate passing without the policy changing.

Specific fixes to the current cut: 0:20–0:50 is the densest segment and will not land in 30 seconds — steal 10 seconds from the Codex segment by showing the contract and gate results instead of a scrolling diff (diffs are unreadable in video; flash the diff, dwell on the contract). Say the double-contribution line out loud, because it satisfies the audio requirement in one sentence: *"Codex built this tool — and inside it, the tool drives Codex under a contract it cannot escape."* Label the cached GPT-5.6 response on screen when it appears.

What a judge will dismiss: the three-map vocabulary, the three surface names, and any architecture lecture. Spend zero of the 180 seconds on them.

## 12. Risk table

| Risk | Severity | Evidence that retires it | Mitigation | Blocks build? |
| --- | --- | --- | --- | --- |
| Scope exceeds ~30 working hours | Critical | H+8 skeleton passes cold | Cut list today; three go/no-go gates; fallback ladder | Yes |
| Demo reads as canned | Critical | Baseline-absence beat; receipts chain; fixture-B falsifiability; live re-run command | Provenance visible end to end | Yes |
| "Isolated/sandboxed" overclaim | Critical for credibility | Enforceable narrow ABI | Pure zero-import module + broker + AST scan; claim "constrained, policy-checked" | Yes, if claim kept |
| Detector circularity on authored fixtures | High | Fixture B; documented threshold; judge-editable fixtures | Falsifiability test; label fixtures as simulating months of usage | Yes |
| Model or key failure at judging | High | Cached receipts; keyless default path | Judge mode; one saved live receipt | No |
| Injection via evidence → prompt → codegen chain | Medium (synthetic demo) / High (product claim) | Enum-only evidence; contract-as-firewall; display-only rendering | Structured schemas at both model boundaries | No |
| Judge cannot run it (platform) | High | Fresh clone on a second OS | Zero native deps; JSONL; Node-only | Yes (cheap) |
| Video/submission logistics slip | High | Reserved 4h block; submit by 22:00 Madrid Tuesday; status **Submitted** | Schedule now; DEMO_PLAN timing fix | Yes |
| Prior-work eligibility doubt | Low | Existing disclosures are strong | Maintain boundary; log this review in BUILD_LOG | No |

## 13. Decision table

| Proposal | Decision | Note |
| --- | --- | --- |
| Installable kit + reference CRM as product boundary | Change | One repo-local host; kit-shaped workspace packages; claim one stack only |
| Three-map model | Accept as narrative only | Build a manifest list, a sequence table, one opportunity card |
| Surface names (Kit/Studio/Engine) | Change | One product name in the demo |
| Option C walking skeleton | Accept, modified | Host visible from hour one; lifecycle is the first real subsystem |
| Runtime extension installation | Accept, narrowed | Registry + broker under `next dev`; no isolation claim |
| Pull-request path | Reject for deadline | Artifact file is diffable anyway; PR is a post-hackathon compatibility path |
| SQLite persistence | Reject | JSONL fixtures + append-only receipts |
| `npx` init package | Reject | Repository-local initializer |
| Full Evolution Studio | Reject | One decision-room screen + receipt view |
| Live generation in the video | Reject | Receipted generation; optional live judge command |
| Live GPT-5.6 interpretation | Change | Cached default, live behind env key, one saved live receipt |
| Workflow graph visualization | Change | Sequence table with counts and durations |
| Static scanning beyond a narrow map | Reject | Tiny route/action scanner, provenance-labeled |
| Unsafe-candidate block | Accept | The crown jewel; named gate, policy unweakened |
| Before/after measurement | Accept, labeled | Simulated replay delta on the same cases |
| Baseline fixture as currently scripted | Change | Encode the re-entry detour, not the intended workflow |
| Generated-artifact form | Accept with constraint | Manifest + one pure TypeScript module, zero imports, broker-only effects |
| Hosted judge path | Defer | Fresh-clone path is the requirement; hosted only if time remains |

Mapping to the packet's twelve requested decisions: 1 → rows 1–2; 2 → row 2; 3 → contradiction 2 (worst single claim: "installable learning layer that maps an application," with "isolated runtime" second); 4 → section 11 (the 60-second core: absence → detection → corrected hypothesis → contract → blocked candidate → approve → appear → delta → rollback); 5 → cut list, first item; 6 → deterministic fixture replay + receipts (everything else hangs off it); 7 → registry runtime only; 8 → section 9; 9 → section 10; 10 → receipts chain + fixture B + live re-run offer; 11 → section 7 items 2 and 8; 12 → the fallback ladder in section 9.

## 14. Three questions for Achref

1. **Hours and hands.** How many working hours can you actually commit before 02:00 Wednesday Madrid time, and is anyone else building? If the honest answer is under 20 hours, start at fallback B tonight rather than discovering it Tuesday.
2. **Fallback pre-authorization.** If Gate 3 (Tuesday ~14:00 Madrid) arrives and generation is not demonstrably real, do the builders have your standing decision to ship fallback B or C with honest labeling — or do you want to be interrupted for that call in the moment?
3. **Demo production.** Is the video recorded against clearly labeled cached model responses (my recommendation), or do you require live calls on camera despite the reliability risk — and who narrates and records, in which reserved block on Tuesday?

(Terra's three questions: its question 1 — accept the narrow claim — is treated here as a required change, not a question; its questions 2 and 3 are answered in sections 8 and 5.1 respectively, so they need not return to the owner.)
