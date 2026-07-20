# Living Software

> Software that earns the right to evolve.

Living Software is an OpenAI Build Week **Developer Tools** project. It installs a bounded discovery and observation layer into a supported application, derives a source-linked product map, captures privacy-safe workflow and layout evidence, and turns that evidence into deterministic workflow and metric reports. GPT-5.6 may use an exact evidence bundle to draft an evolution brief for human review; it cannot change or activate the host.

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
- A read-only Living Studio with Product Map, Workflows, Opportunities, Evolutions, and Receipts routes plus empty, disconnected, and invalid-data previews. It can render either the labeled neutral fixture or a validated, gitignored static snapshot exported from an explicitly synthetic automatic-host analysis. This is a one-way file bridge, not live host ingestion; captured-snapshot Evolutions and Receipts remain visibly unconnected.
- A GPT-5.6 Responses API intelligence package that verifies evidence hashes, minimizes model context, requests a strict structured `EvolutionBrief`, revalidates references, requires human review, and forbids activation. Automated tests use an injected offline transport; a real API call and preserved evidence are still pending.

Declarative broker execution, proof, approval, activation, measurement, and rollback are intended later lifecycle work, not current functionality.

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

## Verified clean CRM rerun

The final corrected proof rescanned the separate CRM from **34 supported application files**. Its source digest is `sha256:609342b5a2d495b7bc99824a33ef2070ebb374fbef5cbdca21dbee94642ced2d`; its manifest content hash is `sha256:63d3da3f26c4eaca269f7063e75ea3db0657e7aa7d735df69ab5e6050091e265`. Discovery produced **144 nodes, 180 edges, 92 runtime locators, and 212 metric definitions**, with zero provenance from `sim`, `scripts`, `tests`, `e2e`, or generated integration files. The earlier 170-node result is retained only as a pre-boundary diagnostic, not the final product map.

The fresh smoke completed 2/2 simulator sessions with 46 simulator events and 42 actions. Living independently recorded 17 hash-linked records containing 86 events, projected two cases and two variants, computed 61 metric values, and emitted no opportunity. The added friction cohort completed 3/3 sessions with 75 simulator events and 69 actions, with no simulator retries or errors. The final Living chain contains **48 records and 224 events**, ends at `sha256:58ededd51d06ea7e3ee66af41dcaa9273059ac4722fa611c93d6d120c0a147b2`, and projects five cases, five variants, and 70 metric values. `detector.backtracking@1.1.0` emitted `opportunity.backtracking.fcf5d947adf8` for three affected cases, 17 revisits, an affected ratio of 0.6, confidence 0.74, and 17 sample references.

The current release NDJSON contains 48 lines and has SHA-256 `82B38B1032A430849FEFBD29343A53BFF36FEF9E3BAD0488C3914B94B392CF8A`. The prior 58-line release-evidence artifact was preserved byte-for-byte; its SHA-256 remains `471FF2BE4F9629F2F2247A02048974C4592FCD74724BB8C7CA22F180871D1B26`. `living doctor` remained `CONTRACTS_VALID` and `INSTALL_HEALTHY`.

The resulting `living.studio-snapshot/v1` export is synthetic-only and contains five cases, 144 mapped nodes, and 224 events. All five Studio routes were browser-verified against that gitignored snapshot. Studio still makes no live host connection or GPT-5.6 call, and its captured-snapshot Evolutions and Receipts surfaces remain unconnected.

## Testing

```bash
npm run typecheck
npm run test
npm run demo:neutral
```

After setting `OPENAI_API_KEY` in the runtime environment, the explicit live proof path is:

```bash
npm run demo:gpt56
```

That command sends the exact affected synthetic evidence bundle to GPT-5.6 and prints the validated draft plus non-model response provenance. It performs a live, billable API call; it is not part of the offline judge path. No successful live result is claimed until the run is completed and preserved.

To inspect Studio:

```bash
npm run dev:studio
```

Open <http://localhost:3000>. With no local capture, Studio reads the labeled
neutral fixture in `apps/studio/src/data/studio-fixture.json`. To render a
verified synthetic host capture instead:

```bash
npm run studio:sync -- --root <next-app>
npm run dev:studio
```

The sync command writes only the gitignored
`apps/studio/.local/studio-snapshot.json`. Studio validates that minimized
static export before rendering it. It does not connect to the host live or call
GPT-5.6, and the captured view explicitly leaves Evolution and Receipts
unconnected.

## Current architecture

```text
supported Next.js source  -> static discovery -> manifest + observation map + metrics
explicit --apply          -> generated observer + same-origin collector + hash journal
public UI activity        -> privacy-safe, hash-linked local evidence
local evidence            -> deterministic workflows + technical metrics + opportunity
synthetic local analysis  -> validated static snapshot -> read-only Living Studio
verified neutral evidence -> GPT-5.6 draft -> human review only
```

The automatic evidence path can now export a privacy-minimized, synthetic-only
snapshot for read-only Studio rendering. The bridge is a validated, gitignored
local file rather than a live connection. It is not connected to GPT-5.6 or a
governed lifecycle; the current GPT-5.6 runner consumes verified neutral replay
evidence.

The trust boundary is deliberate: the installer can create only its declared integration files, deterministic code owns evidence integrity, and the model can propose a draft but cannot grant permissions, change the host, approve, or activate anything.

## How Codex and GPT-5.6 are being used

Codex has been used for rules review, architecture, contract and package implementation, testing, documentation, and integration. Entrant decisions remain recorded in [DECISIONS.md](DECISIONS.md).

`@living-software/intelligence` targets `gpt-5.6` through the OpenAI Responses API with strict Structured Outputs, `store: false`, no tools, and a bounded, privacy-minimized evidence context. It verifies the exact event bundle before the request and rejects responses outside the GPT-5.6 family. These controls establish schema and reference integrity, not semantic truth. Before submission, the project still needs a real GPT-5.6 invocation and preserved evidence showing the resulting human-review draft.

Set `OPENAI_API_KEY` only in the runtime environment when performing that proof run. Never commit it.

## Hackathon provenance

This repository contains the Build Week implementation created after the submission period opened on **July 13, 2026 at 9:00 AM PT**. An older private research prototype informed the thesis but no source was copied into this repository. See [PRIOR_WORK.md](PRIOR_WORK.md) and [BUILD_LOG.md](BUILD_LOG.md).

The required `/feedback` Session ID from the task containing the majority of core functionality is still pending.

## Judge path

The current reproducible local judge path is:

```text
clone -> npm install -> build CLI -> tests -> neutral replay -> inspect Studio
```

These commands build the relevant packages locally. A separate prebuilt path that does not require rebuilding from scratch is not implemented. The final judge path must include that required distribution path and preserved real GPT-5.6 evidence before the Devpost submission can be considered complete.

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
