# July 21 live stress evolutions

This record documents a synthetic adversarial run against the separate CRM host. The purpose was to test whether Living Software could reject weak evidence, distinguish materially different friction patterns, let GPT-5.6 invent different bounded changes, apply those changes through the governed lifecycle, and restore the host exactly.

The CRM simulator supplied browser actions only. It did not provide detector labels, opportunity IDs, source targets, or patch instructions to Living.

## Results

| Test | Deterministic result | GPT-authored result | Runtime result |
| --- | --- | --- | --- |
| Below-threshold corrections | Six cases and only two affected cases produced no opportunity | No model request | No source change |
| Repeated corrections | `rework-loop` from 11 affected cases | Inline lead-stage and note-entry guidance in `src/app/leads/[id]/page.tsx` | CRM tests/build passed; both guidance strings rendered; exact rollback restored the preimage |
| Repeated sort interaction failures | `failure-cluster` from four rage-click cases | Live sort-status feedback in `src/components/leads-table.tsx` | CRM tests/build passed; status changed after the sort click; exact rollback restored the preimage |

These were two different detector families, proposals, source targets, artifacts, and runtime behaviors.

## Negative control

Six synthetic rework sessions produced 101 Living events but only two cases containing correction signals. The `rework-loop` detector requires at least three affected cases, so analysis returned no opportunity. This showed that ordinary workflow activity and a small number of signals did not automatically trigger GPT.

## Correction-loop evolution

After expanding the cohort, Living analyzed 579 events across 24 workflow cases. Eleven cases contained exact correction evidence and produced:

- opportunity: `opportunity.rework-loop.79b9f309ec75`
- detector: `detector.technical-friction.correction@1.0.0`
- evidence hash: `sha256:22ef2afc8c433fbf1641717bae67377f2ba43bcd2204670a2805de5b12af2ccc`

The final full-opportunity request used Codex threads `019f820b-cb9e-70e2-a037-51d8682ab9eb` and `019f820c-172d-79f0-9eb4-1ed76f24a738`. GPT proposed accessible inline guidance for choosing a lead stage and recording useful notes. Living compiled:

- evolution: `evolution.source.v2.c8787271793aa9ad6d8b3777`
- target: `src/app/leads/[id]/page.tsx`
- artifact: `sha256:f018147c0fe3acbc8adcea8f5bc0ebcfd7c3b4b11def028635db50a1b0337788`
- proof: `sha256:2b0f45025425f6e6d919fa74a045f8f2854a42aa79096f2cc710b804288eebea`
- preimage: `sha256:e37b5c1bb7fe8665fd2d4dd313859e5cfa86256d1040afd07ade3117dfb1d5ab`

All 13 deterministic proof checks passed. After exact-hash approval and application, the independent CRM passed 112/112 tests and its production build. Browser verification showed both authored guidance strings on the live lead page. Rollback closed the nine-receipt lifecycle and restored the target byte-for-byte to the recorded preimage. The CRM tests and production build passed again after restoration.

## Interaction-failure evolution

To remove detector ambiguity, the mixed stress log was archived and a fresh isolated cohort was captured. Four simulator cases generated 72 Living events and four exact rage-click signals across four sessions. Living produced:

- opportunity: `opportunity.failure-cluster.df9b6ec218be`
- detector: `detector.technical-friction.interaction-failure@1.0.0`
- evidence hash: `sha256:37fd060872b9732cb1dccc9d9d7910d00d6c70a60190f69b966bcc439b86ca61`
- affected-case ratio: `4/4`
- confidence: `0.95`

Codex threads `019f8212-a8d9-7e91-b803-11c76a95ee02` and `019f8213-1700-7cb3-8fac-892da9bb5160` generated a different proposal: visible, accessible sort-status feedback that updates when the Lead column is selected. Living compiled:

- evolution: `evolution.source.v2.27dfdc4eea4430b732b9edc0`
- target: `src/components/leads-table.tsx`
- artifact: `sha256:7cc3b2cf04e501b463e24c853ef2490d60e6f49cb5a6af11466c7d2095fc76db`
- proof: `sha256:a6b87e8454c9c09ecf9bda6d41eadee66c0263ca8c861d017f72e07deec378db`
- preimage: `sha256:17a7ba4a0aeddc34f57d43c2cf8dc4e673b2c028e4b39ebf903e518386c089b8`

All 13 proof checks passed. After exact-hash approval and application, the CRM again passed 112/112 tests and its production build. Browser verification showed the initial sort status and its update after clicking the mapped sort control. Exact rollback restored the target hash, followed by another passing CRM test suite and production build.

## Defects found and fixed during the run

- Successful ordinary review navigation could falsely satisfy the old backtracking heuristic. Backtracking v1.2 now requires a technical signal or failed/abandoned event in every affected case.
- The source-context budget could prefer lexical decoys over evidence-linked product nodes. Evidence nodes and direct neighbors are now retained first, and model-cited affected nodes must stay inside that relevant set.
- Read-only status could create a lifecycle lock file. Settled reads are now mutation-free while interrupted journals still recover under the lock.
- A detector contract could be structurally valid but semantically inconsistent with its supporting events. Built-in detector versions are now independently recomputed before any model transport.
- Proposal reuse originally keyed only on the stable opportunity ID. When unaffected source-cohort cases changed the ratio and confidence, Living could reuse a stale proposal. Reuse now requires deep equality of the entire canonical Opportunity; an exact replay still reuses safely.
- The simulator could stop its browser host before asynchronous observer delivery completed. It now has an explicit delivery-settle hook, and the isolated failure cohort captured all four signals.

## What this evidence does not prove

The evidence is synthetic and local. It proves threshold behavior, generalized source selection across two detector families, model-authored bounded changes, deterministic lifecycle enforcement, runtime rendering, and exact restoration. It does not prove that either patch improved user outcomes, that the detector generalizes to production behavior, or that Living automatically captures and compares a post-change cohort.
