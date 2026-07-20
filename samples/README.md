# Synthetic sample data

The neutral host under `neutral-host/` is the first reproducible integration
fixture. It is deliberately not the separate CRM reference host.

- Every workflow is synthetic and runs offline.
- No identity, message, or production telemetry is included.
- The host descriptor targets the explicitly supported Next.js/TypeScript slice.
- `npm run demo:neutral` maps the declared product, validates every event, projects
  workflow variants, and runs the deterministic backtracking detector.
- The expected result is two workflow variants and one opportunity backed by
  three affected synthetic cases.
- With `OPENAI_API_KEY` set, `npm run demo:gpt56` reuses the exact 24-event
  affected evidence bundle for the explicit live GPT-5.6 proof path.

The fixture is authored for this repository and is covered by the repository's
MIT license.
