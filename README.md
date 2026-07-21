# Living Software

> Software that earns the right to evolve.

Living Software is an OpenAI Build Week **Developer Tools** project. Install it in a supported application, exercise the product normally, and ask it to improve what it observed. Living maps the product and turns privacy-minimized route, action, outcome, timing, performance, and layout evidence into a behavior matrix. During `improve`, GPT-5.6 examines the complete verified event window, every current matrix metric, and the source-linked product map; it chooses both the evidence-supported pattern and the proposed source change. No fixed detector category or threshold gates that AI review. A human must review and approve the exact artifact before Living can write it.

GPT-5.6 authors the proposed patch; it does not receive a terminal, filesystem, browser, network tool, or permission to apply it. Living selects at most three manifest-bound UI source candidates (96 KB total), accepts a proposal for one existing UI file with one to eight exact anchor/replacement edits, and subjects it to deterministic static guards. The engine—not the model—owns hashes, receipts, source writes, no-overwrite transition checks, and rollback.

Current automatic support is deliberately bounded to **TypeScript Next.js App Router 15.3+ repositories that use `src/app`**. This is not a universal Node.js or arbitrary-framework installer.

The reference CRM and its synthetic workflow simulator are separate projects. Neither is a dependency of this repository.

## The product in four commands

From this repository, after `npm install` and `npm run build:cli`:

```bash
# 1. Discover the app and install observation files
npm run living -- install --root <next-app> --synthetic

# 2. Exercise the running app, then let GPT-5.6 interpret and author a proposal
npm run living -- improve --root <next-app> --provider codex

# 3. Review the displayed proposal, then explicitly approve and apply that exact artifact
npm run living -- approve --root <next-app> --evolution <id> --actor <operator> --artifact-hash <artifact-sha256> --proof-hash <proof-sha256> --apply

# 4. Restore the exact preimage if needed
npm run living -- rollback --root <next-app> --evolution <id> --actor <operator>
```

Use `--provider api` instead of `--provider codex` to select the Responses API explicitly. The API path requires `OPENAI_API_KEY` in the runtime environment. There is no automatic provider fallback.

`living status --root <next-app>` reports installation and evolution state. Add `--json` to any terminal-first command for canonical machine-readable output.

After exercising the app, `npm run living -- analyze --root <next-app>` verifies the evidence chain, projects privacy-safe workflow cases, and builds the event/metric matrix. Its compact human output reports captured totals and confirms that the matrix is ready for GPT-5.6; it does not choose a feature or wait for a detector threshold. `improve`, `approve`, `apply`, and `rollback` stream bounded lifecycle milestones while their real backend operations are awaited; prompts, private reasoning, and source content are not emitted as progress.

`approve --apply` is intentionally explicit: it records human approval of the current contract, artifact, and proof hashes and then applies that same approved postimage. To separate those actions, omit `--apply`, then run:

```bash
npm run living -- apply --root <next-app> --evolution <id>
```

## What works now

