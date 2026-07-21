import { pathToFileURL } from "node:url";
import { discoverNextApp } from "./discover.js";
export async function runSmoke(repositoryRoot) {
    const result = await discoverNextApp({ repositoryRoot });
    const routes = result.manifest.nodes
        .filter((node) => node.kind === "route")
        .map((node) => node.displayName)
        .sort();
    process.stdout.write(`${JSON.stringify({
        repositoryRoot,
        sourceDigest: result.sourceDigest,
        routes,
        routeCount: routes.length,
        nodes: result.manifest.nodes.length,
        edges: result.manifest.edges.length,
        runtimeLocators: result.runtimeLocatorMap.locators.length,
        metrics: result.metricCatalog.metrics.length,
    }, null, 2)}\n`);
}
const invokedPath = process.argv[1];
if (invokedPath !== undefined &&
    import.meta.url === pathToFileURL(invokedPath).href) {
    const repositoryRoot = process.argv[2];
    if (repositoryRoot === undefined) {
        process.stderr.write("Usage: npm run smoke -- <repository-root>\n");
        process.exitCode = 2;
    }
    else {
        await runSmoke(repositoryRoot);
    }
}
//# sourceMappingURL=smoke.js.map