# Living Studio

Host-agnostic, read-only interface for Living Software. It exposes five connected surfaces:

- Product Map
- Workflow Explorer
- Opportunity Feed
- Evolution Review
- Receipts

Studio has two read-only inputs. At startup it validates
`.local/studio-snapshot.json` with the public `living.studio-snapshot/v1`
contract; if that file is absent, it uses the clearly labeled neutral fixture
in `src/data/studio-fixture.json`. Evolution Review also strictly parses and
projects the committed sanitized `living.gpt56-proof/v2` artifact. An invalid
input fails closed.

## Run the neutral fixture

From the repository root:

```bash
npm run dev:studio
```

Open <http://localhost:3000>. The root redirects to the active dataset.

## Load a captured host analysis

First capture synthetic evidence in an installed supported host. Then, from the
repository root, run:

```bash
npm run studio:sync -- --root <instrumented-next-app>
npm run dev:studio
```

The sync command builds the CLI, verifies the evidence chain through `living
snapshot --root`, rejects observed or mixed evidence, validates the minimized
snapshot, and atomically writes only
`apps/studio/.local/studio-snapshot.json`. The entire `.local` directory is
gitignored; no CRM snapshot is committed. Restart Studio after replacing the
snapshot.

The captured view is a static export, not a live host connection. It contains a
versioned Product Manifest, minimized workflow cases and variants, a Metric
Report, evidence-chain metadata, and an optional deterministic Opportunity. It
contains no raw event metadata, model interpretation, capability contract,
artifact, approval, activation, rollback, or governed lifecycle receipts.

## Verify

From the repository root:

```bash
npm run studio:check
```

Or inside this workspace:

```bash
npm test
npm run typecheck
npm run build
```

## State previews

Use the **Preview states** menu in the top bar to inspect current data, empty,
disconnected, and invalid-data states on any surface. These explicit query
previews remain available for both fixture and captured datasets.

## Boundary

Studio never imports or executes host code and does not accept a filesystem path
from a browser request. The separate CLI owns host-root access, evidence-chain
verification, minimization, and snapshot creation. Studio makes no live model
call. The committed proof projection omits raw event IDs and alias mappings and
remains separate from the active dataset unless app, manifest, opportunity, and
event-set identities all match. Even a related draft cannot approve, activate,
populate lifecycle state, or unlock controls.
