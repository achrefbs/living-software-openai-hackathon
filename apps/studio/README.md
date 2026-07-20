# Living Studio

Host-agnostic interface for Living Software. Its five-stage journey is:

- Product Map
- Workflow Explorer
- Opportunity Feed
- Evolution Review
- Receipts

An additional read-only **Current vs Proposed** comparison is available from
Evolution Review after a draft exists. It can embed the unchanged host and an
isolated exact-postimage preview side by side. The comparison has no approval,
apply, or rollback controls.

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

For a captured-host demo, set `LIVING_STUDIO_HOST_URL` to the unchanged host
and `LIVING_STUDIO_PREVIEW_URL` to a separately running postimage preview, then
open `/apps/<app-id>/compare`. The preview origin must expose a strict
`living.preview-identity/v1` response at `GET /api/living-preview`. Studio
shows the frames only when that evolution ID and runtime-computed postimage hash
match the governed draft and the connected target still matches its preimage.
From the repository root, `npm run preview:crm -- --root <crm> --out <new-path>`
creates this isolated source tree without editing the CRM. The preview is
display-only; it is not lifecycle approval or evidence that the connected host
was activated.

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
event-set identities all match. The local Evolution Review broker is the only
captured-host surface with governed mutation commands. The comparison route is
GET-only; even an exact related draft or visible preview cannot approve,
activate, populate lifecycle state, or unlock controls.
