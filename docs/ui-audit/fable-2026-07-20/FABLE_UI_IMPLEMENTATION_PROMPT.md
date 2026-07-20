# Fable implementation prompt — redesign Living Studio

Work directly in this repository and **implement the Living Studio UI redesign**. Do not stop at an audit, critique, plan, or mockup. Inspect the current product, edit the source, run verification, and leave the working changes in the repository for review.

## Start with the real product

Read these current-state screenshots in order:

1. `docs/ui-audit/fable-2026-07-20/01-product-map.jpg`
2. `docs/ui-audit/fable-2026-07-20/02-workflows.jpg`
3. `docs/ui-audit/fable-2026-07-20/03-opportunities.jpg`
4. `docs/ui-audit/fable-2026-07-20/04-evolutions.jpg`
5. `docs/ui-audit/fable-2026-07-20/05-receipts.jpg`

Inspect all Studio code under `apps/studio/src`, its tests under `apps/studio/tests`, and the snapshot types/data before editing.

## Outcome

Make Studio beautiful, clear, self-explanatory, accessible, and demo-ready. A first-time judge must understand this story within 20 seconds:

> Living Software installs into a supported application, maps what the product can do, observes privacy-safe workflows, detects recurring friction, and prepares a bounded improvement for human review.

Use a cohesive **guided evidence pipeline / product control room** direction. Preserve the existing green/cyan trust identity, but give it stronger hierarchy, more personality, clearer narrative flow, and far better readability. Avoid a generic grid-of-cards AI dashboard.

## Implement these changes

### Shared shell and navigation

- Turn the existing five routes into a visible journey: **Map → Observe → Detect → Review → Audit**.
- Make `/map` the explanatory entry point without adding a separate route.
- Add a compact persistent stage rail or equivalent journey indicator that shows completed, current, and honestly locked stages.
- Use plain-language navigation labels, with technical names as supporting labels if useful.
- Consolidate the repeated synthetic/provenance messages. Keep a short visible trust label and move hashes, versions, and technical provenance into an accessible disclosure/details surface.
- Make the current app, snapshot status, and next meaningful action obvious.
- Remove the visual dominance of disabled controls. Any disabled control that remains must explain its prerequisite at the point of use.

### Readability and accessibility

- Use a legible type scale: body text around 14–16px and no meaningful metadata below 12px.
- Meet WCAG AA contrast for normal text and visible UI states.
- Keep or improve semantic structure, keyboard focus, `aria-current`, labeled meters/tables, reduced-motion support, and responsive reflow.
- Make clickability unambiguous: interactive elements must work; static elements must not look interactive.
- Ensure comfortable target sizes and clear selected, disabled, locked, hover, and focus states.

### Product Map

- Explain immediately what was mapped and why it matters.
- Show the end-to-end product story before technical inventory.
- Make the 144-node scope honest and obvious, including how many items are currently shown.
- Improve the topology presentation so it communicates relationships instead of looking like four unrelated columns. Use the existing data only.
- Add useful client-side exploration such as layer filters, search, or details disclosure if the current data supports it.
- Keep source provenance reachable without making source paths the dominant visual content.

### Workflow Explorer

- Explain “case,” “variant,” “outcome,” and “friction” in plain language.
- Make variant selection genuinely interactive, or restyle it so it does not falsely look selectable.
- Visualize the selected journey and its backtracking clearly.
- Lead with understandable facts, not opaque hashes. Put case identifiers and deep evidence in expandable technical details.
- Reword ambiguous metrics so the five synthetic cases cannot be mistaken for statistically meaningful production telemetry.

### Opportunity Feed

- Remove the duplicated list/detail presentation when only one opportunity exists.
- Lead with the clearest truthful statement: three of five captured cases crossed the backtracking threshold and produced 17 revisits.
- Keep detector name, version, confidence, hashes, and evidence URI as secondary provenance.
- Keep “A pattern is not an instruction” prominent.
- Make the bridge to Review clear while explaining why interpretation is not yet available.

### Evolution Review

- Preserve the disconnected state, but turn the empty page into a useful locked-stage preview.
- Show the governed lifecycle stages and which prerequisite is missing, using conditional language only.
- Explain what GPT-5.6 could propose and what a human would review, without showing a fabricated interpretation, contract, proof, approval, artifact, or activation.
- Provide a useful route back to the detected evidence.

### Receipts

- Preserve that no lifecycle receipts exist for this snapshot.
- Replace the empty canvas with an educational locked audit-trail preview showing the receipt types a real governed evolution would create, each explicitly marked as unavailable/not created.
- Never render fake receipt data or imply that the lifecycle ran.

## Non-negotiable truth and hackathon boundaries

- Studio renders a validated static export from explicitly synthetic CRM activity; it is **not live telemetry**.
- GPT-5.6 did **not** interpret this captured snapshot.
- No capability contract, generated artifact, proof result, approval, activation, rollback, or lifecycle receipt exists for this snapshot.
- Do not invent users, evidence, workflows, metrics, actions, states, or model output.
- Preserve these exact verified facts: 144 mapped nodes, 180 relationships, five cases, five variants, 224 events, one detected backtracking opportunity, three affected cases, 17 revisits, threshold three, affected ratio 60%, deterministic confidence 74%.
- Preserve the separation between deterministic evidence, optional model proposal, and human authority.
- Keep technical provenance reachable on every relevant surface.
- Do not change discovery, collection, intelligence, evidence contracts, scanner behavior, fixtures, or the underlying verified snapshot merely to make the UI look better.

## Scope and engineering constraints

- Primarily edit `apps/studio/src` and Studio tests.
- Reuse the current data model and existing product identity. Do not introduce fake assets, fake charts, placeholder content, or unsupported product claims.
- Avoid unnecessary dependencies. If a dependency is truly needed, explain why in the final handoff.
- Do not commit or push. Leave changes in the working tree for Codex and the owner to review.
- Update `BUILD_LOG.md`, `DECISIONS.md`, or README wording only if the implemented UI changes make an existing statement inaccurate or require a truthful provenance note. Do not rewrite unrelated documentation.

## Verification required before finishing

Run:

```bash
npm run test --workspace @living-software/studio
npm run typecheck --workspace @living-software/studio
npm run build --workspace @living-software/studio
```

Then run Studio and visually verify all five routes at 1280×720, plus at least one mobile viewport. Check for horizontal overflow, clipping, tiny text, dev-tools overlap, broken interactions, misleading states, and console errors. Save fresh after-screenshots next to the existing audit images using `after-` filenames.

Do not declare completion until the code, tests, build, and browser verification all pass. In the final response, summarize the implemented changes, list verification results, identify every changed file, and disclose any remaining limitation.
