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
npm run living -- install --root ../Living-Software-Demo/crm --synthetic
```

Show the real app ID, mapped-node count, relationship count, and `observation is ready` result. Do not state fixed counts if the checked-out CRM produces different ones.

### 2. Create representative behavior

Open `/leads` in a fresh browser tab and use the CRM naturally for 20–40 seconds. A simple take can include:

```text
open two or three leads -> return to the list -> optionally change a stage or schedule a follow-up -> visit another CRM page
```

Use one or more fresh tabs if useful, and wait for each page to render before the next action. Do not perform a prescribed loop for the detector: there is no fixed workflow or feature the system is trying to force.

There is no below-threshold checkpoint. The active AI-first path can review the verified behavior window without three sessions, six occurrences, a countdown, or an injected friction signal.

Say:

> I am creating ordinary product behavior. Living records mapped actions, routes, timing, and layout facts—not the text or customer data on the screen.

The proposal may vary because GPT-5.6 will choose the pattern from the evidence actually captured.

Finish on a rendered page before returning to the terminal.

### 3. Flush the evidence

Close the final activity tab after its last page renders, or navigate once more and wait briefly, so the observer can flush its final same-origin batch. Keep the main CRM tab open for the later before/after view.

Say:

> Living sees mapped actions and route completions, not the lead names or page text. It excludes form values, DOM, screenshots, secrets, and persistent identity.


### 4. Build the privacy-safe behavior matrix

Run:

```powershell
npm run living -- analyze --root ../Living-Software-Demo/crm
```

The compact human output should show the actual event, workflow, and session totals and confirm that privacy-safe behavior measurements are ready for GPT-5.6. It should also state that `analyze` does not choose or gate a feature. Legacy detector diagnostics may remain in `--json`, but they are not part of the active decision.

Say:

> Analyze built the evidence matrix; it did not choose a feature. GPT-5.6 will inspect all verified event sequences and all current metrics, then choose one pattern and improvement hypothesis itself.

### 5. Let GPT-5.6 invent a bounded proposal

Run:

```powershell
npm run living -- improve --root ../Living-Software-Demo/crm --provider codex
```

Keep the terminal visible when the command starts. It reports real awaited milestones: evidence validation, both GPT-5.6 requests, Codex run IDs, bounded source selection, patch compilation, each deterministic proof check, and ledger persistence. These lines expose lifecycle state, not private model reasoning. Cut or accelerate the idle wait, then resume on the actual returned output with `wait removed` visible briefly.

Say:

> GPT-5.6 first examines the complete privacy-safe event and metric matrix and chooses the pattern and improvement. A second request sees at most three source-linked UI candidates and authors one bounded patch. GPT has no browser, terminal, source-write, approval, or rollback authority.

When the command finishes, show the proposal it **actually** produced: interpretation, target file, exact minus/plus edits, run IDs, artifact hash, proof hash, and evolution ID. Do not promise a particular file, feature, wording, or number of edits before the call. Point out `prepared`: host source is still unchanged.

### 6. Review, approve, and apply

For a clean review screen, run:

```powershell
npm run living -- status --root ../Living-Software-Demo/crm
```

Say:

> I am reviewing the exact GPT-authored artifact. Approval is bound to these artifact and proof hashes, not to a general permission.

Copy and run the exact `Next:` command printed by Living. It contains the current evolution ID and hashes:

```powershell
npm run living -- approve --root ../Living-Software-Demo/crm --evolution <printed-id> --actor hackathon-demo --artifact-hash <printed-artifact-hash> --proof-hash <printed-proof-hash> --apply
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
npm run living -- rollback --root ../Living-Software-Demo/crm --evolution <printed-id> --actor hackathon-demo
```

Show the postimage check, original-preimage restoration, hash verification, and rollback receipt. Reload the CRM and show the proposed UI is gone.

Close with:

> Codex helped build, test, and document Living Software. GPT-5.6 chose a pattern from the captured synthetic behavior matrix and authored the proposal. Today Living governs one-file UI evolution with explicit approval and exact rollback. Automatic post-change measurement is the next step.

## Recording truth checks

- Show only the matrix summary and GPT proposal produced by the recorded run.
- Do not claim GPT's selected pattern proves friction, intent, causality, or measured improvement.
- Do not describe a source write as runtime proof until the changed CRM UI is visibly inspected.
- Keep synthetic data labeled synthetic.
- Keep model reasoning private; show structured interpretation and lifecycle milestones only.
- If any command fails, stop the take. Do not substitute a fixture, old output, or scripted proposal while describing it as live.
