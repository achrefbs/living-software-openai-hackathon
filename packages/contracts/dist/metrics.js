import { z } from "zod";
import { identifierSchema, isoDateTimeSchema, sha256Schema, } from "./primitives.js";
export const metricUnitSchema = z.enum([
    "count",
    "milliseconds",
    "pixels",
    "ratio",
]);
export const metricValueSchema = z
    .object({
    id: identifierSchema,
    unit: metricUnitSchema,
    value: z.number().finite(),
    samples: z.number().int().nonnegative(),
    productNodeId: identifierSchema.optional(),
    routeNodeId: identifierSchema.optional(),
    viewportClass: z.enum(["small", "medium", "large"]).optional(),
})
    .strict();
export const metricReportSchema = z
    .object({
    schemaVersion: z.literal("living.metric-report/v1"),
    appId: identifierSchema,
    manifestHash: sha256Schema,
    generatedAt: isoDateTimeSchema,
    window: z
        .object({
        from: isoDateTimeSchema,
        to: isoDateTimeSchema,
    })
        .strict(),
    dataOrigin: z.enum(["observed", "synthetic", "mixed"]),
    totals: z
        .object({
        events: z.number().int().nonnegative(),
        sessions: z.number().int().nonnegative(),
        cases: z.number().int().nonnegative(),
        variants: z.number().int().nonnegative(),
    })
        .strict(),
    values: z.array(metricValueSchema).max(10_000),
})
    .strict()
    .superRefine((report, context) => {
    if (Date.parse(report.window.from) > Date.parse(report.window.to)) {
        context.addIssue({
            code: "custom",
            path: ["window"],
            message: "Metric window must not end before it starts",
        });
    }
    const keys = report.values.map((metric) => `${metric.id}|${metric.productNodeId ?? ""}|${metric.routeNodeId ?? ""}|${metric.viewportClass ?? ""}`);
    if (new Set(keys).size !== keys.length) {
        context.addIssue({
            code: "custom",
            path: ["values"],
            message: "Metric report values must have unique scopes",
        });
    }
});
export function parseMetricReport(input) {
    return metricReportSchema.parse(input);
}
//# sourceMappingURL=metrics.js.map