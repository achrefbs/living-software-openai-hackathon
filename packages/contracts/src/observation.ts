import { z } from "zod";

import { workflowEventKindSchema } from "./config.js";
import {
  eventNameSchema,
  identifierSchema,
  sha256Schema,
} from "./primitives.js";

const routePatternSchema = z
  .string()
  .min(1)
  .max(512)
  .startsWith("/")
  .refine((pattern) => !pattern.includes("?") && !pattern.includes("#"), {
    message: "Route patterns cannot contain a query or fragment",
  })
  .refine(
    (pattern) =>
      pattern === "/" ||
      pattern
        .slice(1)
        .split("/")
        .every(
          (segment) =>
            /^[A-Za-z0-9._~-]+$/.test(segment) ||
            /^:[A-Za-z][A-Za-z0-9_]*$/.test(segment) ||
            segment === "*",
        ),
    { message: "Route patterns must contain only safe literal or dynamic segments" },
  );

export const observationEventBindingSchema = z
  .object({
    eventName: eventNameSchema,
    kind: workflowEventKindSchema,
    nodeId: identifierSchema,
    surfaceId: identifierSchema.optional(),
  })
  .strict();

export type ObservationEventBinding = z.infer<
  typeof observationEventBindingSchema
>;

const livingIdLocatorSchema = z
  .object({
    strategy: z.literal("living-id"),
    value: z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:/_-]*$/),
  })
  .strict();

const testIdLocatorSchema = z
  .object({
    strategy: z.literal("test-id"),
    match: z.enum(["exact", "prefix", "suffix"]),
    value: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9._:/-]+$/),
  })
  .strict();

const structuralTagSchema = z.enum([
  "a",
  "button",
  "details",
  "div",
  "form",
  "input",
  "select",
  "summary",
  "textarea",
]);

const structuralLocatorSchema = z
  .object({
    strategy: z.literal("structure"),
    tag: structuralTagSchema,
    ancestorTags: z.array(structuralTagSchema).max(3).optional(),
    ordinalWithinParent: z.number().int().nonnegative().max(50).optional(),
  })
  .strict();

export const observationLocatorSchema = z.discriminatedUnion("strategy", [
  livingIdLocatorSchema,
  testIdLocatorSchema,
  structuralLocatorSchema,
]);

export type ObservationLocator = z.infer<typeof observationLocatorSchema>;

