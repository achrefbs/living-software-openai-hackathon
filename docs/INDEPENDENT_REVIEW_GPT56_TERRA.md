# Independent plan review: GPT-5.6 Terra

**Date:** 2026-07-19\
**Reviewer:** GPT-5.6 Terra, run as an independent Codex sub-review\
**Input:** [`EXTERNAL_REVIEW_PACKET.md`](EXTERNAL_REVIEW_PACKET.md)\
**Scope:** Product, architecture, security, feasibility, judging, and first milestone\
**Note:** This is an AI critique, not an accepted product decision or a human security audit.

## 1. Verdict

**Proceed with changes.** The core thesis is strong, but only if this becomes one auditable, fixture-driven capability lifecycle—not a partial process-mining, sandboxing, and code-generation platform.

## 2. One-sentence product definition

Living Software turns a declared, privacy-safe pattern of repeated workflow friction into one bounded capability proposal that a person can inspect, prove, install, and undo.

## 3. Strongest part

Preserve the governed loop—evidence → explicit contract → deterministic proof → human approval → reversible install. That is the differentiated product; the CRM, dashboard, and source map are supporting evidence.

## 4. Fatal assumption

The plan assumes it can safely execute arbitrary Codex-generated extension code in a Next.js/Node host, prove meaningful isolation, and still finish by the deadline. It cannot honestly deliver general sandboxing, resource limits, import/effect confinement, and rollback in this time. A fake “isolated extension runtime” is worse than a modest, explicit hackathon confinement model.

## 5. Contradictions

- “Local-first/no credentials” conflicts with a required live GPT-5.6 interpretation unless the no-credential cached judge path is treated as the primary runnable path and the live call is evidenced separately.
- The security model promises isolation, resource bounds, no filesystem/network/secrets, but no concrete runtime or enforcement mechanism exists. A TypeScript module in the host process is not isolated.
- The product says telemetry excludes raw message content, while the proposed `qualify-lead` capability may read message/history context. Those are different data flows and must be labeled separately.
- The baseline sequence looks like the intended qualification workflow, not a workaround. Repetition alone does not establish friction or a missing capability.
- “Installable developer kit” and a repository-local reference-host demo are different product claims. The hackathon should claim one host adapter, not a general installable kit.
- The plan says judges should not need to rebuild, yet the current judge path begins with clone/install/run. Provide both a hosted/demo path and a fresh-clone verification path.
- “Codex-generated artifact” risks being indistinguishable from a pre-authored feature toggle unless the source artifact, prompt/contract, hash, failed candidate, proof receipt, and baseline absence are visible.
- “Append-only evidence” conflicts with no stated retention, deletion, or redaction rules. Append-only must apply to synthetic demo receipts, not imply indefinite retention of future user telemetry.

## 6. Cut list

- General static analysis beyond a deliberately narrow Next.js route/action manifest.
- `npx` packaging and reusable multi-repo installation.
- SQLite, multi-user persistence, and any production-grade collector.
- Full Evolution Studio; build one decision-room screen.
- Live code generation during the three-minute demo.
- Generic runtime code sandboxing claims.
- Pull-request generation as a second path.
- Any automatic inference from raw clicks, message bodies, screenshots, or free-text notes.
- “Application map” depth beyond a small source-linked manifest.
- Multiple opportunity types or multiple generated capabilities.

## 7. Missing requirements

- A precise, deterministic definition of the observed friction: exact event sequence, threshold, cohort/window, baseline workflow cost, and why it constitutes a workaround.
- A clear demo-confinement statement: generated artifacts are restricted to a declarative extension manifest or a tiny pure transform API, with no imports/effects; this is not a general security sandbox.
- A no-key judge mode with a visibly labeled cached GPT response, plus a saved live-run receipt showing GPT-5.6 was materially used.
- A fixed capability ABI: inputs, allowed host operations, output shape, no ambient APIs, versioning, and rollback semantics.
- A proof receipt format with artifact, contract, and fixture hashes plus gate results.
- Exact reset, seed, test, and hosted-demo instructions.
- A separate privacy boundary for telemetry, model prompts, and capability runtime context.

## 8. Recommended architecture

