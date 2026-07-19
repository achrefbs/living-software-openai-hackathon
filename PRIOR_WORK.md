# Prior work and hackathon boundary

This document exists to make the OpenAI Build Week eligibility boundary inspectable.

## Official timing boundary

The submission period began on **July 13, 2026 at 9:00 AM Pacific Time**. The official rules state that pre-existing projects are evaluated only on work added during the submission period and require clear documentation separating prior work from new work.

## Disclosed pre-hackathon prototype

Before Build Week, Achref Boularess maintained a separate private research repository named `achrefbs/living-software-brain`.

| Evidence | Value |
| --- | --- |
| First recorded commit | `be67b9c` on May 23, 2026 |
| Last pre-period commit | `9f4323265d036c04d0cf2ca833fac004a38a8a4b` |
| Last pre-period timestamp | July 12, 2026 at 20:02 Europe/Madrid |
| Pre-period history | 46 commits |
| License/status | Private and unlicensed |

That prototype explored a TypeScript and SQLite project graph, bounded code-writing cells, treaties and boundary checks, a cockpit, and deterministic browser/proof gates. Those capabilities are **prior work**, not Build Week deliverables.

## What entered this repository

As of the initial compliance commit:

- No source code was copied from the private prototype.
- No commits or files from its history were rewritten as new hackathon work.
- The inherited material is limited to the high-level thesis and lessons learned.
- The OpenAI Build Week implementation starts from an empty source directory in this separate repository.

If prior code is intentionally reused later, this file must be updated before that code is merged. The update must identify the exact source commit and files, preserve applicable ownership/licensing information, and state precisely what new work was added during the eligible period.

## New Build Week work

The challenge implementation is the new Founder Inbox vertical slice described in the README: typed user-event evidence, repeated-intent detection, a machine-valid capability contract, governed generation, deterministic proof, explicit installation, and rollback.

Evidence for new work will include:

- dated commits in this repository;
- chronological entries in [BUILD_LOG.md](BUILD_LOG.md);
- Codex `/feedback` session IDs;
- test and proof output tied to commit SHAs;
- the final demo and submission materials.

## Evaluation claim

The submission will ask judges to evaluate only the implementation and evidence created in this repository during the eligible window. The earlier prototype is context, not a claimed hackathon accomplishment.
