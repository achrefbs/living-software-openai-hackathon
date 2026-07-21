# Living Software

> Software that earns the right to evolve.

Living Software is an OpenAI Build Week **Developer Tools** project. Install it in a supported application, exercise the product normally, and ask it to improve what it observed. Living maps the product, records privacy-minimized workflow and layout evidence, detects repeated friction, and gives GPT-5.6 a bounded opportunity to propose a source change. A human must review and approve the exact artifact before Living can write it.

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

`approve --apply` is intentionally explicit: it records human approval of the current contract, artifact, and proof hashes and then applies that same approved postimage. To separate those actions, omit `--apply`, then run:

```bash
npm run living -- apply --root <next-app> --evolution <id>
```

## What works now

- Bounded, non-executing discovery of a supported Next.js application into a source-linked Product Manifest, observation runtime map, and metric catalog.
- Create-only, hash-journaled installation of a self-contained browser observer and same-origin local collector.
- Privacy-minimized route, action, performance, friction, viewport, visibility, scroll, and CSS-pixel geometry capture.
- Hash-linked, manifest-scoped local evidence plus deterministic workflow projection, technical metrics, and threshold-based opportunities. Corrections can produce a `rework-loop`; dead/rage clicks can produce a `failure-cluster`; each requires at least three affected cases. Backtracking v1.2 requires at least three cases with two revisits each plus a technical signal or failed/abandoned event in every affected case.
- A terminal-first lifecycle: `install`, `improve`, `status`, `approve`, `apply`, and `rollback`.
- Explicit Codex CLI and Responses API GPT-5.6 transports with strict structured outputs and no automatic fallback.
- An evidence-bound `EvolutionBrief`, followed by a separate GPT-authored source-patch proposal.
- An authorized live CRM run through two Codex CLI requests, deterministic proof, exact-hash human approval, source application, CRM tests/build, and browser-visible rendering.
- Evidence-first product context that retains evidence-linked nodes and their direct graph neighbors before deterministic lexical fill, and restricts model-cited affected nodes to that relevant set. The subsequent read-only source projection is limited to at most three eligible files, 64 KB per file and 96 KB total, selected from source provenance on those cited nodes.
- One-file patch compilation with one to eight exact, unique, non-overlapping anchor replacements; exact preimage/postimage hashes; static authority and diff guards; an append-only receipt chain; human approval requiring the exact artifact and proof hashes; capture-verify/no-overwrite application; crash recovery; and exact-postimage rollback.
- Living Studio surfaces for Product Map, Workflows, Opportunities, Evolution Review, Receipts, and optional Current vs Proposed comparison.
- A neutral fixture and offline replay for credential-free deterministic verification.

## Honest limits

- Source discovery and installation currently support TypeScript Next.js App Router applications using `src/app`.
- Automatic proposal triggers are limited to the configured, threshold-passing `rework-loop`, `failure-cluster`, or corroborated backtracking opportunity selected by deterministic arbitration. Other captured layout, performance, and workflow metrics remain evidence; they are not automatically converted into proposals.
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
synthetic events. Its current backtracking v1.2 opportunity requires three
affected cases, two revisits per case, and an allowlisted correction signal in
every affected case. It does not call a model or mutate another repository.
The preserved live artifacts and stress record demonstrate the separate
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

1. Living validates the installed app, current manifest, evidence chain, detected opportunity, and exact supporting event set.
2. GPT-5.6 produces a strict evidence-bound `EvolutionBrief`.
3. Living maps the brief's affected product nodes back to eligible source provenance and reads at most three existing UI candidates, capped at 96 KB total.
4. A second GPT-5.6 request sees only that brief and bounded candidate projection. It selects one candidate and returns one to eight exact anchor/replacement edits under a strict schema.
5. Living treats that output as untrusted. It checks target eligibility, exact preimage hash, unique non-overlapping anchors, replacement authority patterns, postimage and diff bounds, and exact evidence/model bindings.
6. A passing proposal is stored as `prepared`; the host source is still unchanged.
7. A human approves the exact contract, artifact, proof, and revision. Only then may Living's engine write the exact postimage.
8. Rollback restores the exact preimage only while the target still equals the applied postimage.

GPT can invent the UI improvement inside that envelope; no CRM-specific navigation patch is embedded in the engine or prompt.

## Living Studio

The CLI is the primary product surface. Studio visualizes the same captured product map, workflows, opportunity, GPT proposal, proof, and receipts.

After capturing evidence:

```bash
npm run studio:sync -- --root <next-app>
npm run dev --workspace @living-software/studio -- --port 3001
```

Open `http://127.0.0.1:3001`. The sync step writes a validated, minimized, Git-ignored snapshot and exact local connection. Re-run it after new evidence; Studio is not continuous live ingestion in this MVP.

