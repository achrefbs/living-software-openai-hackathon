# Demo plan

The final public YouTube video must be shorter than three minutes, include audio, show the project working, and explain how Codex and GPT-5.6 were used. Record only behavior reproduced from the exact submission commit.

## Target cut

### 0:00-0:15 — The problem and boundary

- State the promise: a supported application can expose workflow and layout evidence and receive a bounded improvement draft.
- Name the current support honestly: TypeScript Next.js App Router 15.3+ with `src/app`.
- Clarify that the model proposes; it cannot change or activate the host.

### 0:15-0:50 — Discover and install

- Show the documented Windows 11 / Node.js 22-or-newer setup; the current proof runtime is Node.js 24.14.1.
- Run `npm run build:cli` and `npm run living -- map --root <next-app>`, then show the source-linked Product Manifest, observation runtime map, and metric catalog.
- Run `init --root` first as a dry-run, then with explicit `--synthetic --apply`.
- Point out the create-only file list, hash journal, self-contained generated code, and unchanged host `package.json`.

### 0:50-1:30 — Capture and analyze a workflow

- Run `doctor --root --synthetic`, start the host, and drive its public UI with the independent synthetic simulator.
- Show Living's separate hash-linked `.living/data/releases/<manifest-hash>/events.ndjson` evidence and run `analyze --root`.
- Show projected workflows, technical metrics, and a threshold-based friction opportunity only if the completed run actually produces one.
- Explain that precise CSS-pixel geometry can support a layout hypothesis, while text, values, keystrokes, query strings, DOM, cookies, headers, request bodies, screenshots, and persistent user identifiers are excluded.
- Compare simulator truth only after Living's analysis; do not imply Living ingested the simulator trace.

### 1:30-2:00 — GPT-5.6 contributes materially

- Open the connected Evolution Review and show the CRM-bound “GPT-5.6 evidence interpretation,” the independent deterministic candidate, and the explicit “Waiting for approval · Not live” state.
- Point out that Codex CLI did not report an authoritative actual response model; Studio preserves that as “Not reported” instead of inventing provenance.
- Use the committed sanitized neutral proof for the credential-free judge path. It appears in the neutral fixture flow, not beside an unrelated connected CRM proposal. Optionally run `npm run demo:gpt56:cli` only when saved Codex authentication is available.
- Explain that the connected Prepare command sends only the verified, bounded supporting event subset; GPT interprets evidence but does not generate executable code, approve, or apply it.

### 2:00-2:25 — Living Studio

- Run `npm run studio:sync -- --root <next-app>` after the synthetic capture.
- Open Product Map, Workflows, Opportunities, Evolutions, and Receipts.
- Show the **Captured snapshot** and **Synthetic capture** provenance labels plus one preview state.
- Open the Current vs Proposed route. Point to the unchanged real CRM on the left and the isolated preview's new Previous/Next row on the right.
- Show that the page says what triggered the proposal, identifies the one changed file, and routes to a separate Approve step; approval itself still does not edit the CRM.
- Describe Studio accurately: observation is automatic while the CRM is exercised, but analysis/sync are explicitly rerun in this MVP. Prepare, Approve, and Apply are separate human actions.

### 2:25-2:50 — Remove and assign authority

- Preview `uninstall --root`, then apply it and show the hash-guarded result.
- State that captured evidence and any modified generated file are preserved.
- Summarize Codex work: rule review, architecture, implementation, tests, integration, and documentation.
- Summarize entrant decisions: product thesis, tool/host separation, privacy boundary, and scope.

### 2:50-2:59 — Close

- “Software that earns the right to evolve.”

## Recording gates

- [x] Independent supported-host installation, runtime capture, privacy, and byte-preserving removal proof completed.
- [x] Real GPT-5.6 Terra run completed and evidence preserved.
- [ ] `npm install`, `npm run build:cli`, `npm run typecheck`, `npm run test`, and `npm run demo:neutral` pass on a fresh Windows 11 / Node.js 22-or-newer checkout.
- [ ] Required judge path that does not require rebuilding from scratch is implemented and verified before it is claimed.
- [ ] `npm run dev:studio` starts the five-route Studio.
- [ ] No arbitrary-Node, business-outcome, production collector, live-ingestion, activation, or governed lifecycle rollback claim exceeds the current implementation.
- [ ] Video is below 2:59 and publicly viewable without login.
- [ ] Audio explains both Codex and GPT-5.6 usage.
- [ ] Only synthetic data and licensed/original media appear.
