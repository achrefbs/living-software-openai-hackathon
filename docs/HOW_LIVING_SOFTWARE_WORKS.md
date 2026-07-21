# How Living Software works

## The idea

Living Software is an installable developer tool that helps an existing application explain how it is used and propose a bounded code improvement. It turns privacy-minimized product usage into a reviewable source change while keeping approval, source writes, and rollback outside the model.

The goal is not uncontrolled self-modifying software. The goal is a trustworthy loop:

```text
map -> observe -> detect -> propose -> prove -> approve -> apply -> measure
```

The current MVP implements the loop through apply and rollback. Capturing a fresh post-change cohort and comparing its metrics is still an explicit operator step.

## What happens after installation

1. **Map.** A static scanner reads a supported Next.js repository without executing its code. It creates a source-linked map of routes, surfaces, controls, operations, and relationships.
2. **Observe.** Living installs create-only browser observation and a same-origin local collector. Normal use produces hash-linked events for mapped routes/actions, performance, layout facts, and technical signals such as corrections, dead clicks, and rage clicks.
3. **Detect.** Deterministic detectors group events into privacy-safe workflow cases. The generic detector mines repeated route/action/outcome subsequences without knowing CRM concepts or requiring explicit friction signals; a candidate must recur at least twice in each of three cases across three independent sessions. Other detectors cover corroborated navigation backtracking, repeated corrections, and interaction-failure clusters. Deterministic here means the same validated evidence produces the same result, not that the workflow is hardcoded.
4. **Interpret.** GPT-5.6 receives the exact minimized evidence and a bounded product-map projection. It returns a strict `EvolutionBrief` citing supplied evidence and metrics.
5. **Invent.** A separate GPT-5.6 request sees the brief and at most three source files linked to affected product nodes. It may propose one to eight exact edits in one existing UI file.
6. **Prove.** Living treats the model output as untrusted. It verifies paths, source hashes, exact anchors, edit overlap, output size, prohibited authority, evidence/model bindings, and TypeScript/TSX syntax before storing a `prepared` proposal. Host source is still unchanged.
7. **Decide.** A human reviews the target, diff, artifact hash, proof hash, and evidence. Apply requires explicit approval of those exact hashes.
8. **Apply or roll back.** Living writes only the sealed postimage if the source still matches its preimage. Every transition gets a hash-linked receipt. Rollback restores the exact preimage only if the target still matches the applied postimage.

GPT can invent the change, but it cannot browse the repository, run tools, approve itself, write source, or bypass Living's guards.

## Basic terminal flow

From the Living repository:

```bash
npm install
npm run build:cli

# Install observation into a supported app
npm run living -- install --root <next-app> --synthetic

# Use the app, then inspect deterministic analysis
npm run living -- analyze --root <next-app>

# Ask GPT-5.6 to prepare a bounded change; source remains unchanged
npm run living -- improve --root <next-app> --provider codex

# Review state and exact hashes
npm run living -- status --root <next-app>

# Explicitly approve and apply the sealed artifact
npm run living -- approve --root <next-app> --evolution <id> --actor <label> --artifact-hash <sha256> --proof-hash <sha256> --apply

# Restore the exact preimage
npm run living -- rollback --root <next-app> --evolution <id> --actor <label>
```

`--provider api` selects the OpenAI Responses API and requires `OPENAI_API_KEY`. There is no silent provider fallback. `--synthetic` marks demo/test evidence and must not be represented as production behavior.

## What is automatic, and what is not

| Automatic | Explicit human/operator action |
| --- | --- |
| static mapping and source provenance | install or uninstall Living |
| browser capture after installation | exercise or simulate the host workflow |
| workflow projection, metrics, and threshold detection | trigger analysis/proposal in this MVP |
| bounded GPT interpretation and patch authorship | review and approve exact hashes |
| static proof, preimage checks, and receipt creation | apply, verify the running host, or roll back |

## Safety and privacy boundary

- Current automatic support is TypeScript Next.js App Router 15.3+ repositories using `src/app`.
- Normal capture excludes text, form values, keystrokes, query strings, DOM/HTML, cookies, headers, request bodies, screenshots, and persistent identity.
- The local collector is a development proof surface, not production multi-tenant infrastructure.
- Patch scope is one existing UI source file; no dependencies, configuration, backend authority, new files, or arbitrary repository agent access.
- Passing static proof does not prove the idea is useful. The host must still build, render, and be evaluated with a new evidence cohort.

## What the current proof establishes

In the [clean generic-discovery proof](proof/generic-recurring-workflow-discovery.md), Living started from a fresh separate CRM install with 144 mapped nodes and 180 edges. Its first 22 evidence records contained 79 synthetic events across three independent sessions. From ordinary route/action events—and zero `metadata.signal` events—it learned the four-step lead-link → detail-route → back-link → list-route sequence, found six non-overlapping occurrences, and bound exactly 24 evidence events.

Two live Codex GPT-5.6 calls prepared evolution `evolution.source.v2.bd05a314a3b6e29d4971bc8e`. GPT proposed one exact edit in `src/app/leads/[id]/page.tsx`, changing `Leads` to `Back to leads`. Living passed 13 deterministic checks, required exact human approval, applied the sealed postimage, passed 112/112 CRM tests, rendered the label in the browser, and rolled back exactly to preimage `sha256:6f39fc74f30bc132cf3ba9b2975961a911be5e7197ba536ad4f7b69b907526e5`.

A later rapid-sort experiment emitted three explicit rage signals, so `failure-cluster` won deterministic arbitration. That is a useful secondary detector test, not the generic-discovery proof.

This proves a governed evidence-to-source-change pipeline. It does **not** yet prove production generalization, business-value improvement, pixel-perfect autonomous redesign, or automatic post-change metric improvement.

## Studio

The CLI remains a complete authority surface. Connected Studio starts with a server-supplied root and visualizes the same real operations in a control room:

```bash
npm run studio:live -- --root <next-app> --host-url http://127.0.0.1:3000 --port 3001
```

Start it before installation to see the read-only map and not-installed state. The monitor then validates the public install record, tails only the active release evidence chain, runs the same deterministic evaluator used by analysis, and reconstructs evolution/receipt/source state after refresh or restart. A strict durable event log provides replay and an SSE stream provides new events; there is no lifecycle timer polling, and neither transport grants mutation authority.

Model milestones correspond to the two actual awaited calls and deterministic proof. Reused proposals are labeled as reuse. Approve, apply, and rollback controls invoke the existing engine with exact identity, hash, and revision bindings. Application is shown as a source-hash transition; a responding host frame is a separate invitation to inspect, not runtime proof.

Optional comparison views come from `preview:host`, which copies a bounded stable set of Git-tracked regular files into new directories, installs the exact sealed preimage or postimage, and exposes a source-hash identity endpoint. It never edits the connected host, and opening the preview does not approve or apply anything.

The earlier `studio:sync` plus `dev:studio` path remains available as an explicitly offline snapshot/fixture mode for credential-free judging and regression tests. Its before/after comparison is display-only.
