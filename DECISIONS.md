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
- **Status:** Superseded by D-005
- **Owner:** Achref Boularess with Codex analysis
- **Decision:** Use Founder Inbox as the host application and prove one repeated-intent-to-installed-capability loop.
- **Why:** A real, bounded mutation is more credible than a broad platform demo that only works as theater.
- **Consequence:** General self-evolving infrastructure is explicitly out of scope for the hackathon build.

## D-005 - Keep Living Software independent from its reference host

- **Date:** 2026-07-19
- **Status:** Accepted
- **Owner:** Achref Boularess
- **Decision:** Build Living Software as an installable developer tool with a separate Studio. Build the reference CRM in a separate repository as an ordinary standalone application, then integrate it through the same public SDK and adapter path available to any supported host.
- **Why:** A host designed around hidden Living-specific seams would not prove that the tool can be installed into an existing application.
- **Consequence:** Living core and Studio may depend only on versioned public contracts. CRM concepts such as leads, deals, and follow-ups are prohibited from generic packages.

## D-006 - Claim supported-codebase installation, not universal understanding

- **Date:** 2026-07-19
- **Status:** Accepted
- **Owner:** Achref Boularess with Codex analysis
- **Decision:** The Build Week implementation starts with a TypeScript Next.js App Router 15.3+ adapter for repositories using `src/app`. Structural mapping and bounded action locators can be automatic; business meaning, outcomes, and privacy policy require developer confirmation.
- **Why:** Arbitrary source code does not expose business intent, and zero-configuration support for every language would be an untestable claim.
- **Consequence:** Installation, supported-platform, doctor, test, evidence, and uninstall behavior must be documented and verified against a supported independent host. Other Node frameworks remain adapter work, not current support.

## D-007 - Use an independent simulator as ground truth

- **Date:** 2026-07-19
- **Status:** Accepted
- **Owner:** Achref Boularess
- **Decision:** The reference CRM repository will include an independent workflow simulator that drives the public UI and can generate synthetic traces. Living Software will not own or secretly shape those scenarios.
- **Why:** Independent scenarios provide reproducible data and a ground-truth trace for evaluating event coverage and workflow detection.
- **Consequence:** Simulator output must be labeled synthetic, contain no real personal data, and remain separate from Living's observed evidence.

## D-008 - Make the first installer surface plan-only

- **Date:** 2026-07-19
- **Status:** Superseded by D-011
- **Owner:** Achref Boularess with Codex implementation review
- **Decision:** The first Next.js CLI consumes an explicit host descriptor and returns deterministic `init`, `map`, `doctor`, and `uninstall` plans. It does not yet scan or modify a repository, and `--apply` fails closed.
- **Why:** A reversible, inspectable plan establishes the public contracts without pretending that source discovery and safe mutation already work.
- **Consequence:** The descriptor-driven `--fixture` mode remains as a deterministic, read-only neutral test path. D-011 now governs the root-mode scanner, dry-run-first apply, doctor, analysis, and hash-guarded uninstall.

## D-009 - Give GPT-5.6 interpretation authority only

- **Date:** 2026-07-19
- **Status:** Accepted
- **Owner:** Achref Boularess with Codex implementation and adversarial review
- **Decision:** Deterministic code detects opportunities and verifies the evidence supplied to GPT-5.6. The model may return only a strict, draft-status Evolution Brief for human review; it receives no host tools and cannot approve, activate, or mutate anything.
- **Why:** Model judgment is useful for turning a workflow signal into a comprehensible hypothesis, but evidence integrity and change authority must not depend on generated prose.
- **Consequence:** Runtime requests must be bounded, privacy-minimal, schema-constrained, time-limited, and linked to a real response ID. Offline mocks prove the boundary, not material live model use; a real GPT-5.6 run remains required before submission.

## D-010 - Keep unfinished Studio states visibly locked

- **Date:** 2026-07-19
- **Status:** Accepted for the current implementation slice
- **Owner:** Achref Boularess with Codex design review
- **Decision:** Studio is initially a read-only, explicitly synthetic fixture that exposes Product Map, Workflows, Opportunities, Evolutions, and Receipts while keeping interpretation, contract, proof, and activation states visibly locked when no real artifact exists.
- **Why:** The interface can communicate the product and trust model without fabricating a live backend or completed lifecycle.
- **Consequence:** Studio must remain labeled offline and synthetic until replay output and live services are actually connected.

## D-011 - Make automatic discovery the next vertical slice

- **Date:** 2026-07-19
- **Status:** Accepted; initial implementation and independent CRM proof complete
- **Owner:** Achref Boularess
- **Decision:** Prioritize explicit, reversible installation into an existing Node application, automatic static product discovery, automatic browser workflow observation, and metric setup before implementing capability generation or activation. The first supported adapter is TypeScript Next.js App Router 15.3 or newer; other Node frameworks remain adapter work, not a current claim.
- **Why:** Automatic understanding is the product's make-or-break behavior. A descriptor written by hand cannot prove that Living Software can enter an independently built application and learn from it.
- **Consequence:** The Surus CRM is the first independent integration proof. Living derives its own map and evidence; Claude's simulator is used only as a post-run oracle. The implementation includes bounded scanning, create-only apply, automatic observation, same-origin local collection, workflow and metric analysis, doctor checks, and hash-guarded uninstall. The CRM proof completed supported installation, runtime capture, privacy checks, and byte-preserving removal without importing simulator conclusions.

## D-012 - Measure layout without surveilling content

- **Date:** 2026-07-19
- **Status:** Accepted
- **Owner:** Achref Boularess with Codex privacy analysis
- **Decision:** Ordinary workflow observation may capture bounded element geometry, viewport class, visibility, scroll burden, spatial travel, layout shifts, and performance timing. It must not capture text, form values, keystrokes, query strings or hashes, DOM or HTML payloads, cookies, headers, request bodies, screenshots, or persistent user or cross-tab identifiers. Synthetic screenshots remain possible future visual-test evidence, not current ordinary capture.
- **Why:** Position and responsive layout can materially affect workflow friction, but continuous screen recording would create unnecessary privacy and security risk.
- **Consequence:** A layout recommendation requires repeated workflow friction plus spatial or performance evidence within a comparable viewport. Geometry alone cannot authorize or justify an automatic layout change.

## D-013 - Keep discovery inside the supported application boundary

- **Date:** 2026-07-20
- **Status:** Accepted
- **Owner:** Achref Boularess with Codex implementation review
- **Decision:** The first Next.js adapter scans root `package.json`, `app/**`, `src/app/**`, `src/components/**`, and `src/lib/**`. It excludes `.living`, root-level simulator/script/test tooling, co-located tests and stories, and build harnesses from product evidence while retaining host route handlers and integrations within the supported application roots.
- **Why:** A repository-wide JavaScript/TypeScript scan caused simulator types and test/seed `localStorage` calls to appear as product entities and integrations. That contaminated the map and release digest with evidence that does not execute as part of the application.
- **Consequence:** Product Manifest provenance and release drift now reflect supported application source only. New adapter roots must be added deliberately with regression proof rather than inferred from unrelated repository files.
