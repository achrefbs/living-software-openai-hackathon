# GPT-5.6 proof artifacts

This directory holds sanitized, create-only `living.gpt56-proof/v2` evidence
from explicit live GPT-5.6 runs. A proof records the clean source commit,
request and schema hashes,
synthetic evidence hashes and counts, validated draft, provider-specific
provenance, and token usage when the provider reports it.

Proof files never contain credentials, authorization headers, raw host data,
session or actor identifiers, source paths, hidden reasoning, or the full
request prompt. Codex CLI thread ids are labeled separately from Responses API
response ids. A Codex CLI proof records both the logical `gpt-5.6`
boundary and the exact `gpt-5.6-terra` transport request; the CLI does not
authoritatively report an actual response model or an API storage value.

The recorder refuses a dirty worktree and refuses to overwrite an existing
artifact.

Current artifact:

- `gpt56-live-codex-cli.json` — authenticated `gpt-5.6-terra` request,
  clean source commit `4c1480f220fb88283a63e160d9dc6da8c6fa82d5`,
  locally validated draft, and conservative CLI provenance.
- `gpt56-live-crm-source-evolution.md` — sanitized July 21 record of the
  generic CRM brief and patch runs, exact hashes, approval/application,
  receipt-chain audit, CRM tests/build, and browser-visible result.
