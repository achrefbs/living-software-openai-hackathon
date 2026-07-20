# @living-software/evolution

This package turns an evidence-bound GPT-5.6 source proposal into a governed,
reversible one-file evolution.

GPT selects one bounded UI source candidate and authors exact anchor/replacement
edits. The model receives no filesystem or process authority. The local engine
independently verifies the target came from the brief's affected Product Manifest
nodes, recompiles the edits against the exact preimage, enforces a declared-authority
denylist and diff limits, and seals the proposal, provenance, source hashes, proof,
and receipts. The denylist is defense in depth, not semantic proof that generated
source is correct or secure.

Preparation never edits the host. A human must approve the exact artifact and
proof before application. Apply accepts only the stored preimage, and rollback
accepts only the exact installed postimage. Application captures and verifies the
prior image, publishes without overwriting a concurrently recreated target, and
journals recovery under `.living/data/evolutions-v2`.

Application-scoped lease locking serializes direct engine mutations and permits
only one same-app evolution in `approved` or `applied` state; rollback releases
the slot.

Current limits are deliberate: one existing `.ts`, `.tsx`, `.js`, `.jsx`, or
`.css` UI file below `src/app` or `src/components`; no route handlers or
declared server/host/network/process/storage/secret/dynamic-code/raw-HTML/loader
authority patterns; no dependency changes, new files, Git commands, or automatic
approval.