- Bounded, non-executing discovery of a supported Next.js application into a source-linked Product Manifest, observation runtime map, and metric catalog.
- Create-only, hash-journaled installation of a self-contained browser observer and same-origin local collector.
- Privacy-minimized route, action, performance, friction, viewport, visibility, scroll, and CSS-pixel geometry capture.
- Hash-linked, manifest-scoped local evidence plus deterministic workflow projection and a privacy-safe behavior matrix. The matrix combines the full verified route/action/outcome sequences with all current workflow, performance, friction, viewport, visibility, target-size, distance, and timing metrics. GPT-5.6—not a fixed detector—chooses one reviewable pattern and improvement hypothesis from that evidence.
- Four deterministic detector families (`repeated-sequence`, `rework-loop`, `failure-cluster`, and corroborated backtracking) remain available as diagnostics in canonical JSON and regression tests. They no longer gate `improve`, select the model's pattern, or constrain the feature it may propose.
- A terminal-first lifecycle: `install`, `improve`, `status`, `approve`, `apply`, and `rollback`.
- Explicit Codex CLI and Responses API GPT-5.6 transports with strict structured outputs and no automatic fallback.
- An evidence-bound `EvolutionBrief`, followed by a separate GPT-authored source-patch proposal.
- An authorized live CRM run through two Codex CLI requests, deterministic proof, exact-hash human approval, source application, CRM tests/build, and browser-visible rendering.
- Historical detector-era proof from a fresh separate CRM install: 144 mapped nodes, 180 edges, 79 synthetic events in 22 hash-linked records across three sessions, a four-step workflow learned from zero explicit signal events, a live GPT-5.6 proposal, 13 proof checks, exact approval/application, browser verification, 112/112 CRM tests, and exact rollback. The full historical facts are in [the generic recurring-workflow proof](docs/proof/generic-recurring-workflow-discovery.md); that threshold-gated trigger has been superseded by AI-first discovery.
- Evidence-first product context that retains evidence-linked nodes and their direct graph neighbors before deterministic lexical fill, and restricts model-cited affected nodes to that relevant set. The subsequent read-only source projection is limited to at most three eligible files, 64 KB per file and 96 KB total, selected from source provenance on those cited nodes.
- One-file patch compilation with one to eight exact, unique, non-overlapping anchor replacements; exact preimage/postimage hashes; static authority and diff guards; an append-only receipt chain; human approval requiring the exact artifact and proof hashes; capture-verify/no-overwrite application; crash recovery; and exact-postimage rollback.
- A loopback-only Living Studio Live Run control room backed by a strict durable event stream, validated evidence tailing, the behavior-matrix projection, diagnostic detector progress, real model/proof milestones, exact lifecycle commands, source hashes, and receipts.
- The existing Studio Product Map, Workflows, Opportunities, Evolution Review, Receipts, and optional Current vs Proposed comparison remain available as an explicit offline snapshot/fixture path.
- A neutral fixture and offline replay for credential-free deterministic verification.

## Honest limits

- Source discovery and installation currently support TypeScript Next.js App Router applications using `src/app`.
- `improve` sends the complete verified behavior window and all current metric values to GPT-5.6. There is no fixed minimum session count, repeated-sequence threshold, predetermined detector family, or hardcoded CRM feature. GPT's selection remains a hypothesis: captured behavior does not prove intent, causality, business value, or that the proposed change will improve outcomes.
- Patch candidates are existing `.ts`, `.tsx`, `.js`, `.jsx`, or `.css` UI files below `src/app` or `src/components`. API routes, route handlers, tests, configuration, symlinks, new files, multiple files, and dependency changes are excluded.
- Static guards reject declared server, network, process, secret, dynamic-code, raw-HTML, script, Git, and dependency authority. Passing those guards does not prove the model's idea is correct, accessible, secure in every semantic sense, or buildable.
- Applying source records an exact source transition; it is not proof that the running application hot-reloaded successfully. The operator must build or reload and inspect the host.
- Living does not automatically capture a second cohort and measure whether an applied change improved the workflow. Post-change measurement remains future work.
- The local collector and loopback Studio broker are development proof surfaces, not production multi-tenant telemetry infrastructure.

## Setup

### Verified platform

- Windows 11
- Node.js 22 or newer (current proof runtime: Node.js 24.14.1)
- npm 10 or newer

Other operating systems have not yet been verified.

Install and build:

```bash
npm install
npm run build:cli
```

### No-rebuild judge path

The repository includes the final platform-neutral JavaScript output for every
CLI package. After dependency installation, judges can run the credential-free
proof without compiling TypeScript or rebuilding Studio:

    npm ci
    npm run judge:neutral
    npm run living -- map --fixture samples/neutral-host/host-fixture.json

The judge:neutral command maps the neutral host and replays 31 explicitly
synthetic events. It exercises the preserved deterministic detector diagnostics
without calling a model or mutating another repository. Those diagnostics are
an offline regression surface, not a gate on the current AI-first `improve`
path. The preserved live artifacts and stress record demonstrate the separate
material GPT-5.6 path.

Map the included neutral descriptor:

```bash
npm run living -- map --fixture samples/neutral-host/host-fixture.json
```

For the complete offline neutral proof:

```bash
npm run demo:neutral
```

### Advanced installation controls

