# Living Software

> Software that earns the right to evolve.

Living Software is an OpenAI Build Week project in the **Developer Tools** category. The challenge build explores a governed mutation loop: an application observes repeated user intent, proposes one bounded capability, proves it against explicit constraints, and installs it only after human approval.

## Status

Repository initialized for OpenAI Build Week. Product implementation begins after this compliance baseline.

## The core loop

```text
evidence -> intention -> capability contract -> generation -> proof -> approval -> install -> rollback
```

The model may propose and generate. Deterministic code owns permissions, tests, installation, and rollback.

## Hackathon scope

This repository contains only the OpenAI Build Week challenge implementation and documentation created after the submission period opened on **July 13, 2026 at 9:00 AM PT**.

An older private research prototype informed the thesis but is not silently presented as hackathon work. See [PRIOR_WORK.md](PRIOR_WORK.md) for the exact boundary and provenance.

## Planned vertical slice

The first complete demonstration will use a small host application called **Founder Inbox**:

1. The host emits a narrow stream of typed, consented user events.
2. Living Software detects a repeated intent the fixed interface does not serve.
3. GPT-5.6 helps interpret that intent and draft a capability contract.
4. Codex generates an isolated extension behind a declared interface.
5. Deterministic gates run unit, adversarial, permission, and replay checks.
6. A person reviews the contract and proof bundle before installation.
7. The capability can be disabled and rolled back in one action.

## Setup

### Prerequisites

- Git
- Node.js 22 or newer
- npm 10 or newer

### Install and verify the repository

```bash
npm install
npm run check
```

There are no runtime dependencies yet. The initial `check` command validates the hackathon evidence and documentation baseline. Application commands will be added with the first implementation slice.

## Testing

```bash
npm test
```

At this stage, the test command runs the same repository compliance check. Before submission it will also run the product test suite and a deterministic demo smoke test.

## Sample data

No private user data will be committed. Synthetic Founder Inbox fixtures will live under [`samples/`](samples/) and will be sufficient to reproduce the judged demo.

## How Codex and GPT-5.6 are being used

This repository was initialized collaboratively with Codex during the eligible submission period.

- **Codex acceleration:** rules review, repository structure, compliance automation, architecture iteration, implementation, testing, and debugging.
- **Human decisions:** the Living Software name and thesis, the governed rather than autonomous product direction, the prior-work boundary, the demo scenario, and every install/rollback authority decision.
- **GPT-5.6 contribution:** used through Codex for compliance reasoning and repository setup; it will be used in the product for bounded intent interpretation and capability-contract drafting. Deterministic code will validate every generated artifact.

The chronological evidence trail is maintained in [BUILD_LOG.md](BUILD_LOG.md). Product and engineering decisions are recorded in [DECISIONS.md](DECISIONS.md).

## Judge path

The final judge experience will be documented here before submission:

```text
clone -> install -> run one command -> open demo -> replay fixture -> inspect proof -> install -> rollback
```

No account, payment, or proprietary data will be required. The runnable testing path will remain available through the judging period.

## Documentation

- [Prior work and eligibility boundary](PRIOR_WORK.md)
- [Build and Codex collaboration log](BUILD_LOG.md)
- [Product and engineering decisions](DECISIONS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Product map](docs/PRODUCT_MAP.md)
- [Judging criteria map](docs/JUDGING_MAP.md)
- [Demo plan](docs/DEMO_PLAN.md)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)
- [Security and trust model](SECURITY.md)

## License

This challenge repository is released under the [MIT License](LICENSE). Third-party dependencies and assets must retain their own notices and compatible licenses.
