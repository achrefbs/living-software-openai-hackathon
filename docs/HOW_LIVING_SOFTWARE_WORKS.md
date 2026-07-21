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
3. **Detect.** Deterministic detectors group events into privacy-safe workflow cases. A proposal is possible only when a configured, testable threshold is met. Current detectors cover corroborated navigation backtracking, repeated corrections, and interaction-failure clusters.
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

Living has been installed in a separately built CRM, captured its own synthetic browser evidence, prepared a non-hardcoded two-stage GPT-5.6 proposal, exact-hash applied the resulting source edit, passed the CRM test/build gates, rendered the change, and restored the sealed preimage through rollback. Stress tests also exercise below-threshold controls, multiple detector families, deterministic arbitration, hostile/tampered inputs, crash recovery, and source-selection limits.

This proves a governed evidence-to-source-change pipeline. It does **not** yet prove production generalization, business-value improvement, pixel-perfect autonomous redesign, or automatic post-change metric improvement.

## Studio

The CLI is the complete authority surface. Living Studio visualizes the same map, workflows, opportunity, proposal, proof, comparison, and receipts after an explicit sync:

```bash
npm run studio:sync -- --root <next-app>
npm run dev --workspace @living-software/studio -- --port 3001
```

Studio does not silently ingest continuously, and its before/after comparison does not itself grant mutation authority.
