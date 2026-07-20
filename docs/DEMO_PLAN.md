# Demo plan

The public YouTube video must be under three minutes, include audio, and show behavior reproduced from the exact submission commit.

## Target cut

### 0:00-0:15 — Promise and boundary

- “Install Living Software, use your app, and let it propose an improvement from the workflow it observed.”
- State current support: TypeScript Next.js App Router 15.3+ using `src/app`.
- State the trust line: GPT authors the proposal; a human and deterministic engine control source writes.

### 0:15-0:35 — Install

Run:

```bash
npm run living -- install --root ../crm-workflow-lab --synthetic
```

Show the mapped-node summary and that observation is ready. Explain that installation is create-only and hash-journaled.

### 0:35-0:58 — Observe

- Start the independent CRM and exercise its UI with the simulator or visible browser actions.
- Explain what Living captures: routes, mapped actions, timing, friction and CSS-pixel geometry.
- State what it excludes: content, values, DOM, screenshots, secrets and persistent identity.

### 0:58-1:35 — GPT invents the proposal

Run:

```bash
npm run living -- improve --root ../crm-workflow-lab --provider codex
```

- Show the detected evidence, interpretation, chosen file, exact GPT-authored edits, model provenance, proof result and evolution ID.
- Say that the engine did not contain the proposed CRM fix. GPT chose the change from up to three manifest-bound UI candidates capped at 96 KB.
- Explain the enforced envelope: one existing UI file, one to eight exact edits, no tools, no API/server/process/secret/dynamic-code/dependency authority.
- Point out “prepared”: the CRM source is still unchanged.

If using the API, select it explicitly with `--provider api`; never imply fallback.

### 1:35-1:58 — Visualize in Studio

Run `studio:sync`, open Evolution Review, then Current vs Proposed if the verified preview is available.

- Show trigger -> model reasoning -> exact code proposal -> static proof -> human gate.
- Keep the unchanged host and proposal visually distinct.
- Do not describe the preview as approval, application or runtime proof.

### 1:58-2:25 — Approve and apply

After visibly reviewing the proposal:

```bash
npm run living -- approve --root ../crm-workflow-lab --evolution <id> --actor demo --artifact-hash <artifact-sha256> --proof-hash <proof-sha256> --apply
```

- Explain that this records human approval of exact hashes, then writes that same approved postimage.
- Reload/build the CRM and show the actual visible change.
- Do not call source application “success” until the running host is shown.

### 2:25-2:45 — Roll back

```bash
npm run living -- rollback --root ../crm-workflow-lab --evolution <id> --actor demo
```

Reload the CRM and show the exact original state. Show the receipt chain in terminal or Studio.

### 2:45-2:59 — Close honestly

- Codex built, reviewed and tested the system.
- GPT-5.6 interpreted real evidence and authored the exact proposal.
- “Today it governs one-file UI changes. It does not yet automatically measure the post-change workflow.”
- “Software that earns the right to evolve.”

## Recording gates

- [x] Independent supported-host installation, capture, privacy and removal proof exists.
- [x] Real GPT-5.6 transport proof exists.
- [ ] Fresh-clone build/test path passes from the exact video commit.
- [ ] Live generic GPT-authored source proposal is recorded from that commit.
- [ ] Proposal shown in the video is not fixture-only or hardcoded.
- [ ] Exact approval, runtime-visible application and rollback are shown.
- [ ] No automatic measurement or semantic-safety claim exceeds the implementation.
- [ ] Video is under 2:59, public without login and uses only synthetic data/licensed media.
- [ ] Audio explains both Codex and GPT-5.6.
