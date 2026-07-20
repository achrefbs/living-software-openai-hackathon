# Product

## Register

product

## Users

Hackathon judges seeing Living Studio for the first time (20-second comprehension budget), plus the project owner and reviewing engineers. Context: a Build Week demo running locally against a validated synthetic snapshot — never live telemetry. The primary job on every screen: understand what stage of the evidence pipeline this is, what the evidence actually proves, and what is honestly not available yet.

## Product Purpose

Living Studio renders a validated static export of what Living Software captured from a host application: a product capability map, privacy-safe observed workflows, a deterministic friction detection, and the (currently locked) governed evolution and audit stages. Evolution Review may also show a separately recorded model proposal while keeping the active snapshot's interpretation and governed lifecycle locked. Success: a first-time viewer follows the story "install → map → observe → detect → review → audit" without help, and never mistakes synthetic evidence for production data or locked stages for finished features.

## Brand Personality

Honest, calm, evidentiary. A product control room, not a marketing dashboard: the interface's authority comes from showing provenance and admitting boundaries ("no model has run for this snapshot", "no receipts exist") in plain language. Trust identity: deep green + cyan on dark sidebar chrome, quiet warm-neutral canvas.

## Anti-references

- The generic grid-of-cards AI dashboard: four identical stat tiles + big number + gradient accents.
- Fake-live telemetry aesthetics (pulsing charts, invented sparklines, activity feeds) — this data is a static synthetic export of five cases.
- Dark-glass "AI ops" chrome, glassmorphism, gradient text.
- Anything that dresses a locked/empty stage up as a working feature.

## Design Principles

1. **Truth before beauty.** Verified numbers only (144 nodes, 180 relationships, 5 cases, 224 events, 1 detection, 17 revisits, 74% deterministic confidence). Locked stages say what is missing and why; nothing fabricated.
2. **Narrative over inventory.** Every surface leads with the plain-language story, with hashes, versions and source paths one disclosure away — reachable, never dominant.
3. **Evidence ≠ interpretation ≠ authority.** The UI keeps deterministic detection, optional model proposal, and human approval visibly separate.
4. **Honest interactivity.** Interactive elements work; static elements never look clickable; disabled controls explain their prerequisite at the point of use.
5. **Legible by default.** Body 14–16px, metadata ≥12px, WCAG AA contrast, visible focus, reduced-motion support.

## Accessibility & Inclusion

WCAG 2.1 AA: ≥4.5:1 contrast for normal text, ≥3:1 for large text and UI states; semantic landmarks and headings; keyboard operability with visible focus; `aria-current` on navigation; labeled meters and tables; `prefers-reduced-motion` alternatives; responsive reflow to 320px without horizontal scroll.
