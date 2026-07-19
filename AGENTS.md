# Living Software build instructions

These rules apply to every human or coding agent working in this repository.

## Mission

Build one credible, governed software-evolution loop for OpenAI Build Week. The host application may discover and propose a bounded capability, but a model never owns permissions, installation, shipping, evidence deletion, or rollback authority.

## Hackathon evidence is part of the product

- Update `BUILD_LOG.md` after every material Codex session or implementation slice.
- Record product, engineering, and design judgment in `DECISIONS.md`.
- Keep the real `/feedback` Session ID from the primary build task; never invent one.
- Preserve dated commits and attach proof output to the commit that produced it.
- Do not describe planned or mocked behavior as implemented.

## Prior-work boundary

- Read `PRIOR_WORK.md` before importing or recreating anything from earlier Living Software or AgentOS work.
- Do not copy source from the private pre-period prototype unless the entrant intentionally approves it.
- Before any approved reuse is merged, update `PRIOR_WORK.md` with the exact source commit, files, license/ownership, and new Build Week work.

## Model use

- Use GPT-5.6 for a material, demonstrable part of the project and document the exact contribution.
- Codex-generated code must be understood, reviewed, tested, and attributable to a build-log entry.
- Treat model output as a proposal. Validate schemas, permissions, state transitions, tests, and provenance deterministically.

## Security and data

- Never commit API keys, tokens, credentials, personal data, private inbox content, or generated local databases.
- Use only synthetic sample data in the repository and demo.
- Minimize permissions and default-deny undeclared actions.
- Installation must be explicit and rollback must be exercised in tests and the demo.

## Definition of done for a capability

A generated capability is not complete until it has:

1. a typed evidence trail;
2. a machine-valid capability contract;
3. declared inputs, outputs, permissions, prohibitions, tests, and rollback behavior;
4. deterministic unit, adversarial, and replay proof;
5. human approval;
6. an auditable registry entry;
7. a tested disable and rollback path;
8. updated README, build log, and decision evidence.

## Before submission

- Run `npm run submit:check`.
- Verify setup from a fresh clone.
- Verify the public demo in an incognito window.
- Confirm every claim in the video and Devpost description matches the checked-out commit.
