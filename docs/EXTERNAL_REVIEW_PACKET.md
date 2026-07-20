# External design review packet: Living Software

**Status:** Proposed; review gate open\
**Date:** 2026-07-19\
**Decision owner:** Achref Boularess\
**Implementation status:** No product implementation has started in this repository.

## Reviewer mandate

Review this proposal as a skeptical product lead, staff engineer, security reviewer, and hackathon judge. Do not optimize for politeness or preserve the proposal merely because work has already been invested in it. Identify the smallest credible product that can demonstrate the thesis, the fatal assumptions, and the exact implementation order.

The review must distinguish:

- what can be discovered automatically from source code;
- what requires explicit semantic instrumentation or human confirmation;
- what can be inferred from runtime evidence;
- what an AI model may propose;
- what deterministic systems and a human must authorize.

## 1. Fixed constraints

- The OpenAI Build Week submission deadline is July 21, 2026 at 5:00 PM Pacific Time.
- The planned category is **Developer Tools**.
- The project must be working, non-trivial, installable, and testable without judges rebuilding it from scratch.
- Codex and GPT-5.6 must both make material, demonstrable contributions.
- The public demo must be no longer than three minutes and explain those contributions with audio.
- The challenge repository began cleanly during the eligible period. A private pre-period research prototype exists, but no source from it has been copied into this repository.
- Only synthetic demo data may be committed.
- The first version should be local-first and should not require production credentials or real customer data.
- Claims must match runnable behavior. Planned behavior cannot be presented as implemented.

Authoritative local context:

- [`README.md`](../README.md)
- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`PRODUCT_MAP.md`](PRODUCT_MAP.md)
- [`SECURITY.md`](../SECURITY.md)
- [`PRIOR_WORK.md`](../PRIOR_WORK.md)
- [`HACKATHON_COMPLIANCE.md`](../HACKATHON_COMPLIANCE.md)

## 2. Product definition under review

> Living Software is an installable learning layer that maps an application, observes privacy-safe workflows, and turns repeated friction into evidence-backed, human-approved software improvements.

The product is **not** a CRM and is **not** an autonomous self-rewriting application. A small CRM-like application called **Founder Inbox** is the reference host used to prove that the reusable tooling works.

The initial audience is technical founders and small teams maintaining SaaS products or internal tools. Their job to be done is:

> When users repeatedly work around a missing capability, help me discover the real need and ship a safe improvement without guessing from anecdotes or surrendering control of the application.

The proposed product has three surfaces:

1. **Living Kit**: CLI, framework adapter, typed event SDK, local collector, and optional extension runtime installed in a host application.
2. **Evolution Studio**: a dashboard for the application map, workflows, opportunities, proposed changes, proof, approval, measurement, and rollback.
3. **Evolution Engine**: deterministic pattern detection, GPT-5.6 interpretation, capability-contract compilation, constrained Codex generation, and proof gates.

Names are working names and may be changed by the entrant.

## 3. The three-map model

### Software Map: what exists

A versioned, source-linked graph of supported application structure:

- routes and screens;
- UI actions and server actions;
- API endpoints;
- domain entities and schemas;
- jobs and integrations;
- tests, permissions, and declared extension points.

Each automatically discovered node should retain a source location, Git revision, adapter name, and confidence. The hackathon version may use a narrow Next.js adapter or declared configuration rather than language-general static analysis.

### Workflow Map: what people actually do

A graph derived from allowlisted semantic events such as:

```ts
living.record("lead.opened", { caseId: lead.id });
living.record("history.viewed", { caseId: lead.id });
living.record("qualification.saved", { caseId: lead.id });
living.record("followup.created", { caseId: lead.id });
living.record("lead.qualified", { caseId: lead.id, outcome: "success" });
```

Events contain pseudonymous actor, session, and case identifiers; stable action and product-surface identifiers; timestamp and duration; application version; status or outcome; and allowlisted metadata. Raw form values, message contents, keystrokes, screenshots, and request bodies are excluded by default.

A case identifier is necessary because a business workflow may cross multiple pages, sessions, or people.

### Opportunity Map: what may deserve improvement

Deterministic analysis identifies evidence patterns such as:

- repeated multi-step sequences;
- loops, retries, corrections, and backtracking;
- errors and abandonment;
- long dwell time or handoffs;
- workflow variants correlated with better or worse outcomes;
- capabilities that are installed but unused.

GPT-5.6 receives a compact evidence package plus relevant Software Map context. It returns a structured hypothesis, alternatives, uncertainty, proposed capability, acceptance criteria, success metric, and rollback expectation. A human must confirm whether the inferred workflow and problem are real.

## 4. Proposed end-to-end loop

