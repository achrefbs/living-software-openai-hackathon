# Filming script

Use a fresh copy of the separate synthetic CRM. The public video must stay under three minutes and must show behavior from the exact submitted commit. Do not rehearse a fixed GPT answer: read and show the proposal the live run actually returns.

## Before recording

Open two windows:

1. the CRM at `http://127.0.0.1:3000`;
2. a terminal in the Living Software repository.

Build once, then start the CRM in its own terminal:

```powershell
# Living Software repository
npm install
npm run build:cli

# Separate CRM repository
npm install
npm run dev
```

The terminal is the control surface for this recording. Keep CRM tests in the CRM terminal **off-camera**; they are verification, not part of the under-three-minute story.

Record a truthful edited take: keep every user action, command invocation, important output, and visible state transition, but cut or accelerate idle model/build waiting. Label a removed wait with a brief `wait removed` card. Do not claim that the edited duration is execution time.

## Record this sequence

### 1. Install and map

Say:

> This is an independently built CRM. Living Software statically maps its routes and controls, then installs a create-only observer and same-origin collector. Synthetic marks this demo data honestly.

Run:

```powershell
npm run living -- install --root ../Living-Manual-Test-Fixed/crm-workflow-lab --synthetic
```

Show the real app ID, mapped-node count, relationship count, and `observation is ready` result. Do not state fixed counts if the checked-out CRM produces different ones.

### 2. Capture two sessions and show restraint

Open `/leads` in a fresh browser tab. Complete this visible workflow twice in that tab:

```text
select a lead -> lead detail -> existing return-to-leads control -> leads list
```

Close the tab after the list renders so its final beacon flushes. Repeat the same two workflows in a second brand-new tab, then close it. Do not duplicate tabs because that can clone session state.

Run `npm run living -- analyze --root ../Living-Manual-Test-Fixed/crm-workflow-lab` and show that two independent sessions are still below the promotion threshold.

Say:

> Living has seen the sequence repeat, but two independent sessions are not enough. It has not promoted a proposal trigger.

This negative control proves the terminal is reporting actual threshold state rather than a scripted feature.

Then continue the same recording run.

### 3. Complete the evidence cohort

Open one third brand-new tab, perform the same workflow twice, wait for the list to render, and close it. The final cohort now has three independent sessions and six occurrences. There is no countdown, required pace, scenario label, or injected friction signal.

Say:

> Living sees mapped actions and route completions, not the lead names or page text. It excludes form values, DOM, screenshots, secrets, and persistent identity.


### 4. Show what the terminal discovered

Run:

```powershell
npm run living -- analyze --root ../Living-Manual-Test-Fixed/crm-workflow-lab
```

The compact human output should show the actual captured total, detector and version, case/session/occurrence support, readable sequence, exact supporting-event count, and explicit-signal count. For the preserved lead-detail proof, the detector found three cases, three sessions, six occurrences, a four-step sequence, 24 supporting events, and zero explicit technical signals. A fresh run's **total captured event count may differ**.

Say:

> The same validated evidence produces the same deterministic detection. Deterministic does not mean the workflow or fix was hardcoded. Recurrence makes this workflow reviewable; it does not prove frustration, causality, or improvement.

### 5. Let GPT-5.6 invent a bounded proposal

Run:

```powershell
npm run living -- improve --root ../Living-Manual-Test-Fixed/crm-workflow-lab --provider codex
```

Keep the terminal visible when the command starts. It reports real awaited milestones: evidence validation, both GPT-5.6 requests, Codex run IDs, bounded source selection, patch compilation, each deterministic proof check, and ledger persistence. These lines expose lifecycle state, not private model reasoning. Cut or accelerate the idle wait, then resume on the actual returned output with `wait removed` visible briefly.

Say:

> GPT-5.6 first interprets the minimized evidence. A second request sees at most three source-linked UI candidates and authors one bounded patch. GPT has no browser, terminal, source-write, approval, or rollback authority.

When the command finishes, show the proposal it **actually** produced: interpretation, target file, exact minus/plus edits, run IDs, artifact hash, proof hash, and evolution ID. Do not promise a particular file, feature, wording, or number of edits before the call. Point out `prepared`: host source is still unchanged.

### 6. Review, approve, and apply

For a clean review screen, run:

```powershell
npm run living -- status --root ../Living-Manual-Test-Fixed/crm-workflow-lab
```

Say:

> I am reviewing the exact GPT-authored artifact. Approval is bound to these artifact and proof hashes, not to a general permission.

Copy and run the exact `Next:` command printed by Living. It contains the current evolution ID and hashes:

```powershell
npm run living -- approve --root ../Living-Manual-Test-Fixed/crm-workflow-lab --evolution <printed-id> --actor hackathon-demo --artifact-hash <printed-artifact-hash> --proof-hash <printed-proof-hash> --apply
```

Show the approval receipt, preimage check, source write, postimage verification, and apply receipt. Reload the CRM and show the actual visible change.

In the separate CRM terminal, run the CRM tests off-camera and use their real result as a go/no-go check before finishing the take:

```powershell
npm test
```

Say:

> The engine wrote only the sealed postimage after exact approval. Rendering and tests verify application behavior; they do not yet prove that the workflow improved.

### 7. Roll back exactly

Copy the exact rollback command printed after application, or run:

```powershell
npm run living -- rollback --root ../Living-Manual-Test-Fixed/crm-workflow-lab --evolution <printed-id> --actor hackathon-demo
```

Show the postimage check, original-preimage restoration, hash verification, and rollback receipt. Reload the CRM and show the proposed UI is gone.

Close with:

> Codex helped build, test, and document Living Software. GPT-5.6 interpreted captured synthetic evidence and authored the proposal. Today Living governs one-file UI evolution with explicit approval and exact rollback. Automatic post-change measurement is the next step.

## Recording truth checks

- Show only the detector result and GPT proposal produced by the recorded run.
- Do not call recurrence friction, intent, causality, or measured improvement.
- Do not describe a source write as runtime proof until the changed CRM UI is visibly inspected.
- Keep synthetic data labeled synthetic.
- Keep model reasoning private; show structured interpretation and lifecycle milestones only.
- If any command fails, stop the take. Do not substitute a fixture, old output, or scripted proposal while describing it as live.