export const observationTargetSchema = z
  .object({
    token: identifierSchema,
    locators: z.array(observationLocatorSchema).min(1).max(8),
    events: z
      .object({
        click: observationEventBindingSchema.optional(),
        change: observationEventBindingSchema.optional(),
        submit: observationEventBindingSchema.optional(),
        deadClick: observationEventBindingSchema.optional(),
        rageClick: observationEventBindingSchema.optional(),
        correction: observationEventBindingSchema.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((target, context) => {
    if (Object.keys(target.events).length === 0) {
      context.addIssue({
        code: "custom",
        path: ["events"],
        message: "An observation target must declare at least one event",
      });
    }
    if (target.events.deadClick !== undefined && target.events.click === undefined) {
      context.addIssue({
        code: "custom",
        path: ["events", "deadClick"],
        message: "Dead-click detection requires a declared click event",
      });
    }
    if (target.events.rageClick !== undefined && target.events.click === undefined) {
      context.addIssue({
        code: "custom",
        path: ["events", "rageClick"],
        message: "Rage-click detection requires a declared click event",
      });
    }
    if (target.events.correction !== undefined && target.events.change === undefined) {
      context.addIssue({
        code: "custom",
        path: ["events", "correction"],
        message: "Correction detection requires a declared change event",
      });
    }
  });

export type ObservationTarget = z.infer<typeof observationTargetSchema>;

export const observationRouteSchema = z
  .object({
    pattern: routePatternSchema,
    start: observationEventBindingSchema,
    complete: observationEventBindingSchema,
  })
  .strict();

export type ObservationRoute = z.infer<typeof observationRouteSchema>;

export const observationRuntimeMapSchema = z
  .object({
    schemaVersion: z.literal("living.observation-runtime/v1"),
    application: z
      .object({
        appId: identifierSchema,
        environment: z.enum(["development", "preview", "production"]),
        releaseRevision: z.string().min(1).max(160),
        manifestHash: sha256Schema,
        synthetic: z.boolean(),
      })
      .strict(),
    collector: z
      .object({
        endpoint: z.literal("/api/living/events"),
      })
      .strict(),
    targets: z.array(observationTargetSchema).max(5_000),
    routes: z.array(observationRouteSchema).max(2_000),
    systemEvents: z
      .object({
        sessionEnd: observationEventBindingSchema,
        runtimeError: observationEventBindingSchema,
        lcp: observationEventBindingSchema,
        inp: observationEventBindingSchema,
        cls: observationEventBindingSchema,
      })
      .strict(),
    signals: z
      .object({
        deadClickDelayMs: z.number().int().min(250).max(5_000),
        rageClickWindowMs: z.number().int().min(250).max(10_000),
        rageClickCount: z.number().int().min(2).max(10),
        correctionWindowMs: z.number().int().min(250).max(30_000),
      })
      .strict(),
    limits: z
      .object({
        maxBatchSize: z.number().int().min(1).max(100),
        maxQueueSize: z.number().int().min(1).max(2_000),
        maxEventBytes: z.number().int().min(512).max(16_384),
        maxPayloadBytes: z.number().int().min(1_024).max(256_000),
        maxEventsPerMinute: z.number().int().min(1).max(10_000),
        flushIntervalMs: z.number().int().min(250).max(60_000),
        requestTimeoutMs: z.number().int().min(250).max(30_000),
      })
      .strict()
      .superRefine((limits, context) => {
        if (limits.maxBatchSize > limits.maxQueueSize) {
          context.addIssue({
            code: "custom",
            path: ["maxBatchSize"],
            message: "Batch size cannot exceed queue size",
          });
        }
        if (limits.maxEventBytes > limits.maxPayloadBytes) {
          context.addIssue({
            code: "custom",
            path: ["maxEventBytes"],
            message: "An event must fit inside a payload",
          });
        }
      }),
  })
  .strict()
  .superRefine((runtime, context) => {
    const tokens = runtime.targets.map((target) => target.token);
    if (new Set(tokens).size !== tokens.length) {
      context.addIssue({
        code: "custom",
        path: ["targets"],
        message: "Observation target tokens must be unique",
      });
    }

    const locatorSignatures = new Set<string>();
    runtime.targets.forEach((target, targetIndex) => {
      target.locators.forEach((locator, locatorIndex) => {
        const signature = JSON.stringify(locator);
        if (locatorSignatures.has(signature)) {
          context.addIssue({
            code: "custom",
            path: ["targets", targetIndex, "locators", locatorIndex],
            message: "Locator descriptors must be unique across observation targets",
          });
        }
        locatorSignatures.add(signature);
      });
    });

    const patterns = runtime.routes.map((route) => route.pattern);
    if (new Set(patterns).size !== patterns.length) {
      context.addIssue({
        code: "custom",
        path: ["routes"],
        message: "Observation route patterns must be unique",
      });
    }

    const bindings = [
      ...runtime.targets.flatMap((target) => Object.values(target.events)),
      ...runtime.routes.flatMap((route) => [route.start, route.complete]),
      ...Object.values(runtime.systemEvents),
    ].filter((binding): binding is ObservationEventBinding => binding !== undefined);

    const declarations = new Map<string, string>();
    for (const binding of bindings) {
      const declaration = `${binding.kind}|${binding.nodeId}|${binding.surfaceId ?? ""}`;
      const previous = declarations.get(binding.eventName);
      if (previous !== undefined && previous !== declaration) {
        context.addIssue({
          code: "custom",
          path: ["targets"],
          message: `Event '${binding.eventName}' cannot point to multiple product nodes or kinds`,
        });
      }
      declarations.set(binding.eventName, declaration);
    }
  });

export type ObservationRuntimeMap = z.infer<
  typeof observationRuntimeMapSchema
>;

export function parseObservationRuntimeMap(input: unknown): ObservationRuntimeMap {
  return observationRuntimeMapSchema.parse(input);
}

/** Exact top-level metadata fields the generated observer can emit. */
export const OBSERVATION_METADATA_KEYS = Object.freeze([
  "errorCategory",
  "interaction",
  "lifecycle",
  "metric",
  "position",
  "routePhase",
  "sanitized",
  "signal",
  "state",
  "targetGeometry",
  "unit",
  "value",
  "viewport",
  "visibility",
] as const);