The terminal-first `install` command applies the declared create-only observation files. For a preview-first installation, use the compatibility commands:

```bash
npm run living -- map --root <next-app>
npm run living -- init --root <next-app> --synthetic
npm run living -- init --root <next-app> --synthetic --apply
npm run living -- doctor --root <next-app> --synthetic
```

Removal remains dry-run-first:

```bash
npm run living -- uninstall --root <next-app>
npm run living -- uninstall --root <next-app> --apply
```

Uninstall removes only unchanged generated files recorded in the install journal. It preserves modified integration files and captured evidence for review.

## How the GPT-authored patch boundary works

1. Living validates the installed app, current manifest, complete active-release evidence chain, workflow projection, and metric-report identity. It builds a privacy-safe matrix from all verified events and all current metric values.
2. GPT-5.6 examines that matrix and bounded product-map context, chooses one evidence-supported pattern and improvement hypothesis, and returns a strict `EvolutionBrief`. No deterministic detector chooses the feature first.
3. Living maps the brief's affected product nodes back to eligible source provenance and reads at most three existing UI candidates, capped at 96 KB total.
4. A second GPT-5.6 request sees only that brief and bounded candidate projection. It selects one candidate and returns one to eight exact anchor/replacement edits under a strict schema.
5. Living treats that output as untrusted. It checks target eligibility, exact preimage hash, unique non-overlapping anchors, replacement authority patterns, postimage and diff bounds, and exact evidence/model bindings.
6. A passing proposal is stored as `prepared`; the host source is still unchanged.
7. A human approves the exact contract, artifact, proof, and revision. Only then may Living's engine write the exact postimage.
8. Rollback restores the exact preimage only while the target still equals the applied postimage.

GPT can invent the UI improvement inside that envelope; no CRM-specific navigation patch is embedded in the engine or prompt.

## Living Studio

The CLI remains a complete product surface. Connected Studio visualizes the same backend operations and invokes the same governed evolution functions; it has no independent write authority.

Start Studio before Living is installed so the monitor can show the read-only map and `Host found, Living not installed` state:

```bash
npm run studio:live -- --root <next-app> --host-url http://127.0.0.1:3000 --port 3001 --new-session
```

Open `http://127.0.0.1:3001`. The server canonicalizes the startup root and binds explicitly to `127.0.0.1`. The browser cannot supply or change that root. Each launcher invocation starts a fresh durable history by default, and `--new-session` makes that choice explicit. Refresh and SSE reconnect preserve the printed session ID for the life of that run. To deliberately resume a stopped run, pass that exact safe ID as `--session-id <id>`; old session logs are retained. The Live Run page replays a validated, hash-linked local event history and then receives SSE events with monotonic IDs; reconnect uses `Last-Event-ID` and does not fabricate catch-up progress. There is no lifecycle timer polling: a validated SSE event prompts a fresh strict state projection.

Live evidence comes only from the active installed release file. Partial final records remain waiting, duplicate filesystem notices are idempotent, and truncation, replacement, deletion, symlink, chain, receipt, ledger, or source-hash failures stop the monitor visibly. Any detector cards are diagnostic projections only; they do not create or block the AI-first discovery request. Model activity appears only around real awaited calls; an exact proposal reuse is labeled as reuse.

Approval, apply, and rollback controls remain exact-identity and expected-revision bound. Source verification and the connected host response are separate: a responding frame is labeled for visual inspection and is never presented as runtime proof or measured improvement.

For an optional isolated comparison, first prepare an evolution, then create generic tracked-file copies without editing the host:

```bash
npm run preview:host -- --root <next-app> --evolution <id> --out <new-proposed-copy> --before-out <new-before-copy>
```

Run each copy on its own loopback port and restart `studio:live` with `--preview-url` and optional `--before-url`. Studio renders a frame only when the copy's identity endpoint matches the exact evolution, target path, view, and source hash. Preview is not approval, application, or runtime proof.

The static judge and regression path is still explicit and separate:

```bash
npm run studio:sync -- --root <next-app>
npm run dev --workspace @living-software/studio -- --port 3001
```

