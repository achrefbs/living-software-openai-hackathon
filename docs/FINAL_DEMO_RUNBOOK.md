# Final 30-minute demo runbook

Use the clean host at `..\Living-Software-Final-Demo\crm`. Do not use Studio.
Keep the final video under 2:59.

## Window setup

- PowerShell A: `C:\Users\acera\Desktop\Hackathon\living-software-openai-hackathon`
- PowerShell B: `C:\Users\acera\Desktop\Hackathon\Living-Software-Final-Demo\crm`
- Chrome: `http://127.0.0.1:3002/leads`

## Clip 1 — install Living Software

PowerShell A:

```powershell
Set-Location 'C:\Users\acera\Desktop\Hackathon\living-software-openai-hackathon'
npm run living -- install --root ..\Living-Software-Final-Demo\crm --synthetic
```

Expected: `Living Software is installed and observation is ready`, with 144
mapped nodes and 180 relationships.

Voiceover: “Living Software installs into an existing Node application. It
maps the product and adds privacy-safe workflow observation.”

## Start the clean CRM

PowerShell B:

```powershell
Set-Location 'C:\Users\acera\Desktop\Hackathon\Living-Software-Final-Demo\crm'
npm run dev -- --hostname 127.0.0.1 -p 3002
```

Open `http://127.0.0.1:3002/leads` in Chrome.

## Clip 2 — create the real workflow evidence

Repeat these four cases. Press Ctrl+R at the beginning of each case so each
case is a separate anonymous session.

1. Search `Maya Whitfield`, open the lead, click the plain company name once,
   open **Companies**, search `Juniper Retail Group`, then return to **Leads**.
2. Search `Ethan Kavanagh`, open the lead, click the plain company name once,
   open **Companies**, search `Evergreen Energy`, then return to **Leads**.
3. Search `Noah Delgado`, open the lead, click the plain company name once,
   open **Companies**, search `Northwind Analytics`, then return to **Leads**.
4. Search `Isabella Moreau`, open the lead, click the plain company name once,
   open **Companies**, search `Brightpath Logistics`, then return to **Leads**.

On a narrow screen, use the top-right menu to reach Leads and Companies.

Voiceover: “The company name on a lead is not linked. I repeatedly leave the
lead, open Companies, and search for the same account. Living Software records
the route, action, timing, and layout signals—not the text I type.”

## Clip 3 — show what was captured

PowerShell A:

```powershell
npm run living -- analyze --root ..\Living-Software-Final-Demo\crm
```

Expected: captured events, workflows, sessions, and a privacy-safe behavior
matrix. The output must say that `analyze` builds the matrix and GPT makes the
decision during `improve`.

Voiceover: “There is no predefined feature rule. This matrix is the evidence
GPT receives.”

## Clip 4 — let GPT choose and write the change

```powershell
npm run living -- improve --root ..\Living-Software-Final-Demo\crm --provider codex
```

Keep recording while the terminal shows the real Codex run IDs, source
selection, patch preview, and proof checks.

Voiceover: “GPT examines the full behavior matrix, chooses the problem, reads
bounded source files, and authors one proposed source change. It still cannot
approve or apply its own code.”

Important: GPT may choose a different valid improvement. Show its real result;
do not claim it was forced to add a company link.

## Clip 5 — approve and apply

Copy the exact command printed below `Next:` and run it. It will look like:

```powershell
npm run living -- approve --root "..." --evolution "..." --actor hackathon-demo --artifact-hash "sha256:..." --proof-hash "sha256:..." --apply
```

Expected: exact hashes approved, postimage written, and source transition
verified.

Voiceover: “The human approves the exact artifact and proof hashes. Only then
does Living Software write the GPT-authored postimage.”

## Clip 6 — show the real CRM change

Reload Chrome. Open the route named by the proposal and show the changed UI.
Then show the source diff in PowerShell B:

```powershell
git diff --stat
git diff
```

Voiceover: “This is the same CRM, now running the approved source change. The
repository diff and audit ledger prove what changed.”

## If something goes wrong

- `analyze` shows too little evidence: perform two more full cases, close the
  CRM tab once to flush the last session, reopen it, then analyze again.
- GPT chooses another feature: use the honest feature it chose.
- Port 3002 is occupied: use `-p 3003` and open port 3003.
- Never edit the proposal or hashes by hand. Copy the exact `Next:` command.

## Submission critical path

1. Finish and upload a public YouTube video under 2:59 with voiceover.
2. Run `/feedback` in the primary Codex build session and copy the real Session ID.
3. In Devpost, add the video URL, Session ID, country/type, technologies, and
   exactly one category: **Developer Tools**.
4. Click the final OpenAI Build Week submit button and verify **Submitted**.
5. The project is currently only published, not submitted. Do not spend the
   remaining time rerunning the full test suite.
