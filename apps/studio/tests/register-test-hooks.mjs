import { registerHooks } from "node:module";

const emptyModule = "data:text/javascript,export%20{}";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { format: "module", shortCircuit: true, url: emptyModule };
    }
    return nextResolve(specifier, context);
  },
});
