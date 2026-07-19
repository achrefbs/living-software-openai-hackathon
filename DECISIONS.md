# Product and engineering decisions

Decisions are recorded here so judges can distinguish generated assistance from entrant judgment.

## D-001 - Use a separate clean challenge repository

- **Date:** 2026-07-19
- **Status:** Accepted
- **Owner:** Achref Boularess
- **Decision:** Build the hackathon vertical slice in a new repository and disclose the older private prototype only as prior work.
- **Why:** This creates a legible eligibility boundary and prevents pre-period code from being mistaken for Build Week work.
- **Consequence:** No source from `living-software-brain` may enter without an explicit provenance update in `PRIOR_WORK.md`.

## D-002 - Enter the Developer Tools category

- **Date:** 2026-07-19
- **Status:** Accepted for planning; verify again before submission
- **Owner:** Achref Boularess with Codex analysis
- **Decision:** Frame Living Software as a developer tool for governed capability evolution.
- **Why:** The primary value is making generated software extensions testable, permissioned, inspectable, and reversible.
- **Consequence:** The final repository and submission must include installation instructions, supported platforms, and a test path that does not require judges to rebuild from scratch.

## D-003 - The model proposes; deterministic systems govern

- **Date:** 2026-07-19
- **Status:** Accepted
- **Owner:** Achref Boularess
- **Decision:** GPT-5.6 and Codex may interpret intent and generate an extension, but cannot grant permissions, install, ship, or erase evidence.
- **Why:** The extraordinary part of the project is not unconstrained self-modification; it is earned, reversible evolution.
- **Consequence:** Every mutation needs a capability contract, proof bundle, human approval, registry entry, and rollback path.

## D-004 - Prove one vertical slice before generalizing

- **Date:** 2026-07-19
- **Status:** Accepted
- **Owner:** Achref Boularess with Codex analysis
- **Decision:** Use Founder Inbox as the host application and prove one repeated-intent-to-installed-capability loop.
- **Why:** A real, bounded mutation is more credible than a broad platform demo that only works as theater.
- **Consequence:** General self-evolving infrastructure is explicitly out of scope for the hackathon build.
