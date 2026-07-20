# Living Software

> Software that earns the right to evolve.

Living Software is an OpenAI Build Week **Developer Tools** project. It installs a bounded discovery and observation layer into a supported application, derives a source-linked product map, captures privacy-safe workflow and layout evidence, and turns that evidence into deterministic workflow and metric reports. Living verifies an exact evidence bundle locally, then GPT-5.6 may use its bounded, privacy-minimized projection to interpret the opportunity for human review. GPT-5.6 never supplies executable source or activation authority. The current governed loop can independently compile one deterministic CRM adapter, require exact-hash operator approval, apply that approved source change, and restore the exact preimage.

The current automatic adapter supports **TypeScript Next.js App Router 15.3+ repositories that use `src/app`**. Arbitrary Node applications and other frameworks are not current claims.

The standalone reference CRM and its synthetic-user simulator live in separate repositories. Neither is a dependency of this repository. The independent proof completed supported installation, runtime capture, privacy checks, and byte-preserving removal.

## What works now

- Versioned, strict JSON contracts for discovery, installation, observation, metrics, workflow evidence, opportunities, capability drafts, host interfaces, receipts, and Studio messages.
- A bounded, non-executing TypeScript/Next.js source scanner that produces a source-linked Product Manifest, observation runtime map, and metric catalog.
- Root-mode CLI commands for `map`, dry-run-first `init`, `doctor`, `analyze`, privacy-minimized `snapshot`, and dry-run-first `uninstall`.
- A create-only, hash-guarded installation transaction. Existing integration files are never overwritten, modified generated files are preserved on uninstall, and `package.json` is not edited.
- A self-contained Next.js browser observer and same-origin local collector. The observer captures routes, actions, performance, friction signals, and precise CSS-pixel geometry; the collector writes a hash-linked single-process evidence log under `.living/data/releases/<manifest-hash>/events.ndjson` so releases cannot be mixed.
- Deterministic workflow projection, technical metric analysis, and an optional threshold-based opportunity detector.
- A neutral, descriptor-driven fixture CLI and offline replay retained as a stable test path.
- Living Studio with Product Map, Workflows, Opportunities, Evolutions, and Receipts routes plus empty, disconnected, and invalid-data previews. Neutral fixture and unmatched-proof views remain read-only. An explicitly synced, synthetic captured-host snapshot may expose a loopback-only local evolution broker after Studio verifies its companion connection file and exact app, snapshot, manifest, opportunity, and event-set identity.
- A GPT-5.6 intelligence package with explicit Codex CLI and Responses API transports. Both verify evidence hashes, minimize model context, require a strict structured `EvolutionBrief`, revalidate references, require human review, and forbid activation. The live demo defaults to the authenticated Codex CLI for Build Week and can be switched to the API later without changing the application validation boundary.
- A bounded source-evolution package for `next-crm-lead-review-navigation/v1`. It accepts only a deterministic backtracking opportunity and the installed host's exact `src/app/leads/[id]/page.tsx` preimage, compiles Previous/Next lead navigation without model-generated code, emits a static proof and exact hashes, requires operator approval of those hashes, applies only to that preimage, and rolls back only the exact installed postimage.

The current slice does **not** claim support for arbitrary files, arbitrary code generation, automatic activation, or frameworks beyond the documented Next.js discovery boundary. Applying source is not runtime verification: the operator must still observe the host after its normal rebuild or hot reload. Measurement-after-change is not implemented, and a rolled-back evolution is terminal for the same evidence bundle; a new attempt requires newly captured evidence.

## Setup

### Verified platform

- Windows 11
- Node.js 22 or newer (the current proof runtime is Node.js 24.14.1)
- npm 10 or newer

Other operating systems have not yet been verified.

### Quick start

Install dependencies, build the CLI, and map the included neutral descriptor:

```bash
npm install
npm run build:cli
npm run living -- map --fixture samples/neutral-host/host-fixture.json
```

The legacy fixture command is deterministic and read-only. For the complete offline neutral proof:

```bash
npm run demo:neutral
```

## Install into a supported Next.js repository