That offline path writes a validated, minimized, Git-ignored snapshot. It is labeled synthetic/offline where applicable and never silently becomes a live connection. Current/Before/Proposed frames are display-only and do not grant approval or mutation authority.

## Privacy boundary

Normal observation may record route templates, mapped action identities, performance and friction signals, viewport facts, visibility, scroll burden, and bounded CSS-pixel geometry. It excludes text, input values, keystrokes, query strings and hashes, DOM or HTML, cookies, headers, screenshots, request bodies, and persistent user or cross-tab identifiers.

The intelligence request includes privacy-safe aliases for every verified event in the active behavior window plus every current aggregate metric. It excludes raw event IDs, absolute timestamps, raw metadata, release data, and user/session/subject identifiers. The patch request necessarily contains the bounded candidate source text; use it only on code the operator is authorized to send to the selected OpenAI transport.

## Sample data

Fixtures under `samples/neutral-host` contain no real identities, messages, customers, credentials, or production telemetry. The separate CRM simulator uses synthetic records. Simulator conclusions are never an input to Living's matrix, AI discovery request, or source proposal.

The following July 21 records are historical detector-era validation. They prove generic capture, model authorship, governance, application, and rollback; their thresholds are no longer the active trigger for AI-first discovery.

The July 21 synthetic CRM capture used for the recorded GPT evolution independently produced 18 backtracking revisits across three workflows from 135 captured events under detector v1.1. That historical evidence is not a claim that every application has the same problem or needs the same patch.

The later clean generic proof used 79 synthetic events in 22 records across three independent sessions. `repeated-sequence@1.0.0` learned the four-step lead-link → detail-route → back-link → list-route pattern, counted six non-overlapping occurrences, and bound exactly 24 supporting events even though the cohort contained zero `metadata.signal` events. It proves generic recurrence discovery, not user frustration, causality, production prevalence, or measured improvement.

## Testing

```bash
npm run check
npm run typecheck
npm run test
npm run demo:neutral
```

The tests cover strict model and live-event schemas, full-window event/metric matrix construction, malicious source instructions, evidence-first context under lexical decoys, candidate path and size boundaries, exact edit compilation, prohibited authority, evidence/model binding, legacy detector diagnostics and negative controls, durable replay/SSE behavior, safe evidence tailing, command binding, lifecycle transitions, crash recovery, exact-hash application, generic preview capture, and rollback. Model calls are not required for the offline test suite.

Optional live intelligence paths:

```bash
# Saved Codex authentication
npm run demo:gpt56:cli

# Explicit Responses API selection
set OPENAI_API_KEY=<runtime-secret>
npm run demo:gpt56:api
```

The [generic recurring-workflow proof](docs/proof/generic-recurring-workflow-discovery.md) is a historical end-to-end record for detector-era sequence discovery: fresh install, exact evidence, live Codex GPT-5.6 brief and patch, governed apply, visible result, CRM tests, and exact rollback. A later rapid-sort diagnostic produced three explicit rage signals, so the then-current deterministic arbitration selected `failure-cluster`. Neither threshold is an active gate on the current AI-first path.

The same historical record includes an independent second detector-era run: 68 detector-bound events across three sessions produced a `/leads` → `/tasks` recurrence, and new GPT-5.6 calls selected `src/app/tasks/page.tsx` and authored a two-edit `Lead context` card. It passed 13 checks and 112/112 CRM tests, rendered in the browser, and rolled back exactly. The different workflow, target, and feature are evidence that the earlier label change was not embedded in the detector; neither run proves measured improvement.

The preserved [GPT-5.6 Terra proof](docs/proof/gpt56-live-codex-cli.json) demonstrates the earlier structured evidence-interpretation boundary. A [July 21 live run](docs/proof/gpt56-live-crm-source-evolution.md) records the generic path: GPT authored `Leads` to `Back to leads`, Living exact-hash approved and applied it, and the real CRM rendered the change after passing its tests and production build. Living later rolled that evolution back from the exact sealed postimage to a byte-identical preimage, closed a valid ninth receipt, and returned the CRM integration to a healthy state.

