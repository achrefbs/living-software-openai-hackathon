# Architecture

## Governing thesis

Living Software may grow only through declared, proved, human-approved capabilities. The AI is creative; deterministic systems are sovereign.

## Vertical slice

The hackathon host is **Founder Inbox**, a small application with a fixed lead-qualification workflow. Synthetic events reveal that the founder repeatedly performs the same missing action. Living Software proposes, proves, and installs one bounded capability that assists with that action.

## Components

```text
Founder Inbox
  -> typed event adapter
  -> append-only evidence store
  -> repeated-intent detector
  -> GPT-5.6 intent interpreter
  -> capability-contract compiler
  -> Codex isolated extension generator
  -> deterministic proof runner
  -> Judiciary policy gates
  -> human approval
  -> extension registry
  -> install / disable / rollback
```

### Typed event adapter

Observes only events the host application deliberately emits. It does not watch the entire desktop, scrape unrelated applications, or infer from hidden personal data.

### Evidence store

Preserves timestamped synthetic events, intent proposals, contract versions, generated diffs, proof results, approvals, installation state, and rollback history.

### Repeated-intent detector

Uses deterministic similarity and frequency gates to decide whether enough evidence exists to ask GPT-5.6 for an interpretation.

### Intent interpreter

GPT-5.6 summarizes the repeated intent, uncertainty, and possible missing capability. Its output is untrusted until compiled into a valid contract.

### Capability contract

The review artifact is a typed contract, not a wall of generated code. It declares:

- purpose;
- inputs and outputs;
- allowed permissions;
- explicit prohibitions;
- success and adversarial tests;
- resource limits;
- installation conditions;
- rollback behavior.

### Generator

Codex receives the approved contract and a constrained SDK. It may write only inside one extension workspace and may not install what it generates.

### Proof runner and Judiciary

Deterministic gates validate schema, types, tests, prohibited behavior, permission use, replay behavior, and rollback. A single failed mandatory gate blocks installation.

### Registry and rollback

Approved artifacts are content-addressed, versioned, and registered. Installation is explicit. The prior version remains available for one-action rollback.

## Planned capability example

`qualify-lead` will transform synthetic Founder Inbox messages into a structured qualification draft. It may read the provided message and synthetic sender history and write a local draft. It may not send messages, invent facts, promise dates, access external accounts, or modify unrelated records.

## Out of scope

- General autonomous self-modifying software.
- Whole-desktop surveillance.
- Background installation without approval.
- Production email sending.
- Multi-tenant deployment.
- Claims of universal safety.
