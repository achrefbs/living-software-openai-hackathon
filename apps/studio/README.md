# Living Studio

Living Studio is the visual companion to the terminal-first Living Software lifecycle:

- Product Map
- Workflow Explorer
- Opportunity Feed
- Evolution Review
- Receipts
- optional Current vs Proposed comparison

The CLI can install, prepare, inspect, approve, apply and roll back without Studio. Studio makes the same evidence, GPT-authored proposal, static proof, lifecycle status and receipts easier to understand.

## Run

```bash
# neutral fixture
npm run dev:studio

# captured supported host
npm run studio:sync -- --root <instrumented-next-app>
npm run dev --workspace @living-software/studio -- --port 3001
```

The sync command verifies and minimizes the host snapshot, then atomically writes Git-ignored `.local/studio-snapshot.json` and its exact connection binding. Re-run sync after new evidence; Studio is not continuous live ingestion.

## Connected evolution

For an exact captured-host connection, Evolution Review can use the loopback-only development broker to invoke the explicitly selected Codex CLI or Responses API provider and the same governed lifecycle engine used by the CLI.

A prepared evolution displays:

- the deterministic workflow trigger and supporting evidence;
- GPT-5.6's evidence interpretation;
- the exact GPT-authored one-file proposal and edit preview;
- provider/run provenance;
- static proof checks and exact hashes;
- the human approval gate and current receipt state.

GPT receives at most three manifest-bound UI candidates / 96 KB, has no host tools, and may propose only one existing UI file with one to eight exact edits. It cannot approve or apply the proposal. Approval requires the exact artifact and proof hashes; application and rollback remain engine-owned.

## Current vs Proposed

The comparison route can show the unchanged host and an isolated exact-postimage preview side by side. It has no mutation controls. Frames render only when the connected preimage and preview evolution/postimage identities match the current governed state. Viewing or interacting with a preview is not approval, application or runtime proof.

## Boundary

Studio never imports or executes host source. Browser requests cannot choose arbitrary filesystem roots. Neutral/unmatched fixtures remain read-only. Captured-host actions require exact app, snapshot, manifest, opportunity, event-set, evolution, revision, artifact and proof identities appropriate to each transition.

Applying source does not prove the running app rebuilt successfully, and Living does not automatically measure a post-change workflow.

## Verify

```bash
npm run studio:check
```

Use the Preview states menu to inspect current, empty, disconnected and invalid-data states.
