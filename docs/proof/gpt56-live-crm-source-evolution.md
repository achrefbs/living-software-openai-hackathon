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