Use an absolute or repository-relative path in place of `<next-app>`:

```bash
# Static discovery only
npm run living -- map --root <next-app>

# Preview the create-only installation; dry-run is the default
npm run living -- init --root <next-app> --synthetic

# Apply only after reviewing the preview
npm run living -- init --root <next-app> --synthetic --apply

# Validate discovery, generated bindings, and the install journal
npm run living -- doctor --root <next-app> --synthetic
```

Run the host normally and exercise its public UI. Living's generated same-origin route records evidence locally. Then analyze the captured evidence:

```bash
npm run living -- analyze --root <next-app>
```

Preview and execute removal separately:

```bash
npm run living -- uninstall --root <next-app>
npm run living -- uninstall --root <next-app> --apply
```

Installation creates only the documented integration artifacts; generated browser and collector code is self-contained and does not add a host dependency. See [Automatic discovery and observation](docs/AUTOMATIC_DISCOVERY.md) for the exact file set, capture boundary, evidence format, and rollback behavior.

## Privacy boundary

Normal observation may record route templates, mapped action identities, performance and friction signals, viewport facts, visibility, scroll burden, and bounded CSS-pixel geometry. It excludes text, input values, keystrokes, query strings and hashes, DOM or HTML, cookies, headers, screenshots, request bodies, and persistent user or cross-tab identifiers.

The current collector is a same-origin, single-process local proof surface. It is not a production, authenticated, multi-instance telemetry service.

## Sample data

The neutral fixtures under `samples/neutral-host` contain no real identities, messages, customers, credentials, or production telemetry. The separate CRM simulator data is outside this repository and is synthetic.

## Current captured CRM proof

The current synchronized proof rescanned the separate CRM from **34 supported application files**. Its source digest is `sha256:609342b5a2d495b7bc99824a33ef2070ebb374fbef5cbdca21dbee94642ced2d`; its manifest content hash is `sha256:63d3da3f26c4eaca269f7063e75ea3db0657e7aa7d735df69ab5e6050091e265`. Discovery produced **144 nodes, 180 edges, 92 runtime locators, and 212 metric definitions**, with zero provenance from `sim`, `scripts`, `tests`, `e2e`, or generated integration files.

This capture is **synthetic-only**. Living recorded 32 hash-linked records containing **135 captured events**, projected **three cases and three variants**, and detected `opportunity.backtracking.5218e55a67e8`. All three cases crossed the configured threshold, producing **18 backtracking revisits**, an affected ratio of 1.0, and deterministic confidence 0.90. The exact supporting subset contains 46 events and has event-set hash `sha256:ce97cfd6e349cd95534e3d0fa77411f2738d8b8ff65dd5ac7f42d576db0b18a5`.

The gitignored Studio snapshot and connection bind that exact app, manifest,
opportunity, event set, and snapshot. The captured CRM now has one prepared,
four-receipt source-evolution state with a passing static proof. Approval,
application, and rollback remain absent, and the target still equals its exact
preimage. Earlier five-case capture evidence remains recorded in
[BUILD_LOG.md](BUILD_LOG.md) as history; it is not the current Studio input.

## Testing

```bash
npm run typecheck
npm run test
npm run demo:neutral
```

The explicit live proof path currently defaults to an authenticated Codex CLI session:

```bash
npm run demo:gpt56
# equivalent explicit form
npm run demo:gpt56:cli
```

To preserve a sanitized, create-only proof from a clean commit:

```bash
npm run proof:gpt56:cli
```

The preserved [GPT-5.6 Terra proof](docs/proof/gpt56-live-codex-cli.json) was
recorded from clean source commit
`4c1480f220fb88283a63e160d9dc6da8c6fa82d5`. It binds the exact request,
schema, and synthetic evidence hashes to a locally validated draft. Provenance
records the `gpt-5.6-terra` transport request, Codex thread ID, and token
usage; `actualResponseModel` remains `null` because the CLI did not
authoritatively report that field.

The future API-key path is an explicit toggle with no automatic fallback:

```bash
set OPENAI_API_KEY=<runtime-secret>
npm run demo:gpt56:api
```

