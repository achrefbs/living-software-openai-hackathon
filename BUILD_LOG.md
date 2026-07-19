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

## 2026-07-19 - Public repository and Devpost project linked

**Scope**

- Created the public GitHub repository from the audited local baseline without generated starter files.
- Pushed `main` and the annotated `build-week-start` eligibility tag.
- Linked the public repository to the Living Software Devpost project page.

**How Codex accelerated the work**

- Carried the verified local history into the remote repository without rewriting the provenance boundary.
- Independently checked the local history, tag, tests, tracked filenames, and likely secret patterns before publication.

**How GPT-5.6 was used**

- GPT-5.6 powered the Codex workflow that configured, published, and remotely verified the challenge baseline.

**Entrant direction and working decisions**

- The repository is public and MIT-licensed for straightforward judge access.
- The Devpost description remains explicitly labeled as work in progress until the demonstrated product claims are final.
- Devpost published the standalone project page after its required fields were completed; it has not been submitted to the hackathon.

**Evidence**

- Public repository: <https://github.com/achrefbs/living-software-openai-hackathon>
- First verified remote HEAD before the publication-record commits: `ff33c05b498f0bf3030c74da2f94f44c8a466b88`.
- Baseline tag: `build-week-start` at `3bfd744f7e8d43ebe34730af0adcdb2c0b27d6cf`.
- Devpost project page: <https://devpost.com/software/living-software-x69rd1> (version 2; no hackathon submission).
- Validation: `npm test`, `git fsck --full`, and GitHub connector commit verification.

---

## 2026-07-19 - Product map and first build spine

**Scope**

- Grounded product discovery in the accepted Living Software thesis, Founder Inbox vertical slice, trust model, judging criteria, and prior-work boundary.
- Created and organized the `living-software-product-map` canvas through the locally configured SuperDraw MCP server.
- Mapped users and jobs, the governed evolution loop, trust primitives, the three-minute demo, Build Week scope, risks and experiments, metrics, exclusions, and the later platform.
- Captured a recommended implementation order that proves installation and rollback before adding model intelligence.

**How Codex accelerated the work**

- Synthesized independent product, architecture, safety, and hackathon perspectives into one connected 89-element canvas.
- Challenged the product framing so Founder Inbox remains a thin host and the governed evolution lifecycle remains the actual product.
- Converted the map into a repository-backed working artifact without treating every brainstormed idea as an accepted decision.

**How GPT-5.6 was used**

- GPT-5.6 powered the product reasoning, assumption testing, map structure, safety differentiation, and MVP sequencing performed through Codex.

**Entrant direction and working decisions**

- The entrant explicitly asked to begin implementation from a SuperDraw product map containing ideas, features, and open thoughts.
- Canvas content remains working product discovery until the entrant accepts or revises individual decisions.

**Evidence**

- Canvas: `living-software-product-map`.
- Canvas file: `C:\Users\acera\Desktop\SuperDraw\canvases\living-software-product-map.superdraw.json`.
- SuperDraw MCP verification: 89 elements, 30 nodes, 29 connections, one connected group.
- Repository artifact: [docs/PRODUCT_MAP.md](docs/PRODUCT_MAP.md).

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
