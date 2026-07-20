# Automatic discovery and observation

## Objective

Prove that Living Software can enter an independently built application, derive a source-linked product map without executing host code, install a bounded observer through a supported framework hook, capture privacy-safe workflow and layout evidence, compute technical metrics, and remove itself without damaging the host.

The first supported slice is **TypeScript Next.js App Router 15.3+**. The architecture is adapter-based, but arbitrary Node applications are not a current claim.

## End-to-end flow

```text
existing Next.js repository
  -> bounded static scanner
  -> Product Manifest + runtime locator map + metric catalog
  -> explicit hash-guarded install
  -> Next instrumentation-client observer
  -> same-origin local collector
  -> append-only synthetic/observed evidence
  -> deterministic workflow + metric analysis
  -> optional threshold-based opportunity

verified neutral evidence bundle
  -> separate GPT-5.6 human-review draft path

neutral fixture OR verified synthetic automatic-host analysis
  -> validated privacy-minimized static snapshot
  -> read-only Living Studio
```

The separate Surus CRM simulator drives the public UI. Living does not import its traces or scenario labels while observing. Simulator output is compared only after a run to measure Living's coverage and accuracy. An explicit `studio:sync` command can export verified synthetic analysis into Studio through a one-way static file boundary. Studio does not ingest the host live. The current GPT-5.6 runner remains separate and consumes neutral replay evidence, not automatic host evidence.

## CLI surface

Build the CLI once, then point it at a supported repository:

```bash
npm run build:cli
npm run living -- map --root <next-app>
npm run living -- init --root <next-app> --synthetic
npm run living -- init --root <next-app> --synthetic --apply
npm run living -- doctor --root <next-app> --synthetic
npm run living -- analyze --root <next-app>
npm run living -- snapshot --root <next-app>
npm run living -- uninstall --root <next-app>
npm run living -- uninstall --root <next-app> --apply
```

`map`, `analyze`, and `snapshot` are read-only. `init` and `uninstall` are dry-run by default; only `--apply` changes the supported host. `--synthetic` labels test observation provenance and is not accepted by `map`, `analyze`, `snapshot`, or `uninstall`. `snapshot` exports a strict minimized view of the current analysis; `npm run studio:sync -- --root <next-app>` additionally refuses observed or mixed evidence. The older `--fixture` CLI remains available as a deterministic, read-only neutral test path.

## Static discovery

The scanner receives a constrained repository reader and never imports application modules, evaluates JSX, loads `next.config`, executes package scripts, or follows paths outside the repository.

For the first adapter it discovers:

- App Router pages, layouts, route handlers, and route templates;
- React component surfaces and source-linked render/import relationships;
- interactive controls from `data-living-id`, stable `data-testid` patterns, and bounded structural fallbacks;
- literal navigation and endpoint references;
- high-confidence exported business entities and local persistence integrations.

The supported scan boundary is root `package.json`, `app/**`, `src/app/**`, `src/components/**`, and `src/lib/**`. Living's own generated integration files, `.living`, simulators, scripts, tests, end-to-end harnesses, stories, and build tooling are excluded so they cannot become product nodes or cause false release drift.

Dynamic routes and locator families are normalized, so `/leads/lead-01` maps to `/leads/[id]` and `lead-link-lead-01` maps to one control family. Every node and edge records scanned or inferred provenance, confidence, and a repository-relative source reference.

The exact scanned source set produces a deterministic release digest even when Git has uncommitted changes. An unchanged graph reuses its prior generation timestamp so the manifest hash does not churn merely because discovery ran again.

## Installation transaction

Installation remains dry-run by default. `--apply` is explicit.

The Next.js adapter may create only new, planned files:

```text
.living/config.json
.living/metric-catalog.json
.living/observation-runtime.json
.living/product-manifest.json
.living/install-record.json
.living/.gitignore
src/instrumentation-client.ts
src/living-observer.generated.ts
src/living-collector.generated.ts
src/app/api/living/events/route.ts
```

Every write is repository-relative, symlink-safe, atomic, preimage-checked, content-hashed, and journaled. Existing integration files cause a conflict instead of being overwritten. Generated observer and collector code is self-contained; installation does not edit `package.json`. A second identical install is a no-op. Uninstall removes only files whose current hashes still match the install record; changed files are preserved and reported for manual review. Captured evidence is preserved unless the user separately requests deletion.

## Browser evidence

The observer runs before hydration through Next.js `instrumentation-client.ts`, but initialization stays lightweight and failures never block the host application.

It may observe:

- route start and completion;
- delegated click, change, and submit interactions;
- sanitized runtime-error occurrence;
- LCP, INP, CLS, and bounded navigation timing when supported;
- target position, size, visibility, viewport, scroll burden, responsive class, and distance from the previous target;
- repeated corrections, rage-click candidates, and dead-click candidates.

It never listens for or serializes input, keydown, paste, selection, or clipboard content. It never captures form values, text, accessible labels, arbitrary element attributes, query strings, hashes, cookies, headers, request bodies, HTML, DOM snapshots, screenshots, IP addresses, user-agent fingerprints, or persistent user or cross-tab identifiers.

Each tab receives an ephemeral session identifier. During the CRM proof, provenance remains explicitly synthetic. Product node identity lives in the manifest-linked event envelope; layout metadata is a bounded set of integers, booleans, and enums.

## Local collector and evidence

