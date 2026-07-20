# `@living-software/discovery`

Static discovery for supported Next.js App Router repositories. The scanner reads bounded source text and uses the TypeScript parser; it never imports the host application, loads `next.config.*`, or runs package scripts.

```ts
import { discoverNextApp } from "@living-software/discovery";

const result = await discoverNextApp({ repositoryRoot: process.cwd() });
```

The result contains a validated Product Manifest and Living Config plus runtime locators, a metric catalog, source-linked provenance, safety diagnostics, and an exact digest of every scanned source byte. Geometry entries are capture plans, not measured coordinates; the runtime capture adapter must observe those in the browser.

The scanner can parse TypeScript or JavaScript source, but the verified end-to-end product boundary is TypeScript Next.js App Router 15.3+ using `src/app`. Symbolic links are not followed. Build outputs, dependencies, environment files, and likely credential files are excluded.

The current application boundary is root `package.json`, `app/**`, `src/app/**`, `src/components/**`, and `src/lib/**`. Installed `.living` data, root-level simulator/script/test tooling, co-located tests and stories, and build harnesses are not product-map evidence; route handlers and host integrations inside the supported application roots remain discoverable.