The separate historical [live stress record](docs/proof/gpt56-live-stress-evolutions.md) adds a below-threshold negative control and two different detector-era positive domains. A correction loop produced GPT-authored lead guidance in `src/app/leads/[id]/page.tsx`; an isolated rage-click cluster produced GPT-authored live sort feedback in `src/components/leads-table.tsx`. Both passed deterministic proof, exact approval/application, 112 CRM tests, a production build, browser verification, and byte-exact rollback. This proves governed source application, materially different source selection, runtime rendering, and exact restoration—not the current AI trigger or measured workflow improvement.

## Judge path

From the Living repository:

```bash
npm install
npm run build:cli
npm run test
```

Start the separate CRM. In a first terminal, connect Studio before Living is installed:

```bash
npm run studio:live -- --root ../crm-workflow-lab --host-url http://127.0.0.1:3000 --port 3001 --new-session
```

In another terminal, install Living and exercise the host using ordinary browser activity or its independent synthetic simulator. Capture representative behavior; no prescribed workflow, fixed feature, or three-session threshold is required:

```bash
npm run living -- install --root ../crm-workflow-lab --synthetic
# exercise the running host
npm run living -- analyze --root ../crm-workflow-lab
npm run living -- improve --root ../crm-workflow-lab --provider codex
npm run living -- status --root ../crm-workflow-lab
```

The `improve` command may instead be started from Live Run after selecting the explicit provider. Review the exact model-authored edits, target, proof, hashes, and optional comparison. Apply through Studio's separately confirmed approval and apply controls, or use the equivalent terminal command with the evolution ID printed by `improve`:

```bash
npm run living -- approve --root ../crm-workflow-lab --evolution <id> --actor judge-demo --artifact-hash <artifact-sha256> --proof-hash <proof-sha256> --apply
```

Reload or rebuild the CRM and verify the visible result. Then exercise the exact rollback:

```bash
npm run living -- rollback --root ../crm-workflow-lab --evolution <id> --actor judge-demo
```

Use `--provider api` only with an entrant-supplied runtime API key. Never claim runtime success or improvement measurement without showing that separate evidence.

The checked-in package distribution provides the no-rebuild terminal path.
A disposable Windows clone passed `npm ci` and `npm run judge:neutral`
without compiling TypeScript or rebuilding Studio; the exact verification
environment is recorded in [HACKATHON_COMPLIANCE.md](HACKATHON_COMPLIANCE.md).

## How Codex and GPT-5.6 are being used

Codex was used for rules review, architecture, implementation, testing, security hardening, documentation, and integration. Entrant decisions and material sessions are recorded in [DECISIONS.md](DECISIONS.md) and [BUILD_LOG.md](BUILD_LOG.md).

GPT-5.6 has two material runtime roles:

1. inspect the complete verified privacy-safe event/metric matrix, choose one evidence-supported pattern and improvement hypothesis, and express it as a structured `EvolutionBrief`;
2. inspect a small manifest-bound source projection and author the exact one-file edit proposal shown to the human.

GPT-5.6 cannot approve, apply, roll back, invoke tools, or bypass the deterministic engine. Codex CLI and Responses API transports use the same application validation boundary and preserve provider-specific provenance.

## Documentation

- [How Living Software works](docs/HOW_LIVING_SOFTWARE_WORKS.md)
- [Automatic discovery and observation](docs/AUTOMATIC_DISCOVERY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security and trust model](SECURITY.md)
- [ADR-001: AI-first discovery](docs/ADR-001-AI-FIRST-DISCOVERY.md)
- [Hackathon compliance](HACKATHON_COMPLIANCE.md)
- [Prior-work boundary](PRIOR_WORK.md)
- [Build and Codex collaboration log](BUILD_LOG.md)
- [Judging evidence map](docs/JUDGING_MAP.md)
- [Demo plan](docs/DEMO_PLAN.md)
- [Exact filming script](docs/FILMING_SCRIPT.md)
- [Generic recurring-workflow discovery proof](docs/proof/generic-recurring-workflow-discovery.md)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)

## License

Original challenge code is released under the [MIT License](LICENSE). Third-party dependencies and assets retain their own licenses.