```text
Founder Inbox (thin fixed host)
  -> typed event emitter
  -> JSONL fixture/replay store
  -> deterministic detector
  -> decision-room UI
  -> GPT evidence interpreter (live receipt + cached judge response)
  -> schema-valid capability contract
  -> constrained generated extension artifact
  -> deterministic policy/proof runner
  -> sealed approval receipt
  -> fixed host capability registry
  -> install / disable / rollback
```

Keep deterministic: event replay, opportunity threshold, contract validation, permission model, artifact hashing, proof gates, approval transition, registry, install state, rollback, and before/after measurement.

The generated artifact should use a tiny host-owned API, ideally declarative UI/action configuration plus a pure structured transformation. The fixed host owns all persistence and effects. For this deadline, explicitly say “constrained demo extension interface,” not “isolated generated-code runtime.” If generated TypeScript is executed, restrict it to a pure function with no imports and validate that mechanically; do not claim that Node's `vm` or an AST scan is a security sandbox.

## 9. Recommended build order

1. Define the one `qualify-and-schedule` capability ABI, lifecycle states, receipts, and hard policy rules.
2. Build the thin Founder Inbox baseline with no qualifying shortcut.
3. Implement registry-backed install, disable, rollback, and visible capability appearance/disappearance using one hand-authored safe artifact.
4. Add deterministic JSONL replay and one detector with documented thresholds.
5. Create the decision-room screen showing raw event summary, detector result, baseline cost, and source-map manifest.
6. Add contract schema/compiler and proof runner; prove an unsafe candidate is rejected for a concrete rule, then a safe candidate passes.
7. Generate the final constrained artifact with Codex, preserve its contract, diff, hash, and attribution in a receipt.
8. Add GPT-5.6 structured interpretation: capture one live receipt, ship a clearly marked cached response for judging.
9. Add one-command reset/test/smoke path and a hosted demo path.
10. Record the three-minute demo only after a cold-run rehearsal proves the full lifecycle.

## 10. First eight-hour milestone

Deliver one runnable, deterministic skeleton.

### Inputs

- A fixed Founder Inbox baseline containing one synthetic lead and no `Qualify Lead` shortcut.
- A versioned semantic-event schema.
- A JSONL fixture containing at least 8–12 declared repeated cases of the same workaround sequence.
- One hand-authored safe extension artifact and one deliberately unsafe artifact.
- A contract schema and an explicit policy list: no network, imports, external writes, unrelated record mutation, or undeclared host operations.

### Outputs

- `reset → replay → detect → review → approve → install → use → rollback` works locally.
- The detector emits one deterministic opportunity with a documented threshold and event evidence.
- The unsafe artifact fails a named gate; the safe artifact passes.
- Installation visibly adds exactly one capability; rollback removes it while preserving an immutable receipt.

### Acceptance tests

- Fresh reset yields baseline UI with no shortcut.
- Replaying the fixture always yields the same opportunity ID, count, and path.
- Attempting approval before all gates pass is rejected.
- The unsafe candidate cannot install.
- The safe artifact installs only after an explicit approval action.
- Rollback restores the exact baseline UI and state and leaves prior receipt hashes inspectable.
- A single command runs these checks with no API key or network dependency.

This milestone is the go/no-go point. If it is not complete after eight hours, cut model integration and source-mapping depth immediately; do not start dashboard polish.

## 11. Demo critique

A judge will quickly understand: “the app saw a repeated workaround, proposed a bounded improvement, blocked an unsafe version, and a human installed then rolled it back.” That is good Developer Tools material.

A skeptical judge will doubt whether the detector found anything rather than being scripted; whether Codex truly generated the installed artifact; whether the capability was merely feature-flagged; whether “proof” is more than unit tests; and whether an extension is actually safe.

Address that with one compact receipt or timeline: the baseline Git and source manifest says the capability is absent; fixture events and the threshold produce the opportunity; GPT structured output is visibly uncertain; the contract bounds the artifact; an unsafe candidate fails one exact rule; the safe artifact hash and diff pass; approval causes the registry transition; and rollback restores baseline. Avoid claims of autonomous discovery, universal code understanding, or production security isolation.

