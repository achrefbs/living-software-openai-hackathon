# Demo plan

The public YouTube video must be under three minutes, include audio, and show behavior reproduced from the exact submission commit. Use [FILMING_SCRIPT.md](FILMING_SCRIPT.md) as the command-and-voiceover runbook.

## Target cut

### 0:00-0:15 — Promise and boundary

- “Install Living Software, use your app, and let it propose an improvement from the workflow it observed.”
- State current support: TypeScript Next.js App Router 15.3+ using `src/app`.
- State the trust line: GPT authors the proposal; a human and deterministic engine control source writes.

### 0:15-0:35 — Install

Run:

```bash
npm run living -- install --root ../Living-Manual-Test-Fixed/crm-workflow-lab --synthetic
```

Show the mapped-node summary and that observation is ready. Explain that installation is create-only and hash-journaled.

### 0:35-0:58 — Observe and cross the threshold

- Start the independent CRM and use visible browser actions in three fresh tabs. Each tab is one ephemeral session.
- After one or two sessions, show the recurring-sequence detector still below its three-session threshold. Refresh `/live` and show the same progress replayed from the durable ledger.
- Complete the third session and show the detector cross its threshold. In each session, perform the same lead-link → detail-route → back-link → list-route flow twice. No countdown, pacing rule, scenario label, or injected signal is required.
- Run `npm run living -- analyze --root ../Living-Manual-Test-Fixed/crm-workflow-lab`. Its compact human output must show the actual captured total, detector/version, cases, sessions, occurrences, readable sequence, exact supporting-event count, and explicit-signal count.
- The preserved reference run produced three cases, three sessions, six occurrences, exactly 24 supporting events, and zero explicit signals. Its full cohort contained 79 events; do not present 79 as a guaranteed total for a fresh capture.
- Explain what Living captures: routes, mapped actions, timing, friction and CSS-pixel geometry.
- State what it excludes: content, values, DOM, screenshots, secrets and persistent identity.
- Say explicitly: recurrence makes the workflow reviewable; it does not prove frustration, causality, or improvement.

### 0:58-1:35 — GPT invents the proposal

Run:

```bash
npm run living -- improve --root ../Living-Manual-Test-Fixed/crm-workflow-lab --provider codex
```

- Show the detected evidence, interpretation, chosen file, exact GPT-authored edits, model provenance, proof result and evolution ID.
- Keep the terminal progress in frame: it reports real awaited evidence, model, source-selection, proof, and ledger milestones. It does not expose prompts or private model reasoning.
- Show the selected detector/version and its exact minimized evidence. Living must stop before GPT when a known detector's semantics cannot be recomputed from that evidence.
- If showing preserved evidence, label it explicitly: the first generic proof used evolution `evolution.source.v2.bd05a314a3b6e29d4971bc8e`; the independent Leads → Tasks proof used `evolution.source.v2.672622f9c94f7121dcc8217c`. Never present either stored output as the result of a new model call.
- Say that the engine did not contain the proposed CRM fix. GPT chose the change from up to three manifest-bound UI candidates capped at 96 KB.
- Do not predict the target, feature, wording, or number of edits. Show and describe the proposal the recorded call actually returns.
- Explain the enforced envelope: one existing UI file, one to eight exact edits, no tools, no API/server/process/secret/dynamic-code/dependency authority.
- Point out “prepared”: the CRM source is still unchanged.

If using the API, select it explicitly with `--provider api`; never imply fallback.

### 1:35-1:58 — Visualize in Studio

Start Studio before installation so the Live Run page shows the real state transition. Studio is required for this submission story:

```bash
npm run studio:live -- --root ../Living-Manual-Test-Fixed/crm-workflow-lab --host-url http://127.0.0.1:3000 --port 3001 --new-session
```

- Open `http://127.0.0.1:3001/live` and show only events and lifecycle transitions that actually arrive from the validated ledger and awaited backend operations.
- Show trigger → structured model result → exact code proposal → static proof → human gate. The UI does not expose private model reasoning.
- Keep current source, proposed source, and the responding host visually distinct. A responding frame is not runtime proof until the changed UI is inspected.
- Use truthful jump cuts or acceleration for idle model/build waiting and label a removed wait. Run CRM tests off-camera; keep the public cut under 2:59.

### 1:58-2:25 — Approve and apply

After visibly reviewing the proposal:

```bash
npm run living -- approve --root ../Living-Manual-Test-Fixed/crm-workflow-lab --evolution <id> --actor hackathon-demo --artifact-hash <artifact-sha256> --proof-hash <proof-sha256> --apply
```

- Explain that this records human approval of exact hashes, then writes that same approved postimage.
- Reload/build the CRM and show the actual visible change.
- Do not call source application “success” until the running host is shown.

### 2:25-2:45 — Roll back

```bash
npm run living -- rollback --root ../Living-Manual-Test-Fixed/crm-workflow-lab --evolution <id> --actor hackathon-demo
```

Reload the CRM and show the exact original state. Show the receipt chain in terminal or Studio.

### 2:45-2:59 — Close honestly

- Codex built, reviewed and tested the system.
- GPT-5.6 interpreted real captured synthetic evidence and authored the exact proposal.
- “Today it governs one-file UI changes. It does not yet automatically measure the post-change workflow.”
- “Software that earns the right to evolve.”

## Recording gates

- [x] Independent supported-host installation, capture, privacy and removal proof exists.
- [x] Real GPT-5.6 transport proof exists.
- [ ] Fresh-clone build/test path passes from the exact video commit.
- [x] A clean generic GPT-authored source proposal is preserved in [the proof record](proof/generic-recurring-workflow-discovery.md).
- [ ] Reproduce or show that path from the exact final video commit.
- [x] The preserved cohort crosses `repeated-sequence@1.0.0`; it does not reuse historical backtracking evidence.
- [x] The preserved proposal is neither fixture-only nor hardcoded.
- [x] The preserved record includes exact approval, runtime-visible application, 112/112 CRM tests and rollback.
- [ ] The final video visibly shows approval, application and rollback.
- [ ] No automatic measurement or semantic-safety claim exceeds the implementation.
- [ ] Video is under 2:59, public without login and uses only synthetic data/licensed media.
- [ ] Audio explains both Codex and GPT-5.6.
