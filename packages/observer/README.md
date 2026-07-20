# `@living-software/observer`

This package generates the two browser-side files used by a Next.js 15.3+
host: `src/instrumentation-client.ts` and
`src/living-observer.generated.ts`.

The generated observer first accepts an optional `data-living-node` token, then
maps existing exact `data-living-id` attributes, normalized `data-testid`
families, or a bounded tag/ancestor/ordinal fallback to declared product nodes.
No component codemod is required. It records interaction timing, bounded layout geometry,
navigation phases, coarse state, behavior signals, sanitized runtime failures,
and supported web vitals. It does not record page content, form values,
raw locator values, URL parameters, screenshots, DOM snapshots, identity attributes,
cookies, or request data.

The collector endpoint is fixed to the same-origin
`/api/living/events`. Browser failures are isolated from the host application,
and the generated runtime enforces queue, batch, payload, request-timeout, and
per-minute limits.