The runner verifies the exact synthetic bundle locally and sends only its bounded projection. Codex CLI runs use an isolated read-only temporary workspace, ephemeral session files, an explicit disable list for every installed host-capable feature surface, strict schema and stream/file caps, and fail-closed rejection of any surfaced event beyond reasoning and the final message. The API path uses `store: false` and a bounded output-token request. Both results pass the same local schema, citation, evidence-scope, and governance checks. The CLI reports a thread ID and token usage, not an API response ID or authoritative actual-response-model field. Live calls are not part of the offline judge path.

To inspect Studio:

```bash
npm run dev:studio
```

Open <http://localhost:3000>. With no local capture, Studio reads the labeled
neutral fixture in `apps/studio/src/data/studio-fixture.json`. To render a
verified synthetic host capture instead:

```bash
npm run studio:sync -- --root <next-app>
npm run dev --workspace @living-software/studio -- --port 3001
```

The sync command writes a gitignored, minimized
`apps/studio/.local/studio-snapshot.json` and its exact
`studio-connection.json` binding. Studio rejects a mismatched pair. Evolution
Review projects the committed `living.gpt56-proof/v2` artifact through the
public strict contract in the neutral fixture path. During a connected CRM
decision flow, Studio hides that unrelated proof so it cannot be mistaken for
the active proposal; it remains display-only and grants no lifecycle authority.

For the bounded captured-host loop, start the host normally and optionally give
Studio a human-facing link to the lead under review:

```powershell
$env:LIVING_STUDIO_HOST_URL="http://127.0.0.1:3000/leads/lead-01"
$env:LIVING_STUDIO_PREVIEW_URL="http://127.0.0.1:3002/leads/lead-01"
npm run dev --workspace @living-software/studio -- --port 3001
```

Open `http://127.0.0.1:3001/apps/<app-id>/evolutions` and use the controls in
order:

1. **Prepare** calls the explicitly selected GPT-5.6 transport (authenticated
   Codex CLI or Responses API) for an evidence-bound interpretation. In a
   separate deterministic step, Living compiles its only eligible adapter and
   a static proof without editing the host.
2. **Approve** requires an operator label and confirmation of the exact
   artifact and proof hashes shown in Studio. The label is audit metadata, not
   authenticated identity, and model output cannot satisfy this step.
3. **Apply to CRM source** writes only the approved
   `src/app/leads/[id]/page.tsx` postimage when the on-disk bytes still match
   the approved preimage. This records source application, not runtime success.
4. Reload the host after its normal hot reload or rebuild and verify the new
   Previous/Next controls manually.
5. **Roll back exact source** restores only the approved preimage while the
   target still matches the exact installed postimage. Rollback also requires
   an operator receipt label, including after a Studio reload.

Evolution Review puts the truthful trigger boundary and the phase-specific
next action above the interpretation and technical proof. In the current MVP,
observation runs automatically while the instrumented CRM is exercised, but
`living analyze` and `studio:sync` are explicit operator commands. Prepare,
Approve, Apply, and Rollback are separate human-triggered commands.

Create the optional isolated preview from the prepared ledger without editing
the CRM:

```powershell
npm run preview:crm -- --root ..\crm-workflow-lab --out C:\tmp\living-crm-preview
Set-Location C:\tmp\living-crm-preview
npm install
npm run build
npm run start -- --hostname 127.0.0.1 --port 3002
```

The generator requires clean tracked CRM files, copies only Git-tracked files
to a new nonexistent output path, verifies the connected preimage, writes the
exact prepared postimage, and generates an identity route that recomputes the
target SHA-256 on every request. It never edits the connected CRM and never
deletes or overwrites an existing preview directory.

After **Prepare**, open
`http://127.0.0.1:3001/apps/<app-id>/compare` to inspect the unchanged host and
an optional isolated postimage server side by side. The left frame is the real
host named by `LIVING_STUDIO_HOST_URL`; the right frame is a separate process
named by `LIVING_STUDIO_PREVIEW_URL`. Studio reads lifecycle identity and
renders both URLs only when the preview's strict `GET /api/living-preview`
identity matches the current evolution ID and postimage hash. Missing, stale,
or modified target postimages fail closed. Studio also re-hashes the connected target and
hides both frames unless it still matches the prepared preimage. The comparison
page has no mutation controls. Starting or viewing a preview does not approve
the artifact, edit the connected host, or prove runtime activation. Only the
exact **Approve** then **Apply to CRM source** path above can change the
connected source.

