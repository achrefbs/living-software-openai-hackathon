# Fable UI review brief — Living Studio

You are the independent product-design reviewer for Living Studio, a Developer Tools submission to OpenAI Build Week.

## Read first

Inspect all five current screenshots in this directory, in order:

1. `01-product-map.jpg`
2. `02-workflows.jpg`
3. `03-opportunities.jpg`
4. `04-evolutions.jpg`
5. `05-receipts.jpg`

Then inspect the implementation under `apps/studio/src`, especially `app/globals.css`, the five route pages, `components/studio-shell.tsx`, `components/surface-nav.tsx`, and `components/ui.tsx`.

Do not edit the repository. Review only.

## Product story the UI must communicate

Within 20 seconds, a first-time judge should understand:

> Living Software installs into a supported application, maps what the product can do, observes privacy-safe workflows, detects recurring friction, and prepares a bounded improvement for human review.

The current evidence journey is:

1. 144 product nodes were mapped from a separate synthetic CRM.
2. Five synthetic workflow cases and 224 privacy-safe events were analyzed.
3. One deterministic backtracking opportunity was detected across three cases.
4. GPT-5.6 interpretation and the governed evolution lifecycle are not connected to this captured Studio snapshot yet.
5. Therefore, there are no evolution or lifecycle receipts for this snapshot.

## Non-negotiable truth boundaries

- Never imply live host ingestion; Studio renders a validated static synthetic export.
- Never imply GPT-5.6 ran on this snapshot when it did not.
- Never imply generation, proof, approval, activation, rollback, or lifecycle receipts exist when they do not.
- Preserve provenance, but move technical hashes and evidence details behind progressive disclosure when possible.
- Do not invent data, users, outcomes, actions, integrations, or system states.
- Keep the design suitable for a public three-minute hackathon demo and a runnable developer tool.

## Review goals

Evaluate:

- first-time comprehension and self-explanation;
- information architecture and the end-to-end journey;
- navigation labels, page naming, empty states, and next-step clarity;
- visual hierarchy, density, typography, spacing, contrast, and personality;
- whether “Product Map” behaves and reads like a useful map;
- whether workflows and opportunities make the evidence understandable rather than merely exposing identifiers;
- accessibility, including likely contrast, font-size, focus, target-size, zoom/reflow, and screen-reader risks;
- demo readiness at the captured 1280×720 viewport, plus responsive behavior.

## Required output

Return concise, implementation-ready Markdown with:

1. A blunt one-paragraph verdict.
2. The five biggest usability problems, ordered by impact and tied to screenshot evidence.
3. Three distinctly different visual/product directions, each with a name, mood, layout idea, strengths, and tradeoffs; recommend one.
4. A revised information architecture and primary user journey.
5. Shared design-system changes: typography scale, spacing, color/contrast, cards, navigation, status language, and interaction patterns.
6. Page-by-page changes for all five screens, including the honest disconnected states.
7. A prioritized implementation backlog split into P0 demo-critical, P1 polish, and P2 later.
8. A short list of what must not change because it protects evidence integrity or hackathon compliance.

Prefer clear product language over internal architecture vocabulary. Be specific enough that another coding agent can implement the chosen direction without guessing.