The connected Evolution Review can invoke the same explicit provider choices and lifecycle engine through a loopback-only development broker. The CLI remains sufficient for install, proposal, status, approval, application, and rollback. A Current vs Proposed view is display-only and does not grant approval or mutation authority.

## Privacy boundary

Normal observation may record route templates, mapped action identities, performance and friction signals, viewport facts, visibility, scroll burden, and bounded CSS-pixel geometry. It excludes text, input values, keystrokes, query strings and hashes, DOM or HTML, cookies, headers, screenshots, request bodies, and persistent user or cross-tab identifiers.

The intelligence request excludes raw event IDs, source provenance unrelated to affected nodes, event metadata, release data, and user/session/subject identifiers. The patch request necessarily contains the bounded candidate source text; use it only on code the operator is authorized to send to the selected OpenAI transport.

## Sample data

Fixtures under `samples/neutral-host` contain no real identities, messages, customers, credentials, or production telemetry. The separate CRM simulator uses synthetic records. Simulator conclusions are never an input to Living's discovery or detector.

The July 21 synthetic CRM capture used for the recorded GPT evolution independently produced 18 backtracking revisits across three workflows from 135 captured events under detector v1.1. That historical evidence is not a claim that every application has the same problem or needs the same patch. Current backtracking v1.2 additionally requires per-case technical-signal or failed/abandoned corroboration.

## Testing

```bash
npm run check
npm run typecheck
npm run test
npm run demo:neutral
```

The tests cover strict model schemas, malicious source instructions, evidence-first context under lexical decoys, candidate path and size boundaries, exact edit compilation, prohibited authority, evidence/model binding, detector thresholds and negative controls, lifecycle transitions, crash recovery, exact-hash application, and rollback. Model calls are not required for the offline test suite.

Optional live intelligence paths:

```bash
# Saved Codex authentication
npm run demo:gpt56:cli

# Explicit Responses API selection
set OPENAI_API_KEY=<runtime-secret>
npm run demo:gpt56:api
```

The preserved [GPT-5.6 Terra proof](docs/proof/gpt56-live-codex-cli.json) demonstrates the earlier structured evidence-interpretation boundary. A [July 21 live run](docs/proof/gpt56-live-crm-source-evolution.md) records the generic path: GPT authored `Leads` to `Back to leads`, Living exact-hash approved and applied it, and the real CRM rendered the change after passing its tests and production build. Living later rolled that evolution back from the exact sealed postimage to a byte-identical preimage, closed a valid ninth receipt, and returned the CRM integration to a healthy state.

The separate [live stress record](docs/proof/gpt56-live-stress-evolutions.md) adds a below-threshold negative control and two different positive domains. A correction loop produced GPT-authored lead guidance in `src/app/leads/[id]/page.tsx`; an isolated rage-click cluster produced GPT-authored live sort feedback in `src/components/leads-table.tsx`. Both passed deterministic proof, exact approval/application, 112 CRM tests, a production build, browser verification, and byte-exact rollback. This proves governed source application, materially different source selection, runtime rendering, and exact restoration—not measured workflow improvement. Reproduction from the exact final submission commit remains a submission gate.

## Judge path

From the Living repository:

```bash
npm install
npm run build:cli
npm run test
npm run living -- install --root ../crm-workflow-lab --synthetic
```

Start the separate CRM and exercise it using ordinary browser activity or its independent synthetic simulator. Then run:

```bash
npm run living -- improve --root ../crm-workflow-lab --provider codex
npm run living -- status --root ../crm-workflow-lab
npm run studio:sync -- --root ../crm-workflow-lab
npm run dev --workspace @living-software/studio -- --port 3001
```

Review the exact model-authored edits, target, proof, hashes, and Studio comparison. Use the evolution ID printed by `improve`:

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

1. interpret an exact, privacy-minimized workflow opportunity as a structured `EvolutionBrief`;
2. inspect a small manifest-bound source projection and author the exact one-file edit proposal shown to the human.

GPT-5.6 cannot approve, apply, roll back, invoke tools, or bypass the deterministic engine. Codex CLI and Responses API transports use the same application validation boundary and preserve provider-specific provenance.

## Documentation

- [How Living Software works](docs/HOW_LIVING_SOFTWARE_WORKS.md)
- [Automatic discovery and observation](docs/AUTOMATIC_DISCOVERY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security and trust model](SECURITY.md)
- [Hackathon compliance](HACKATHON_COMPLIANCE.md)
- [Prior-work boundary](PRIOR_WORK.md)
- [Build and Codex collaboration log](BUILD_LOG.md)
- [Judging evidence map](docs/JUDGING_MAP.md)
- [Demo plan](docs/DEMO_PLAN.md)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)

## License

Original challenge code is released under the [MIT License](LICENSE). Third-party dependencies and assets retain their own licenses.
