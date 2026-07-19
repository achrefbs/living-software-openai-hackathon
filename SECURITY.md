# Security and trust model

Living Software deliberately treats generated code as untrusted until proven and approved.

## Authority model

| Component | May do | May not do |
| --- | --- | --- |
| GPT-5.6 intent interpreter | Propose an intent summary and draft contract | Grant permissions or install code |
| Codex generator | Produce code inside the declared extension boundary | Write outside its workspace or ship directly |
| Contract validator | Reject malformed or over-broad contracts | Relax a contract on its own |
| Proof runner | Execute bounded tests and collect evidence | Mark a failed proof as passed |
| Judiciary/policy engine | Enforce deterministic gates | Generate product behavior |
| Human reviewer | Approve, reject, disable, and roll back | Erase the audit trail |

## Non-negotiable controls

- Default-deny undeclared permissions.
- Generated code runs in an isolated, resource-bounded environment.
- No network, message sending, filesystem expansion, or secret access unless explicitly declared and approved.
- Proof results, prompts, generated diffs, approvals, and rollback events are append-only evidence.
- Installation is a separate human action after proof.
- Every installed extension is versioned and reversible.

## Data policy

The judged build uses synthetic fixtures only. It must not ingest real inboxes, credentials, customer records, or private workspaces.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that exposes secrets or enables unsafe code execution. Contact the repository owner privately and include reproduction steps, affected commit, and impact.
