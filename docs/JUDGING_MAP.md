# Judging criteria map

Every claim must point to runnable behavior, a test, a commit, or a preserved artifact. Planned behavior stays labeled as planned.

| Criterion | Evidence available now | Evidence still required |
| --- | --- | --- |
| Technological Implementation | Versioned contracts; bounded Next.js source discovery; dry-run-first create-only installer and hash-guarded uninstall; generated observer and same-origin local collector; workflow and metric analysis; completed independent CRM installation/runtime/privacy/removal proof; neutral replay; validated synthetic-only static snapshot bridge into the five-route Studio; strict GPT-5.6 package with explicit Codex `gpt-5.6-terra` and API `gpt-5.6` transports; preserved live Terra proof; chronological Build Log | Fresh-clone and required no-rebuild judge paths; primary `/feedback` Session ID |
| Design | Privacy boundary that preserves useful CSS-pixel geometry; explicit previews and hash journal; coherent five-surface Studio with visible synthetic/static provenance and preview states | Final recorded walkthrough |
| Potential Impact | A concrete adapter path for deterministically deriving workflows from an independently built application while separating the tool, host, simulator, and model authority | Concise before/after outcome supported by the final independent proof; no generalization beyond the tested adapter |
| Quality of the Idea | Software surfaces repeated workflow and layout friction while deterministic systems bound installation, evidence, interpretation, and removal; the model remains advisory | Final entrant-written positioning that does not overstate business understanding or the future governed lifecycle |

## Judge commands

```bash
npm install
npm run build:cli
npm run living -- map --fixture samples/neutral-host/host-fixture.json
npm run typecheck
npm run test
npm run demo:neutral
npm run dev:studio
```

The neutral fixture path is deterministic and read-only. For a separate supported TypeScript Next.js App Router 15.3+ repository using `src/app`, the automatic CLI surface is:

```bash
npm run living -- map --root <next-app>
npm run living -- init --root <next-app> --synthetic
npm run living -- init --root <next-app> --synthetic --apply
npm run living -- doctor --root <next-app> --synthetic
npm run living -- analyze --root <next-app>
npm run studio:sync -- --root <next-app>
npm run living -- uninstall --root <next-app>
npm run living -- uninstall --root <next-app> --apply
```

`npm run demo:gpt56` is an additional opt-in live path that currently uses saved Codex CLI authentication. `npm run demo:gpt56:api` switches explicitly to an entrant-supplied runtime API key; there is no automatic fallback. Both consume verified neutral replay evidence and remain outside the offline command sequence above.

Verified platform: Windows 11 with Node.js 22 or newer; the current proof runtime is Node.js 24.14.1. Other operating systems have not yet been verified. The required judge path that does not require rebuilding from scratch remains an open submission gate.

## Claims intentionally excluded today

- Universal source-code scanning, automatic installation into arbitrary Node software, or support beyond the current adapter.
- Automatic knowledge of business outcomes or causal layout conclusions.
- Production authenticated or multi-instance evidence collection.
- Live-host ingestion by Studio or automatic-evidence ingestion by GPT-5.6.
- A completed declarative broker or proof/approval/activation/rollback lifecycle.
- Any implementation dependency on the separately built CRM or simulator.
