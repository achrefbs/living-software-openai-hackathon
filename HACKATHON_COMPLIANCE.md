# OpenAI Build Week compliance record

This record was checked against the live Devpost Hackathons plugin on **July 19, 2026**. The official rules and hackathon website remain authoritative if anything changes.

## Event

- **Hackathon:** OpenAI Build Week
- **Devpost slug:** `openai`
- **Status:** Submissions open
- **Entrant registration:** Confirmed
- **Devpost project draft:** [Living Software](https://devpost.com/software/living-software-x69rd1) (`living-software-x69rd1`)
- **Submission deadline:** Tuesday, July 21, 2026 at 5:00 PM PT (Wednesday, July 22 at 02:00 Europe/Madrid)
- **Planned category:** Developer Tools
- **Rules:** <https://openai.devpost.com/rules>
- **Hackathon:** <https://openai.devpost.com/>

## Repository controls

- The repository is isolated from the substantial pre-period prototype.
- [PRIOR_WORK.md](PRIOR_WORK.md) identifies the older repository, dates, and last pre-period commit.
- [BUILD_LOG.md](BUILD_LOG.md) records Codex/GPT-5.6 collaboration and dated evidence.
- [DECISIONS.md](DECISIONS.md) records entrant-owned product, engineering, and design decisions.
- The MIT license covers original challenge code in this repository.
- Third-party packages, APIs, assets, and sample data must be authorized and license-compatible.
- Secrets, real user data, private judge credentials, and local databases are excluded from version control.

## Required final deliverables

- A working, non-trivial project built with Codex and using GPT-5.6 for a material part of the work.
- One category selection.
- A project description in the entrant's own voice.
- A public YouTube demo shorter than three minutes.
- Demo audio explaining what was built and how Codex and GPT-5.6 were used.
- A repository URL with setup, sample data, run, test, and judge instructions.
- A real `/feedback` Codex Session ID from the primary build task.
- Free test access kept working through judging.
- Installation, platform, and no-rebuild testing instructions because this is a developer tool.

## Judging criteria

1. Technological Implementation
2. Design
3. Potential Impact
4. Quality of the Idea

The evidence plan for each criterion is maintained in [docs/JUDGING_MAP.md](docs/JUDGING_MAP.md).

## Change control

Before every submission-related change:

1. Re-fetch live announcements and requirements.
2. Run `npm run check` during development.
3. Run `npm run submit:check` before the final Devpost submission.
4. Confirm the Devpost entry status is **Submitted**, not Draft.
