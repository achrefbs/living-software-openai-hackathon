# Build and Codex collaboration log

This is the chronological evidence trail for OpenAI Build Week. Add an entry for every material Codex session, major implementation slice, proof run, and submission milestone.

## Required session ID

Primary `/feedback` Codex Session ID: `SESSION-ID-PENDING`

Replace this only with the real ID from the task where the majority of core functionality is built. Do not invent or infer an ID.

## 2026-07-19 - Repository and compliance baseline

**Scope**

- Pulled the authoritative OpenAI Build Week overview, official rules, judging criteria, key dates, submission fields, and latest announcements through the Devpost Hackathons plugin.
- Verified that the entrant is registered and that no Devpost project existed before setup.
- Audited the local workspace and identified the separate pre-hackathon prototype ending at commit `9f43232` on July 12.
- Created a clean, isolated repository rather than modifying or relabeling the earlier private prototype.
- Added prior-work disclosure, rule-mapped documentation, repository checks, licensing, and judge-path placeholders.

**How Codex accelerated the work**

- Compared live Devpost requirements against the repository plan.
- Located collision and provenance risks across existing worktrees.
- Drafted the compliance automation and documentation structure.
- Checked that the README explicitly covers setup, testing, sample data, Codex, GPT-5.6, and judge access.

**How GPT-5.6 was used**

- GPT-5.6 powered the Codex reasoning used for the compliance audit and repository initialization.
- No runtime model integration is claimed in this entry; that will be documented when implemented and tested.

**Entrant direction and working decisions**

- The entrant selected Living Software as the likely project direction.
- "Living Software" and "Software that earns the right to evolve." are the current working name and thesis from the accepted concept brief; confirm the final wording before submission.
- A governed rather than autonomous mutation loop is the current product guardrail; confirm or revise it during implementation.
- The entrant explicitly required a compliant, fresh challenge repository before implementation begins.

**Evidence**

- Initial repository commit: `3bfd744` (`chore: establish Build Week compliance baseline`).
- Eligibility marker: annotated tag `build-week-start`.
- Devpost rules snapshot: July 19, 2026.
- Validation command: `npm run check`.

---

## Entry template

### YYYY-MM-DD - Short outcome

**Scope**

- What changed.

**How Codex accelerated the work**

- Specific tasks Codex performed.

**How GPT-5.6 was used**

- Specific contribution from GPT-5.6.

**Human decisions**

- Product, engineering, or design decisions made by the entrant.

**Evidence**

- Commit SHA, tests, screenshots, proof bundle, or session ID.
