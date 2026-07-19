# Living Software product map

The working product map lives in the local SuperDraw canvas:

- **Canvas:** `living-software-product-map`
- **File:** `C:\Users\acera\Desktop\SuperDraw\canvases\living-software-product-map.superdraw.json`
- **Created:** July 19, 2026 through the locally configured SuperDraw MCP server
- **Current size:** 89 elements in one organized, connected graph
- **Status:** Working discovery artifact; not every idea on the canvas is an accepted decision

Open SuperDraw and choose **Menu → Open**, then select the canvas above. The canvas is the broad thinking surface; [DECISIONS.md](../DECISIONS.md) remains the authority for accepted entrant decisions.

## Product position

Living Software occupies the governed middle between static software that learns too slowly and autonomous software that cannot be trusted.

Its core promise is:

> Turn repeated, consented user intent into one bounded, provable, human-approved, measurable, and reversible capability.

Founder Inbox is a thin demonstration host, not the product. The product is the governed evolution loop and its reusable host, policy, proof, approval, registry, and rollback primitives.

## Canvas branches

1. **Who and why** — beachhead users, job to be done, current alternatives, and the governed-middle position.
2. **Governed evolution loop** — observe, detect and interpret, contract, generate, simulate, verify, approve and install, then learn and metabolize.
3. **Trust primitives** — one capability broker for simulation and runtime, negative capabilities, proof-carrying artifacts, sealed approval, fossil record, and evolution budgets.
4. **Founder Inbox demo** — repeated qualification workaround, bounded `qualify-lead` proposal, meaningful policy failure, repaired proof, visible installation, Evolution Receipt, and rollback.
5. **Build-now order** — prove the lifecycle first, make trust executable, then add evidence and model intelligence, and finally polish the review and judge experience.
6. **Risks and experiments** — evolution-versus-configuration perception, whether proof materially improves trust, integration burden, comprehension, and pipeline reliability.
7. **Metrics, exclusions, and later platform** — time-to-approved-capability, safety and anti-bloat guardrails, explicit Build Week exclusions, and the longer-term SDK and policy ecosystem.

## Recommended first implementation sequence

1. Define the capability contract and deterministic lifecycle state machine.
2. Install, disable, and roll back one hand-authored test extension.
3. Add the shared capability broker, effect capture, and mandatory proof gates.
4. Demonstrate an unsafe candidate being blocked and a new repaired candidate passing without weakening policy.
5. Build the thin Founder Inbox host and make installation visibly add the `Qualify Lead` capability.
6. Add typed evidence replay, repeated-intent detection, and GPT-5.6 structured interpretation with cached judge replay.
7. Build the Decision Room, behavioral diff, Evolution Receipt, deterministic demo reset, and fresh-clone judge path.

## Working product test

The earliest high-risk test is the visible sequence:

```text
before -> install -> capability appears -> use it -> rollback -> capability disappears
```

Show this cold to five people before investing in broad UI polish. The signal is whether at least four describe the product as safely gaining and losing a capability rather than toggling a canned feature.
