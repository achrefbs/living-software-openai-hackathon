# @living-software/evolution

This package implements one intentionally narrow source evolution:
`next-crm-lead-review-navigation/v1`.

It can prepare and statically prove a deterministic one-file patch, record an
exact-hash human approval, apply only to the approved regular-file preimage,
and roll back only the exact installed postimage. It never executes generated
code, invokes Git, or grants network, process, filesystem-expansion, or secret
authority.

Lifecycle evidence is stored below
`.living/data/evolutions/<evolution-id>/` in a strict state document and a
hash-linked receipt stream.

## Interpretation boundary

The GPT-5.6 brief is preserved in full as evidence interpretation. It does not
select or generate the source mutation. The artifact therefore records
`briefRole: evidence-interpretation-only` and `implementsBrief: false`.

The fixed adapter is eligible only when the validated host, manifest, exact
target source, and a backtracking opportunity satisfy its deterministic
contract. No model-produced code is executed.

## Concurrency and lifecycle

Approval, application, and rollback require `expectedRevision`, which is the
verified receipt count. Each operation runs under an owner-token filesystem
lock scoped to one evolution. Expired locks are quarantined before a new owner
continues; process identifiers are not trusted as ownership evidence.

Preparation emits four receipts. Human approval adds exact contract/artifact
and artifact/proof confirmations. Application and rollback each add one
receipt. Every receipt is sequence-checked and hash-linked to the prior one.

`rolled-back` is terminal for the same deterministic evidence identity. A new
attempt requires new evidence and therefore a new evolution identity.

## Write-ahead recovery

A lifecycle mutation first writes a hash-bound pending transaction containing
the exact base state and receipt-chain head, new receipts, next state, and any
source transition. While holding the evolution lock, recovery deterministically
rolls that transaction forward: exact target replacement when required, atomic
receipt-file replacement, atomic state replacement, then journal removal.

Recovery is idempotent when interrupted after the journal, target, receipts, or
state step. It refuses to proceed if the host source, receipt suffix, or state
matches neither the exact before nor after boundary. Fault-injection tests cover
all four interruption points. These guarantees are scoped to the package's
validated files and process-visible filesystem semantics; they do not claim
durability beyond guarantees provided by the host filesystem.