## 12. Risk table

| Risk | Severity | Evidence needed | Mitigation | Blocks build? |
| --- | --- | --- | --- | --- |
| Scope exceeds remaining time | Critical | Eight-hour skeleton passes cold | Cut to one capability, one screen, fixture replay | Yes |
| Generated feature looks canned | Critical | Baseline absence, generated artifact/diff/hash, failed candidate, approval receipt | Preserve end-to-end provenance visibly | Yes |
| “Safe sandbox” claim is false | Critical | Concrete enforceable boundary | Use declarative/pure ABI; narrow the claim | Yes, if claim remains |
| Detector confuses normal work with friction | High | Explicit repeated workaround and baseline-cost definition | Instrument a needless detour, reopen, or re-entry sequence rather than ordinary workflow steps | Yes |
| Live model failure or key requirement | High | Cached response and one saved live receipt | Offline-first cached judge replay | No |
| Prompt injection from customer content | High | Prompt provenance and redaction test | Never include raw user text in interpreter prompts; use structured allowlisted evidence only | No for synthetic demo; yes for broader claim |
| Capability input leaks private data | High | Separate telemetry, prompt, and runtime data policy | Use synthetic context only; minimize fields; redact or pseudonymize IDs | No for demo; blocks production claims |
| Proof runner becomes theater | High | A meaningful negative test that blocks install | Demonstrate one prohibited effect or undeclared-permission failure | Yes |
| Judge cannot run it | High | Fresh-clone and hosted smoke run | One-command reset and test, no credentials, recorded fallback | Yes |
| Prior-work eligibility doubt | Medium | Clear build log, source provenance, no copied files | Maintain disclosures and commit evidence | No, assuming boundary is honored |
| Source map overpromises understanding | Medium | Source links and confidence labels | Call it a narrow Next.js manifest | No |
| Append-only log retains sensitive data | Medium | Retention and redaction statement | Synthetic-only demo and bounded local receipts | No |

## 13. Decision table

| Major proposal | Decision | Review |
| --- | --- | --- |
| Installable kit plus Founder Inbox | Change | Demo a repository-local Next.js adapter; defer the general kit and package claim. |
| Three-map model | Accept, simplified | Use it as narrative, but show only a small source manifest, one workflow path, and one opportunity. |
| Narrow Next.js source map | Accept | Route, action, and schema manifest with source links and confidence; no general analysis. |
| Typed semantic events | Accept | Essential; require declared semantics and synthetic fixture replay. |
| Deterministic detector before GPT | Accept | Necessary to make the evidence claim credible. |
| Live GPT-5.6 in demo | Change | Capture a live receipt, ship cached no-key replay, and label it prominently. |
| Codex constrained generation | Accept, narrowed | Generate one artifact under a fixed ABI and preserve provenance; do not imply unconstrained code evolution. |
| Capability runtime hot installation | Change | Use one host-owned registry and ABI. Do not claim general runtime isolation. |
| Pull-request fallback | Reject for deadline | Use one installation mechanism. A pull request is a later compatibility path. |
| SQLite persistence | Reject | JSON fixtures plus a local append-only receipt log are sufficient. |
| Full Evolution Studio | Reject | Build one decision-room screen plus a receipt view. |
| Unsafe-candidate proof failure | Accept | Mandatory; it is the shortest proof that governance is real. |
| Before/after workflow measurement | Accept | Measure deterministic fixture steps or a time proxy and label it as simulation. |
| General privacy and security claims | Change | Make narrow synthetic-demo claims and disclose limitations. |
| Option C walking skeleton | Accept | Use it, but replace hard-coded seams or label them as fixture or demo logic before recording. |

## 14. Three questions for Achref

1. Will the product owner accept a deliberately narrow claim—“one Next.js host and one constrained extension ABI”—instead of a generic installable self-evolving platform for this submission?
2. Is the demo's required capability allowed to be a host-interpreted declarative or pure artifact, or is executable generated TypeScript a non-negotiable requirement despite the security and delivery risk?
3. What exact user workaround should be canonical in the fixture: repeated cross-page inspection and re-entry, repeated task creation after qualification, or another specific behavior with a defensible baseline cost?