The first collector is a same-origin Next.js Node-runtime POST route. It accepts bounded event batches, verifies app, manifest, release, sequence, origin, schema, and event identifiers, then appends a hash-linked NDJSON record to `.living/data/releases/<manifest-hash>/events.ndjson`. Manifest-derived release directories use a fixed lowercase SHA-256 grammar, and every path component is rejected if it is a symlink. This keeps incompatible releases in separate chains while preserving legacy evidence. The data directory is ignored by Git.

The collector exposes no evidence-reading endpoint. It rejects non-JSON, unknown fields, oversized bodies or batches, duplicate identifiers, and invalid manifest links. Single-process local use is the only current storage claim. A database and multi-instance coordination are later work.

## Automatic metrics

The initial metric catalog covers:

- cases, variants, actions per case, and case duration;
- repeated sequences, navigation backtracking, repeated submit, and error/retry signals;
- route and control frequency;
- target distance, scroll burden, small-target ratio, and visibility;
- route transition timing, LCP, INP, and CLS by route and viewport.

These are technical observations. Automatic browser telemetry does not know whether a business goal succeeded. Without a declared business outcome, case outcome remains unknown.

A layout hypothesis requires repeated workflow friction plus a spatial or performance burden within one viewport class. No model or detector may recommend moving an element solely because of its coordinates.

## Independent Surus CRM proof

This validation completed the supported installation, runtime capture, privacy-audit, and byte-preserving removal sequence. The steps below record the proof flow.

1. Scan the untouched CRM and verify its six routes, normalized dynamic lead route, mapped controls, source references, entities, and absence of a fabricated host broker.
2. Preview and apply the installation without editing the CRM layout, Zustand store, simulator, or existing tests.
3. Build the CRM and start it locally.
4. Run Claude's real-browser simulator while Living captures its own independent events.
5. Analyze Living evidence into workflow variants and technical metrics; report a friction opportunity only if its configured threshold passes.
6. Compare Living's ordered node sequences with the simulator trace only after capture.
7. Search Living evidence for the simulator's form corpus, contact identifiers, emails, messages, and notes; require zero matches.
8. Uninstall Living and verify every pre-existing CRM file remains byte-identical and Claude's uncommitted work is preserved.

### Pre-boundary diagnostic - July 20, 2026

The first run produced a 170-node manifest. Visual Studio review exposed 26 orphan nodes sourced from the CRM simulator, seed script, and tests. Those files never affected the 180 application relationships, but they did pollute product provenance and the source digest. That release and its 58-record evidence chain remain preserved as historical diagnostic evidence; the 170-node map is not the final product claim.

### Corrected clean CRM proof - July 20, 2026

- The CRM stayed in its separate repository and filesystem path. No CRM source or simulator trace was copied into this repository or used as Living analysis input.
- Discovery scanned 34 supported application files and produced 144 nodes, 180 edges, 92 runtime locators, and 212 metric definitions. The source digest is `sha256:609342b5a2d495b7bc99824a33ef2070ebb374fbef5cbdca21dbee94642ced2d`; the manifest is `sha256:63d3da3f26c4eaca269f7063e75ea3db0657e7aa7d735df69ab5e6050091e265`. Provenance contains zero paths from `sim`, `scripts`, `tests`, `e2e`, `.living`, or generated integration files.
- Living removed only the eight unchanged generated artifacts from the prior install, preserved `.living/.gitignore` and all evidence, then installed the corrected eight-artifact plan. The old evidence file remained byte-identical at SHA-256 `471ff2be4f9629f2f2247a02048974c4592fcd74724bb8c7ca22f180871d1b26`. `living doctor` reported `CONTRACTS_VALID` and `INSTALL_HEALTHY` after reinstall and after capture.
- The clean smoke completed two of two synthetic browser sessions with 46 simulator events and 42 actions. Living independently stored 17 hash-linked records containing 86 events, projected two cases and two variants, computed 61 metric values, and emitted no opportunity.
- The added friction cohort used seed 202 and pace 0. It completed three of three synthetic sessions with 75 simulator events and 69 actions, with zero simulator retries or errors.
- The final corrected release contains 48 records and 224 Living events across five cases. Its chain head is `sha256:58ededd51d06ea7e3ee66af41dcaa9273059ac4722fa611c93d6d120c0a147b2`; deterministic analysis produced five variants and 70 metric values.
- `detector.backtracking@1.1.0` emitted `opportunity.backtracking.fcf5d947adf8`: three affected cases, 17 revisits, affected ratio 0.6, confidence 0.74, and 17 sample event references.
- Two consecutive `snapshot --root` exports were byte-identical. The `living.studio-snapshot/v1` result contained five cases, 144 mapped nodes, and 224 events without absolute paths, raw event/session/case/user identifiers, or simulator output. The sync script accepted its explicit synthetic provenance and wrote it only to the gitignored Studio `.local` directory.
- Product Map, Workflows, Opportunities, Evolutions, and Receipts were browser-verified against the corrected snapshot. Studio labels it as a validated synthetic static export, not live telemetry; GPT-5.6 was not called, and captured-snapshot Evolutions and Receipts remain explicitly unconnected.
- Simulator traces remained a post-run oracle only. They were never input to discovery, workflow projection, metrics, the detector, or Studio.

## Growth path

After this proof, add adapters for other Node frameworks, developer-confirmed business semantics and outcomes, production-grade authenticated collection, richer case segmentation, and optional synthetic visual-regression evidence. None should weaken the explicit install, privacy, provenance, or rollback boundaries established here.
