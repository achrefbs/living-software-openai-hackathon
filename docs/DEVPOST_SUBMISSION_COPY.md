# Devpost submission copy

Ready-to-paste copy for the final OpenAI Build Week submission. Replace only the two clearly marked placeholders before submitting.

## Project identity

**Title:** Living Software

**Tagline:** Software that observes recurring workflows, proposes bounded improvements, and evolves only with proof and approval.

**Category:** Developer Tools

**Public GitHub repository:** https://github.com/achrefbs/living-software-openai-hackathon

**Public video URL:** `[PENDING — paste the public YouTube URL]`

**Primary Codex `/feedback` Session ID:** `[PENDING — paste the real Session ID from the primary build task]`

## Project description

### Problem

Software teams can see individual clicks and errors, but they still spend enormous effort translating repeated user behavior into a safe, reviewable product change. Analytics explains what happened; it rarely connects the evidence to the relevant source code or provides a governed path from observation to a reversible implementation.

### What it does

Living Software is an installable developer tool for supported TypeScript Next.js App Router applications. It maps the product, installs privacy-minimized browser observation, and detects recurring workflows and corroborated technical-friction patterns. When evidence crosses a documented threshold, Living asks GPT-5.6 to interpret the bounded evidence and invent a source proposal. The proposal remains prepared until a human reviews and approves its exact artifact and proof hashes.

### How it works

Living discovers routes, actions, source provenance, and layout geometry without recording text, form values, DOM, screenshots, query strings, secrets, or persistent identity. A generic repeated-sequence detector mines ordinary route/action/outcome subsequences; it does not contain CRM-specific feature rules. The recorded synthetic demonstration found a repeated Leads-to-Tasks workflow across three independent sessions with zero explicit friction signals. GPT then independently selected an existing Tasks UI file and proposed a Lead context card.

The model receives at most three manifest-linked UI files, capped at 96 KB total, and can propose one to eight exact edits in one existing file. Living treats the response as untrusted, runs deterministic path, authority, evidence, preimage, diff, and postimage checks, and stores a sealed artifact. Only the engine can apply the human-approved postimage. Hash-linked receipts record preparation, approval, application, verification, and byte-exact rollback. Living Studio visualizes the same backend lifecycle in real time; the CLI remains a complete interface.

### Codex + GPT-5.6

Codex accelerated architecture, implementation, tests, security review, integration, and documentation. Inside the product, GPT-5.6 is materially used twice: first to produce a structured evidence interpretation, then to author the bounded code proposal. GPT has no terminal, browser, filesystem-write, approval, apply, test, or rollback authority. Its exact proposal is intentionally variable rather than scripted.

### Current limits

Automatic installation currently supports TypeScript Next.js App Router 15.3+ repositories using `src/app`. Changes are limited to one existing UI file and require explicit approval. The observer and Studio broker are local development surfaces, not production telemetry infrastructure. The demonstration uses synthetic evidence. Recurrence is a review trigger, not proof of frustration or causality, and visible application is not proof of measured workflow improvement. Automatic post-change cohort measurement remains future work.

## Built with

- OpenAI Codex CLI and OpenAI Responses API transports
- GPT-5.6 and `gpt-5.6-terra`
- TypeScript 5.9
- Node.js 22+
- npm workspaces
- Next.js 16.2.10
- React 19.2.7
- Server-Sent Events, JSONL evidence, and SHA-256 hash-linked receipts

## Judge installation and testing

### Fast credential-free, no-rebuild path

The committed platform-neutral CLI JavaScript is used directly. This path does not compile TypeScript, rebuild the CLI, or build Studio, and it does not require an API key:

```bash
git clone https://github.com/achrefbs/living-software-openai-hackathon.git
cd living-software-openai-hackathon
npm ci
npm run judge:neutral
npm run living -- map --fixture samples/neutral-host/host-fixture.json
```

