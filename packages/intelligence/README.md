# `@living-software/intelligence`

This package gives GPT-5.6 one narrow, material role in Living Software: interpret a validated opportunity, its hash-verified workflow evidence, and a bounded product-map context, then draft an `EvolutionBrief` hypothesis for human review.

It does **not** approve or activate changes, mutate a host application, or expose host tools to the model. Every response is constrained by a strict Structured Outputs schema and then validated again in the application. Those checks establish schema and reference integrity—not semantic truth. The draft remains a hypothesis that requires human review.

## Runtime

```ts
import { createIntelligenceClient } from "@living-software/intelligence";

const intelligence = createIntelligenceClient();
const result = await intelligence.draftEvolutionBrief({
  opportunity,
  manifest,
  evidenceEvents,
});
```

Set `OPENAI_API_KEY` only in the runtime environment. The default transport reads it when a request is sent and never logs it. Tests use an injected offline transport and make no network calls.

Before any network call, the client recomputes the canonical manifest and event-set hashes, validates sample IDs, projected-case/session counts and app/manifest links, and verifies observed/synthetic origin. Outbound context contains only bounded identifiers, enums, counts, and normalized events. Raw event IDs are replaced with deterministic opaque aliases; source paths, symbols, release revisions, event metadata, session/actor/subject IDs, and host display text are excluded. Validated aliases are mapped back to event IDs only in the local result and its provenance.

The request is fixed to `gpt-5.6`, reasoning effort `medium`, `store: false`, no tools, bounded output tokens, and `text.format.type: "json_schema"` with strict mode enabled. Calls have a configurable abort timeout. Results include non-model-authored provider/model/response provenance; synthetic drafts carry a deterministic `synthetic-only` evidence scope and can never claim production generalization.
