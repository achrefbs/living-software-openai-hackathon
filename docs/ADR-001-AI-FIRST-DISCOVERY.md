# ADR-001: AI-first behavior discovery

- **Status:** Accepted
- **Date:** 2026-07-21

## Context

The first implementation used four deterministic detector families to decide whether evidence could reach GPT-5.6. That made the demo predictable, but it also made the product choose the problem before the AI saw the complete behavior. Useful evidence that did not cross a predefined threshold could never produce a proposal.

Living Software is intended to discover improvements that were not specified in advance. The model therefore needs the complete privacy-safe behavior window, while deterministic code should retain authority over evidence integrity and source mutation.

## Decision

`analyze` verifies the active-release evidence chain and builds a privacy-safe event/metric matrix from:

- all verified route, action, and outcome event sequences;
- all current workflow, performance, friction, viewport, visibility, geometry, movement, and timing metrics;
- the source-linked Product Manifest and explicit observed/synthetic/mixed provenance.

`improve` sends that matrix and bounded product context to GPT-5.6. GPT chooses one evidence-supported pattern and improvement hypothesis. There is no fixed detector category, minimum session threshold, prescribed workflow, CRM-specific rule, or desired feature.

Deterministic code remains responsible for:

- app, manifest, event-set, metric-report, and model-output identity validation;
- privacy and context bounds;
- eligible source-candidate selection;
- exact anchor compilation, authority checks, and static proof;
- human approval bound to exact artifact and proof hashes;
- capture-verify/no-overwrite apply, receipts, recovery, and exact rollback.

GPT cannot approve, apply, roll back, invoke tools, or write source.

## Consequences

- Proposals can vary with the behavior actually captured; the demo must not predict a particular feature.
- `analyze` reports matrix readiness and does not claim that a detector selected a feature.
- Captured behavior supports a hypothesis, not proof of intent, causality, usefulness, or measured improvement.
- The four earlier detector families may remain in canonical JSON and regression tests as diagnostics, but they do not gate or select the AI request.
- Existing detector-era proof records remain valid historical evidence for capture, governance, application, and rollback only; they must be labeled historical.
- Automatic post-change capture and before/after measurement remain future work.