Current local checkpoint (July 20, 2026): the authenticated Codex CLI Prepare
step completed for the synthetic CRM capture as thread
`019f7fc2-e97a-74f2-8705-ea02ef4bb517`. Studio produced prepared evolution
`evolution.source.7f3455d8686daf440c10fcdf`, artifact
`sha256:09261a230f93d5f34a53871000b902ffe2ec72aed812ed177619b57e0b334e3e`,
and static proof
`sha256:e215a0ae94b8cf259e339129810c8d878ca9254fb6769f3c16a9ae96e9860757`.
The proof passed, but approval and application remain null and the CRM target
still matches preimage
`sha256:e37b5c1bb7fe8665fd2d4dd313859e5cfa86256d1040afd07ade3117dfb1d5ab`.
An isolated server on port 3002 renders the exact prepared postimage
`sha256:d9ad4fa089148098d345fc5588b0eb12b91e9c7ca94996e9392f7cb2785624af`
for comparison only; the connected CRM on port 3000 remains the preimage.
This gitignored local state is a reproducible demo checkpoint, not a committed
substitute for the separate sanitized neutral proof artifact.

The broker binds to loopback and is enabled by default only in development.
`LIVING_STUDIO_EVOLUTION_ENABLED=1` is an explicit outside-development
override, not a deployment recommendation. A rolled-back lifecycle cannot be
prepared again for the same evidence. Recapture and resync to start from new
evidence. Living does not yet measure the post-change workflow automatically.

## Current architecture

```text
supported Next.js source  -> static discovery -> manifest + observation map + metrics
explicit --apply          -> generated observer + same-origin collector + hash journal
public UI activity        -> privacy-safe, hash-linked local evidence
local evidence            -> deterministic workflows + technical metrics + opportunity
synthetic local analysis  -> validated snapshot + exact connection -> Living Studio
exact opportunity         -> GPT-5.6 interpretation -> proposal only
same exact evidence       -> deterministic one-file adapter -> artifact + static proof
operator approves hashes  -> exact source apply -> separate manual runtime verification
exact installed postimage -> explicit operator rollback -> exact preimage
committed neutral proof   -> separate Studio model-run panel -> no authority
```

The automatic evidence path can now export a privacy-minimized, synthetic-only
snapshot and connection for Studio. This is not continuous live-event
ingestion: new host evidence requires another analysis and sync. The committed
neutral GPT-5.6 proof remains a separate display artifact. The local broker
accepts a captured-host command only after fail-closed app, snapshot, manifest,
opportunity, event-set, evolution, revision, artifact, and proof identity
checks appropriate to that transition.

The detector also carries the exact supporting subset across the collector and
CLI boundary. For the current CRM capture, 46 of 135 captured events support
the opportunity. Control and unrelated events are excluded from model context;
the full set, tampered counts, or a stale visible snapshot are rejected before
the model transport is constructed.

The trust boundary is deliberate: the installer can create only its declared
integration files, deterministic code owns evidence integrity and the only
source transform, and GPT-5.6 can interpret evidence but cannot generate the
patch, grant permissions, approve, or activate it. Operator-approved source
application is recorded separately from runtime verification. Rollback is
exact, and automatic post-change measurement remains future work.

## How Codex and GPT-5.6 are being used

Codex has been used for rules review, architecture, discovery and lifecycle
contracts, implementation, adversarial review, testing, documentation, and
integration. For the current slice, Codex implemented the exact connection
boundary, local broker, deterministic one-file adapter, receipt chain,
compare-and-swap lifecycle transitions, source transaction recovery, and
Studio controls. The entrant chose the narrow CRM workflow, the separation of
model interpretation from source compilation, the exact-hash approval gate,
and explicit rollback. Entrant decisions remain recorded in
[DECISIONS.md](DECISIONS.md).

