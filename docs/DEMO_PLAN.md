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
npm run living -- install --root ../Living-Software-Demo/crm --synthetic
```

Show the mapped-node summary and that observation is ready. Explain that installation is create-only and hash-journaled.

### 0:35-0:58 — Observe and build the matrix

- Start the independent CRM and perform 20–40 seconds of representative browser activity: inspect several leads, return to the list, optionally change a stage or schedule a follow-up, and visit another page.
- Do not rehearse a detector loop or target a known feature. There is no required three-session threshold, six-occurrence rule, countdown, scenario label, or injected signal.
- Finish on a rendered page and let the observer flush.
- Run `npm run living -- analyze --root ../Living-Software-Demo/crm`. Its compact human output must show the actual event, workflow, and session totals and confirm that the privacy-safe behavior measurements are ready for GPT-5.6.
- Explain that `analyze` builds the matrix but does not choose or gate a feature. Legacy detector diagnostics may remain in canonical JSON only.
- Explain what Living captures: routes, mapped actions, timing, friction and CSS-pixel geometry.
- State what it excludes: content, values, DOM, screenshots, secrets and persistent identity.
- Say explicitly: GPT will choose a pattern from the evidence, but that hypothesis does not prove frustration, intent, causality, or improvement.

### 0:58-1:35 — GPT invents the proposal

Run:

```bash
npm run living -- improve --root ../Living-Software-Demo/crm --provider codex
```

- Show the full-matrix evidence summary, GPT-selected pattern and interpretation, chosen file, exact GPT-authored edits, model provenance, proof result and evolution ID.
- Keep the terminal progress in frame: it reports real awaited evidence, model, source-selection, proof, and ledger milestones. It does not expose prompts or private model reasoning.
- Explain that GPT receives all verified privacy-safe event sequences and all current matrix metrics, then chooses the pattern and improvement without a fixed detector gate.
- If showing preserved detector-era evidence, label it explicitly historical and never present stored output as the result of a new model call.
- Say that the engine did not contain the proposed CRM fix. GPT chose the pattern, improvement, and change from up to three manifest-bound UI candidates capped at 96 KB.
- Do not predict the target, feature, wording, or number of edits. Show and describe the proposal the recorded call actually returns.
- Explain the enforced envelope: one existing UI file, one to eight exact edits, no tools, no API/server/process/secret/dynamic-code/dependency authority.
- Point out “prepared”: the CRM source is still unchanged.

If using the API, select it explicitly with `--provider api`; never imply fallback.

### 1:35-1:58 — Review in the terminal

- Use `living status` if needed for a clean view of the actual proposal, proof hashes, and printed next command.
- Show prepared source separately from the unchanged CRM, then use truthful jump cuts for idle waiting.
- Run CRM tests off-camera and keep the public cut under 2:59.

### 1:58-2:25 — Approve and apply

After visibly reviewing the proposal:

```bash
npm run living -- approve --root ../Living-Software-Demo/crm --evolution <id> --actor hackathon-demo --artifact-hash <artifact-sha256> --proof-hash <proof-sha256> --apply
```

- Explain that this records human approval of exact hashes, then writes that same approved postimage.
- Reload/build the CRM and show the actual visible change.
- Do not call source application “success” until the running host is shown.

### 2:25-2:45 — Roll back

```bash
npm run living -- rollback --root ../Living-Software-Demo/crm --evolution <id> --actor hackathon-demo
```

Reload the CRM and show the exact original state. Show the receipt chain in the terminal.

### 2:45-2:59 — Close honestly

- Codex built, reviewed and tested the system.
- GPT-5.6 selected a pattern from the real captured synthetic behavior matrix and authored the exact proposal.
- “Today it governs one-file UI changes. It does not yet automatically measure the post-change workflow.”
- “Software that earns the right to evolve.”

## Recording gates

- [x] Independent supported-host installation, capture, privacy and removal proof exists.
- [x] Real GPT-5.6 transport proof exists.
- [ ] Fresh-clone build/test path passes from the exact video commit.
- [x] Historical detector-era GPT-authored source proposals are preserved and labeled historical in [the proof record](proof/generic-recurring-workflow-discovery.md).
- [ ] Reproduce the AI-first full-matrix path from the exact final video commit.
- [ ] Verify the recorded `analyze` output says the matrix is ready and does not present a detector threshold as a gate.
- [ ] Verify the recorded GPT call chooses a variable pattern and feature without fixture output or a hardcoded target.
- [x] Historical records include exact approval, runtime-visible application, 112/112 CRM tests and rollback.
- [ ] The final video visibly shows approval, application and rollback.
- [ ] No automatic measurement or semantic-safety claim exceeds the implementation.
- [ ] Video is under 2:59, public without login and uses only synthetic data/licensed media.
- [ ] Audio explains both Codex and GPT-5.6.
