# `@living-software/automatic`

Builds a deterministic, create-only-install-compatible artifact bundle from a validated discovery result. The bundle adds node-specific observation semantics, a browser runtime map, normalized metrics, and the generated Next.js observer files.

```ts
const bundle = buildAutomaticInstallBundle(discovery, {
  synthetic: false,
  environment: "development",
});
```

The package does not write to the host repository and does not generate the collector route. Pass `bundle.artifacts` to the safe installer only after the collector artifact has been joined by the orchestration layer.