```text
install
-> map supported application structure
-> confirm a small semantic event vocabulary
-> capture or replay privacy-safe workflow evidence
-> detect a repeated friction pattern deterministically
-> ask GPT-5.6 for an evidence-grounded hypothesis
-> ask the human to confirm or correct the interpretation
-> compile an explicit capability contract
-> ask Codex to generate within a constrained change boundary
-> run schema, permission, unit, adversarial, and workflow-replay gates
-> present evidence, diff, and proof for human approval
-> install an extension or merge a reviewed change
-> compare the before/after workflow
-> disable or roll back
```

The model may interpret and generate. It may not grant itself permissions, weaken mandatory gates, approve installation, deploy, or erase evidence.

## 5. Honest compatibility promise

| Level | Proposed capability |
| --- | --- |
| Any Git repository | Shallow source map where supported parsers exist; otherwise explicit unsupported/low-confidence results |
| Supported Next.js application with Living SDK | Source-linked Software Map plus real Workflow Map and opportunity detection |
| Host adopting the Living capability interface | Generate, prove, approve, install, disable, and roll back an isolated extension |
| Host without the capability interface | Produce a reviewable issue or pull request rather than hot installation |

The hackathon claim should be limited to one supported stack. “Install in any codebase and immediately understand everything” is explicitly rejected as technically and semantically dishonest.

## 6. Automatic versus confirmed understanding

| Information | Immediately automatic in a supported stack? | Human or developer involvement |
| --- | --- | --- |
| Routes, handlers, schemas, imports, tests | Mostly | Confirm low-confidence discoveries |
| Navigation, requests, timing, status, errors | Mostly | Approve collection and retention policy |
| Business actions such as `lead.qualified` | Suggested at best | Confirm or add typed semantic events |
| Workflow case identity across sessions | No | Declare the case entity and pseudonymous ID |
| Desired business outcome | No | Declare success or failure outcomes |
| Repeated paths, loops, delay, abandonment | Yes, after sufficient evidence | Confirm whether the pattern is actually undesirable |
| Improvement hypothesis | AI-assisted | Accept, correct, or reject |
| Code installation or deployment | No | Explicit approval after deterministic proof |

## 7. Reference-host demonstration

Founder Inbox is a deliberately small CRM-like host with synthetic leads, messages, history, qualification notes, stages, and follow-up tasks.

The baseline workflow is:

```text
open lead
-> inspect message
-> inspect sender history
-> write qualification note
-> change stage
-> create follow-up
```

Repeated synthetic cases cause the detector to surface a hypothesis: users may need a bounded **Qualify and Schedule Follow-up** capability.

The proposed capability may read only the selected synthetic lead context and write a local structured draft, stage recommendation, and follow-up draft. It may not send a message, access external accounts, invent facts, change unrelated records, or install itself.

The demo should prove:

1. The capability does not exist in the baseline source or UI.
2. Typed evidence and a deterministic detector produce the opportunity.
3. GPT-5.6 generates a structured, uncertain hypothesis and contract draft.
4. Codex generates only inside the declared boundary.
5. An unsafe candidate or prohibited effect is blocked without weakening the policy.
6. A valid candidate passes proof and is explicitly approved.
7. Installation visibly adds the capability.
8. The resulting workflow is shorter or simpler.
9. Rollback visibly removes the capability and preserves the receipt.

## 8. Proposed hackathon scope

### Must demonstrate

- one Next.js reference host;
- one install or initialization path;
- a small, source-linked application map;
- typed, privacy-safe events and deterministic fixture replay;
- one workflow graph or path visualization;
- one repeated-pattern detector;
- one live GPT-5.6 structured interpretation, with a clearly labeled cached fallback for judge reliability;
- one machine-valid capability contract;
- one constrained Codex-generated artifact;
- mandatory deterministic proof gates;
- human approval;
- visible installation, measurement, disable, and rollback;
- a one-command judge reset and test path.

### Explicitly cut

- support for multiple frameworks or arbitrary languages;
- screen, keystroke, or whole-desktop recording;
- production email or third-party account access;
- autonomous production deployment;
- unrestricted mutation of core application code;
- multi-tenant infrastructure;
- a complete CRM;
- months-long personalized model training;
- multiple generated capabilities.

### Contested scope

The reviewer should decide whether these are necessary for the hackathon demonstration or should be deferred:

- automatic static scanning beyond a small Next.js route/action/schema map;
- a reusable `npx living-software init` package versus a repository-local initializer;
- SQLite persistence versus deterministic JSON fixtures plus an append-only local log;
- runtime extension installation versus a generated Git branch/pull request;
- a full Evolution Studio versus one coherent decision-room screen;
- live code generation during the three-minute demo versus a reproducible recorded generation receipt.

## 9. Implementation-order options

### Option A: trust lifecycle first

