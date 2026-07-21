# Living Studio

Living Studio is the visual control room for the same governed Living Software lifecycle:

- Product Map
- Workflow Explorer
- Opportunity Feed
- Evolution Review
- Receipts
- optional Current vs Proposed comparison
- connected Live Run event rail and lifecycle pipeline

The CLI can install, prepare, inspect, approve, apply and roll back without Studio. Studio makes the same evidence, GPT-authored proposal, static proof, lifecycle status and receipts easier to understand.

## Run

```bash
# connected supported host; start this before Living is installed
npm run studio:live -- --root <next-app> --host-url http://127.0.0.1:3000 --port 3001 --new-session

# explicit offline snapshot/fixture mode
npm run studio:sync -- --root <instrumented-next-app>
npm run dev --workspace @living-software/studio -- --port 3001
```

Connected mode canonicalizes the root on the server, performs a read-only product map, binds Studio to loopback, and makes `/live` the default page. The browser never chooses a root. A durable local `living.live-event/v1` hash chain supplies validated replay, and SSE supplies new events with monotonic IDs and `Last-Event-ID` reconnect. The client does not timer-poll for lifecycle facts; each validated event causes it to request the current strict projection.

Each launcher invocation creates a fresh durable history by default; `--new-session` makes that intent explicit for a demo. Refreshes and SSE reconnects keep using that run's printed session ID. To deliberately resume a stopped run, pass the exact printed ID with `--session-id <id>`. The two options are mutually exclusive, unsafe path-like IDs are rejected, and starting a new session never deletes older histories.

The explicit offline command still verifies and minimizes a host snapshot, then atomically writes Git-ignored `.local/studio-snapshot.json` and its exact connection binding. It does not watch the host and is never represented as live.

## Connected evolution

For an exact connected-host session, Live Run can invoke the explicitly selected Codex CLI or Responses API provider and the same governed lifecycle engine used by the CLI. Mutation requests require loopback, exact same origin, bounded strict JSON, current session/app/manifest/snapshot identity, exact evolution/artifact/proof identity, and the expected receipt revision. Commands are serialized.

A prepared evolution displays:

- the deterministic workflow trigger and supporting evidence;
- GPT-5.6's evidence interpretation;
- the exact GPT-authored one-file proposal and edit preview;
- provider/run provenance;
- static proof checks and exact hashes;
- the human approval gate and current receipt state.

GPT receives at most three manifest-bound UI candidates / 96 KB, has no host tools, and may propose only one existing UI file with one to eight exact edits. It cannot approve or apply the proposal. Approval requires the exact artifact and proof hashes; application and rollback remain engine-owned.

Lifecycle events expose only safe status, identifiers, bounded references, counts, provider/model/run provenance, allowed token usage, proof results, receipts, and source hashes. They never contain prompts, reasoning, source, raw workflow values, DOM, screenshots, secrets, or captured text. An exact evidence-bound proposal reuse produces a reuse event rather than fake model progress.

The evidence monitor opens only the active installed release file, accepts complete newline-terminated collector records, and derives all detector cards from the shared evaluator. A partial final record waits for completion and repeated filesystem notifications do not duplicate facts. Truncation, deletion, replacement, symlink traversal, invalid UTF-8, evidence-chain corruption, receipt/ledger failure, or sealed-source drift stops monitoring visibly instead of falling back to stale data.

## Current vs Proposed

The comparison route can show the unchanged host and an isolated exact-postimage preview side by side. Create one or both generic tracked-file views after an evolution is prepared:

```bash
npm run preview:host -- --root <next-app> --evolution <id> --out <new-postimage-copy> --before-out <new-preimage-copy>
```

Start the copies on separate loopback ports, then pass `--preview-url` and optionally `--before-url` to `studio:live`. The generator reads a stable bounded Git-tracked snapshot, rejects unsafe paths/symlinks or a wrong target preimage, writes only to new output directories, and seals an identity route to the evolution, target path, view, and exact source hash. It never edits the connected host. Viewing or interacting with a preview is not approval, application, or runtime proof.

## Boundary

Studio never imports or executes host source in its own process. Browser requests cannot choose arbitrary filesystem roots. The monitor watches only bounded Living paths, the active release evidence file, the relevant evolution ledger, and the sealed target basename. Neutral/unmatched fixtures remain read-only. Connected-host actions require exact app, snapshot, manifest, opportunity, event-set, evolution, revision, artifact and proof identities appropriate to each transition.

Applying source does not prove the running app rebuilt successfully, and Living does not automatically measure a post-change workflow.

## Verify

```bash
npm run studio:check
```

Use the Preview states menu to inspect current, empty, disconnected and invalid-data states.