`judge:neutral` maps the neutral host and replays 31 explicitly synthetic events. It verifies the credential-free deterministic path; it does not call a model or modify another repository.

### Full repository test path

Verified platform: Windows 11, Node.js 22+, npm 10+.

```bash
npm run check
npm run typecheck
npm run test
```

### Connected live path

The optional public reference host is https://github.com/achrefbs/crm-workflow-lab.git. The recorded demo starts from commit `545136b` (`545136b96cf0a6d3fdd9ddcae7733b3eeda8a6a8`). From the directory beside the Living repository:

```bash
git clone https://github.com/achrefbs/crm-workflow-lab.git
cd crm-workflow-lab
git checkout 545136b
npm ci
npm run dev
```

With that host running on port 3000, use a second terminal in the Living repository:

```bash
npm run studio:live -- --root ../crm-workflow-lab --host-url http://127.0.0.1:3000 --port 3001 --new-session
npm run living -- install --root ../crm-workflow-lab --synthetic
npm run living -- analyze --root ../crm-workflow-lab
npm run living -- improve --root ../crm-workflow-lab --provider codex
```

Open `http://127.0.0.1:3001/live`. Review the actual proposal and use the exact approval command printed by Living. Reload the host to inspect the applied change, then use the printed rollback command to restore the sealed preimage.

## Free-access statement

The public repository, committed credential-free judge path, documentation, and public demo video will remain freely accessible without payment through the end of the official OpenAI Build Week judging period. Live model regeneration is optional and uses the entrant's Codex authentication or API key; judges can verify the deterministic product path and preserved live GPT-5.6 evidence without supplying credentials.

## Under-three-minute narration outline

**0:00–0:15 — Promise and boundary**

Show Live Studio already running before installation: “Living Software observes recurring workflows and lets GPT propose a bounded code change. A human and deterministic engine control every write.” Mention that Codex built and tested the tool while GPT-5.6 runs inside it.

**0:15–0:40 — Install, partial threshold, refresh**

Install Living into the synthetic CRM. Show the detector below threshold after partial evidence, refresh Studio, and show that the validated durable event history replays instead of restarting or fabricating progress.

**0:40–1:05 — Generic detection**

Complete the repeated workflow across three independent sessions. Show the threshold crossing, actual cases/sessions/occurrences, learned route/action sequence, and zero explicit signals. Say: “This proves recurrence, not frustration or causality. The CRM workflow was not hardcoded.”

**1:05–1:42 — Live, variable GPT proposal**

Run `improve --provider codex`. Keep the real awaited stages visible. Show the feature, target file, and exact edits GPT actually returns; never predict them in advance. Point out that the host remains unchanged while status is `prepared`.

**1:42–2:15 — Proof, approval, and apply**

Show all proof checks, the artifact hash, proof hash, and preimage hash. Review the diff, run the exact printed approve/apply command, and show the approval and application receipts.

**2:15–2:38 — Visible host change**

Reload the CRM and visibly inspect the real applied UI change. Say: “The sealed postimage is running, but this does not yet prove the workflow improved.”

**2:38–2:57 — Exact rollback**

Run the printed rollback command, reload the host, and show the original UI restored plus the final receipt. Close: “Software that earns the right to evolve.”

## Suggested screenshots and captions

1. **Living Studio: evidence becoming a workflow** — “Synthetic CRM activity progresses from below threshold to a generic recurring-sequence opportunity across three independent sessions; refresh replays the validated history.”
2. **GPT proposal behind a human gate** — “GPT-5.6 chose the actual target and edits from bounded source context; Living proved and sealed the artifact, but the host remains unchanged until exact-hash approval.”
3. **Applied UI and reversible proof** — “The GPT-authored change rendered in the CRM, passed host tests, and was then restored to its byte-identical preimage through the receipt-bound rollback.” Use the preserved applied and rolled-back images from `docs/proof/screenshots/` as a labeled side-by-side composite.