`@living-software/intelligence` targets the GPT-5.6 family through one of two explicit transports. The Build Week command currently uses saved Codex CLI authentication and pins `gpt-5.6-terra` (GPT-5.6 Terra), medium reasoning, an isolated read-only temporary workspace, ignored user/project instructions, an explicit disable list for installed host-capable features, ephemeral session files, strict output schema, bounded streams/files, and fail-closed JSONL inspection. The Responses API transport remains available and requests `gpt-5.6` with strict Structured Outputs, `store: false`, no requested tools, and `OPENAI_API_KEY` read only at send time. There is no automatic fallback between them. Both consume the same bounded, privacy-minimized context and apply the same deterministic validation after generation. Provenance records both the logical GPT-5.6 boundary and the exact transport-requested model. GPT-5.6 explains the evidence-bound opportunity, risks, limits, and success criteria; it does not choose or generate the source patch. These controls establish schema and reference integrity, not semantic truth.

Never commit an API key or Codex authentication files.

## Hackathon provenance

This repository contains the Build Week implementation created after the submission period opened on **July 13, 2026 at 9:00 AM PT**. An older private research prototype informed the thesis but no source was copied into this repository. See [PRIOR_WORK.md](PRIOR_WORK.md) and [BUILD_LOG.md](BUILD_LOG.md).

The required `/feedback` Session ID from the task containing the majority of core functionality is still pending.

## Judge path

The independent reference host is public at
[achrefbs/crm-workflow-lab](https://github.com/achrefbs/crm-workflow-lab).
The tested clean-host revision is `843331c`. Clone it as a sibling of this
repository; generated Living instrumentation is intentionally absent from the
CRM commit and is created only by the explicit installer:

```bash
git clone https://github.com/achrefbs/crm-workflow-lab.git ../crm-workflow-lab
git -C ../crm-workflow-lab checkout 843331c
npm --prefix ../crm-workflow-lab install
npm --prefix ../crm-workflow-lab exec -- playwright install chromium

npm install
npm run build:packages
npm run test
npm run living -- init --root ../crm-workflow-lab --synthetic --apply
npm run living -- doctor --root ../crm-workflow-lab --synthetic
```

Start the installed CRM in one terminal:

```bash
npm --prefix ../crm-workflow-lab run dev
```

Drive the current three-case synthetic friction proof in another terminal:

```bash
npm --prefix ../crm-workflow-lab run sim:ui -- --scenario friction --cases 3 --seed 202 --target http://127.0.0.1:3000
```

Then analyze, bind the exact snapshot to Studio, and start the local UI:

```bash
npm run living -- analyze --root ../crm-workflow-lab
npm run studio:sync -- --root ../crm-workflow-lab
npm run dev --workspace @living-software/studio -- --port 3001
```

Open `http://127.0.0.1:3001/apps/crm-workflow-lab/evolutions`. Preparing an
interpretation requires either the authenticated Codex CLI or an explicitly
selected Responses API key. The operator must review the model interpretation,
independent
deterministic diff, static proof, and exact hashes before approval. Source
application is never automatic; verify the CRM runtime separately, exercise
exact rollback, and finally remove generated observation files with
`npm run living -- uninstall --root ../crm-workflow-lab --apply` if desired.

This source judge path still builds the relevant packages locally. A separate
prebuilt distribution that avoids rebuilding is not implemented, so the final
submission gate remains open.

## Documentation

- [Automatic discovery and observation](docs/AUTOMATIC_DISCOVERY.md)
- [Hackathon compliance](HACKATHON_COMPLIANCE.md)
- [Prior-work boundary](PRIOR_WORK.md)
- [Build and Codex collaboration log](BUILD_LOG.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Product map](docs/PRODUCT_MAP.md)
- [Judging evidence map](docs/JUDGING_MAP.md)
- [Demo plan](docs/DEMO_PLAN.md)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)
- [Security and trust model](SECURITY.md)

## License

Original challenge code is released under the [MIT License](LICENSE). Third-party dependencies and assets retain their own licenses.
