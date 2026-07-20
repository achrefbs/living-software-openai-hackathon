# Contributing

Keep changes aligned with the Living Software tool, its current supported-adapter scope, and its evidence-backed boundaries.

1. Read `AGENTS.md`, `PRIOR_WORK.md`, `DECISIONS.md`, and `SECURITY.md`.
2. Preserve the separation between this repository and the standalone CRM/simulator repositories.
3. Keep generated changes small enough to understand and review.
4. Add or update tests for every behavior change.
5. Label synthetic, imported, and observed data accurately.
6. Update `BUILD_LOG.md` and affected decision or architecture records.
7. Run:

```bash
npm install
npm run build:cli
npm run typecheck
npm run test
npm run demo:neutral
```

Do not add real user data, secrets, unlicensed assets, copied pre-hackathon code, or claims that have not been reproduced. Root-mode `init` and `uninstall` must remain dry-run by default and require explicit `--apply`. Any host write must stay within the documented create-only, hash-journaled transaction and receive safety review, tests, and documentation.