1. Define the capability contract and lifecycle state machine.
2. Install, disable, and roll back one hand-authored extension.
3. Add the shared capability broker and proof gates.
4. Add Founder Inbox and visible capability installation.
5. Add typed evidence, detection, GPT-5.6 interpretation, and Codex generation.

**Advantage:** attacks the least conventional and highest-trust part first.\
**Risk:** the product may look like a feature-flag or plugin system before workflow intelligence is visible.

### Option B: product-intelligence first

1. Build Founder Inbox and the event vocabulary.
2. Build the Software Map, Workflow Map, and deterministic detector.
3. Add GPT-5.6 interpretation and the decision room.
4. Add contract generation, proof, installation, and rollback.

**Advantage:** quickly proves that the product can understand a real workflow.\
**Risk:** the distinctive governed-evolution loop may be incomplete at the deadline.

### Option C: walking skeleton

1. Build the thinnest hard-coded end-to-end path through all states.
2. Replace each hard-coded seam in risk order: lifecycle, events, detector, model call, generator, proof.
3. Preserve a deterministic fixture and reset path at every stage.

**Advantage:** produces a runnable vertical slice early and exposes integration risk.\
**Risk:** temporary seams can become demo theater unless every claimed behavior is replaced and evidenced.

The current preliminary recommendation is **Option C**, with the capability contract and lifecycle state machine as the first real subsystem after the skeleton exists.

## 10. Use of AI models

- Claude or another model may build ordinary reference-CRM scaffolding, critique the design, suggest tests, or review architecture.
- Codex should perform the majority of core Living Software development and the integration into the host.
- GPT-5.6 should materially interpret bounded workflow evidence and draft the capability contract.
- Every material contribution should be attributed in `BUILD_LOG.md` by model/tool, task, files, and human review.
- Model output is treated as a proposal and reviewed, tested, and understood before inclusion.

## 11. Known risks

1. **Semantic gap:** code and clicks do not reveal business intent.
2. **Cold start:** meaningful patterns normally require time and many cases.
3. **Demo authenticity:** a pre-baked feature toggle could masquerade as generated evolution.
4. **Scope:** mapping, telemetry, process mining, generation, policy, UX, and rollback are each substantial systems.
5. **Generated-code fit:** arbitrary code generation may not align with host architecture.
6. **Privacy:** workflow telemetry can become surveillance if raw content or identifiers leak.
7. **Prompt injection:** user-controlled content must not enter privileged generation prompts as instructions.
8. **Judge comprehension:** the product must be understood in seconds, not after an architecture lecture.
9. **Reliability:** live model and network calls can fail during judging.
10. **Prior-work confusion:** the new repository must not silently import the earlier private prototype.

Current mitigations include typed allowlisted events, synthetic fixture replay, source-linked map nodes, confidence labels, local-first storage, structured model inputs and outputs, an extension boundary, mandatory gates, a cached judge replay, explicit approval, artifact hashes, and visible rollback.

## 12. Decisions requested from the reviewer

1. Is the installable developer kit plus reference CRM the correct product boundary?
2. Is the three-map model coherent, useful, and understandable?
3. Which claim is currently overreaching or technically misleading?
4. What is the smallest demo that still feels extraordinary rather than canned?
5. Which must-have item should be cut immediately?
6. Which contested-scope item is actually essential?
7. Should the generic change mechanism be a pull request, a capability runtime, or both with one as the demo path?
8. Which implementation order should be used, and why?
9. What is the exact first eight-hour milestone after review?
10. What evidence would convince a skeptical judge that the improvement was truly detected and generated?
11. What privacy, security, or prompt-injection failure is missing?
12. If the concept is not viable within the deadline, what narrower fallback preserves the thesis?

## 13. Required review response

Return the review in this structure:

1. **Verdict:** proceed, proceed with changes, or do not proceed.
2. **One-sentence product definition:** rewritten in the clearest possible language.
3. **Strongest part:** the one element that should not be lost.
4. **Fatal assumption:** the most likely reason this will fail.
5. **Contradictions:** conflicting claims, architecture choices, or scope decisions.
6. **Cut list:** features to remove before implementation.
7. **Missing requirement:** anything required for a credible product or judging path.
8. **Recommended architecture:** components and boundaries, including what should remain deterministic.
9. **Recommended build order:** a numbered sequence ending in a runnable demo.
10. **First eight-hour milestone:** exact inputs, outputs, and acceptance tests.
11. **Demo critique:** what a judge will understand, doubt, or dismiss.
12. **Risk table:** severity, evidence, mitigation, and whether it blocks the build.
13. **Decision table:** accept, change, or reject each major proposal.
14. **Three questions for Achref:** only decisions that genuinely require the product owner.

Do not write implementation code. The purpose of this review is to improve or reject the plan before product construction begins.
