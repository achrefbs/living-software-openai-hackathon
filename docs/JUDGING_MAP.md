# Judging criteria map

Every claim must point to runnable behavior, a test, a commit or a preserved artifact. Planned behavior remains labeled.

| Criterion | Evidence available now | Still required |
| --- | --- | --- |
| Technological Implementation | Versioned contracts; bounded Next.js discovery; create-only installer; browser observer and hash-linked collector; deterministic workflows/metrics/opportunity; explicit GPT-5.6 transports; manifest-bound 3-file/96-KB source projection; GPT-authored one-file 1-8-edit proposal; static proof; caller-supplied artifact/proof-hash approval; exact-preimage application; receipts, recovery and rollback; Studio | Fresh-clone/no-rebuild judge path; primary `/feedback` ID; exact submission-commit live run |
| Design | Terminal-first install -> observe -> improve flow; human-readable proposal/next command; Studio map, evidence, proposal, proof, comparison and receipt surfaces; explicit unchanged/prepared/applied states | Final recorded walkthrough |
| Potential Impact | A tool that derived CRM backtracking friction, let GPT invent a bounded UI change, exact-hash applied it, passed the CRM tests/build, and browser-rendered the result without giving the model host authority | Exact-final-commit reproduction and executed rollback; no automatic post-change measurement claim |
| Quality of Idea | Creativity and governance are separated: GPT authors the proposal, deterministic code bounds it, and a human controls exact source application | Concise entrant narration and submission copy |

## Primary judge path

```bash
npm install
npm run build:cli
npm run test
npm run living -- install --root ../crm-workflow-lab --synthetic
# exercise the running CRM
npm run living -- improve --root ../crm-workflow-lab --provider codex
npm run living -- status --root ../crm-workflow-lab
npm run studio:sync -- --root ../crm-workflow-lab
npm run dev --workspace @living-software/studio -- --port 3001
```

Review the exact target, 1-8 model-authored edits, proof and evolution ID. Then:

```bash
npm run living -- approve --root ../crm-workflow-lab --evolution <id> --actor judge-demo --artifact-hash <artifact-sha256> --proof-hash <proof-sha256> --apply
# reload/build and inspect the CRM
npm run living -- rollback --root ../crm-workflow-lab --evolution <id> --actor judge-demo
```

`--provider codex` uses saved Codex authentication. `--provider api` is a separate explicit path requiring `OPENAI_API_KEY`; there is no fallback. `--json` produces canonical terminal output.

The credential-free neutral path remains:

```bash
npm run living -- map --fixture samples/neutral-host/host-fixture.json
npm run demo:neutral
npm run dev:studio
```

The neutral proof demonstrates deterministic plumbing and a preserved model interpretation. The separate July 21 CRM record documents a current live GPT-authored patch, exact-hash approval/application, and browser-visible runtime verification.

## What judges should verify

- GPT sees only an evidence brief and at most three manifest-bound UI files / 96 KB.
- GPT has no tools and proposes one existing UI file with 1-8 exact edits.
- Living—not GPT—enforces target, preimage, anchors, static authority, diff and lifecycle bindings.
- Prepared source is unchanged.
- `approve --apply` is a visible human action over both the exact artifact and proof hashes.
- Runtime behavior is verified separately.
- Rollback restores only the exact applied postimage.

## Claims intentionally excluded

- Universal arbitrary-codebase support.
- Repository-wide autonomous coding or multi-file/dependency changes.
- Model filesystem, terminal, browser, network, approval or application authority.
- Semantic proof that a generated patch is correct, accessible or buildable.
- Production telemetry/control-plane readiness.
- Automatic post-change measurement or causal proof of improvement.
- Any implementation dependency on the separate CRM or simulator.
