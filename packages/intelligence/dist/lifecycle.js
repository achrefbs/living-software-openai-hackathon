/**
 * Reporting is observational only. A broken synchronous or asynchronous
 * reporter must never change whether a model request succeeds or fails.
 */
export function reportIntelligenceLifecycle(reporter, event) {
    if (reporter === undefined)
        return;
    try {
        const result = reporter(Object.freeze(event));
        void Promise.resolve(result).catch(() => undefined);
    }
    catch {
        // Visualization/reporting has no authority over the intelligence request.
    }
}
//# sourceMappingURL=lifecycle.js.map