# Live GPT-authored CRM source evolution

Recorded on **July 21, 2026** from an authorized synthetic-only run against the
separate `crm-workflow-lab` test host.

## Model provenance

- Provider: saved-auth Codex CLI
- Requested transport model: `gpt-5.6-terra`
- Brief thread: `019f81cc-aa13-7390-a670-268f173b3542`
- Patch thread: `019f81cc-f009-7323-8803-4383a158587f`
- The Codex CLI transport does not report an authoritative actual response
  model value.

## Governed result

- Evolution: `evolution.source.v2.a0e7c78e809d2d0531a267c2`
- Target: `src/app/leads/[id]/page.tsx`
- Model-authored edit: `Leads` to `Back to leads`
- Preimage: `sha256:e37b5c1bb7fe8665fd2d4dd313859e5cfa86256d1040afd07ade3117dfb1d5ab`
- Postimage: `sha256:07e9d6faf5697e7321f95a6f22367b52f364265333a44a4683a32ad2c33f2318`
- Artifact: `sha256:c1c6408afee5b06ddad6f0ec6571576a902daf8094c7e9b30461f49e96ccb390`
- Proof: `sha256:29e4ab3134ba2748666d43b218626bd05ee5415569808b62f6855d96bef0f866`
- Proof checks: 13 passed
- Lifecycle receipts: 9
- Receipt-chain head: `sha256:5855158cfb287e3ffce076353283db50626e8621ec93586126c3cb6967cb882f`
- Approval actor label: `acera` (an audit label, not authenticated identity)

Before application, the engine verified that Git HEAD and the current CRM
target matched the retained preimage. Before rollback, it verified that the
target still matched the sealed postimage. Recomputed artifact, proof,
provenance bindings, all nine receipt hashes, lifecycle order, and deterministic
patch compilation passed.

## Runtime evidence

- CRM unit suite: 111/111 passed.
- CRM production build: passed.
- Browser route: `http://localhost:3000/leads/lead-04`.
- Visible result: the real lead detail page rendered `Back to leads`.
- Post-apply remapping preserved `.living/data` and returned `living status`
  to `INSTALL_HEALTHY`.
- Explicit rollback actor label: `acera-stress`.
- Rollback result: status `rolled-back`; the target changed from the exact
  postimage back to the byte-identical preimage
  `sha256:e37b5c1bb7fe8665fd2d4dd313859e5cfa86256d1040afd07ade3117dfb1d5ab`.
- The appended `installation.rolled-back` receipt is sequence 8 and closes the
  valid nine-receipt chain. Living health checks reported the restored CRM
  integration healthy.

## Limits

- Evidence was synthetic; this does not establish production behavior.
- Exact source rollback does not by itself prove a user-visible runtime state;
  the applied state was browser-verified, while the restored state was
  hash- and health-verified.
- Post-change workflow capture and before/after measurement are not
  implemented, so this is not proof that the metric improved.
- The run occurred from the corrected working tree before the final
  documentation commit; exact-final-commit reproduction remains open.

## AI-first run — July 22, 2026

This follow-up run used the authenticated Codex CLI after AI-first discovery
was enabled. GPT received the bounded privacy-safe behavior matrix and one
manifest-linked CRM source candidate. No fixed detector selected or gated the
feature.

- Evidence supplied: 5 workflow cases and 171 privacy-safe occurrences
- Brief run: `019f86ec-2fe6-7b81-a08f-aa4fd9fd2136`
- Source-patch run: `019f86ec-8ff0-72b3-9086-97da4c629335`
- GPT-selected problem: make the lead-stage control larger and clearer
- GPT-selected change: show the current stage explicitly and use a full-width selector
- GPT-selected target: `src/app/leads/[id]/page.tsx`
- Evolution: `evolution.source.v2.c5265c292044b9411e30d9b2`
- Artifact: `sha256:697a8ccd9b344366442d0fc5d17d3d0091a457ba83687a3bb55b4251ca1c1660`
- Proof: `sha256:4e9fe80b73f867e38995e2c9859bae7a43fd65a77b31f0e52c748c163b2823d2`
- Deterministic proof: 13/13 checks passed
- Lifecycle result: exact hashes approved, then the sealed postimage applied
- CRM verification: 112/112 tests passed and the production build passed
- Runtime verification: `/leads/lead-04` visibly rendered the new `Current stage`
  presentation and full-width selector; no new browser runtime errors appeared

An earlier GPT proposal, `evolution.source.v2.dcfead31da1387a928dd4a6e`,
contained NUL padding and incomplete TSX. It was never applied. Commit
`060a979` added compiler syntax validation, control/padding rejection,
revalidation before approval/application, stale-proposal regeneration, and a
terminal `HISTORICAL / INVALID` state. The preserved artifact remains readable
for audit but cannot be reused, approved, or applied.

This proves an AI-chosen, AI-authored, governed source change can complete the
full loop on the CRM. It does not prove that the UI change improves real-user
outcomes; post-change evidence and comparison are still required for that.
