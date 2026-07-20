import type { WorkflowEvent, WorkflowEventKind } from "@living-software/contracts";

export interface ObservationEventBinding {
  readonly eventName: string;
  readonly kind: WorkflowEventKind;
  readonly nodeId: string;
  readonly surfaceId?: string;
}

export interface ObservationTargetEvents {
  readonly click?: ObservationEventBinding;
  readonly change?: ObservationEventBinding;
  readonly submit?: ObservationEventBinding;
  readonly deadClick?: ObservationEventBinding;
  readonly rageClick?: ObservationEventBinding;
  readonly correction?: ObservationEventBinding;
}

export type ObservationStructuralTag =
  | "a"
  | "button"
  | "details"
  | "div"
  | "form"
  | "input"
  | "select"
  | "summary"
  | "textarea";

export type ObservationLocator =
  | {
      readonly strategy: "living-id";
      readonly value: string;
    }
  | {
      readonly strategy: "test-id";
      readonly match: "exact" | "prefix" | "suffix";
      readonly value: string;
    }
  | {
      readonly strategy: "structure";
      readonly tag: ObservationStructuralTag;
      readonly ancestorTags?: readonly ObservationStructuralTag[];
      readonly ordinalWithinParent?: number;
    };

export interface ObservationTarget {
  /** Opaque emitted binding; optionally usable as data-living-node. */
  readonly token: string;
  readonly locators: readonly ObservationLocator[];
  readonly events: ObservationTargetEvents;
}

export interface ObservationRoute {
  /** A pathname template. Dynamic values are matched in memory and never emitted. */
  readonly pattern: string;
  readonly start: ObservationEventBinding;
  readonly complete: ObservationEventBinding;
}

export interface ObservationRuntimeMap {
  readonly schemaVersion: "living.observation-runtime/v1";
  readonly application: {
    readonly appId: string;
    readonly environment: "development" | "preview" | "production";
    readonly releaseRevision: string;
    readonly manifestHash: string;
    readonly synthetic: boolean;
  };
  readonly collector: {
    readonly endpoint: "/api/living/events";
  };
  readonly targets: readonly ObservationTarget[];
  readonly routes: readonly ObservationRoute[];
  readonly systemEvents: {
    readonly sessionEnd: ObservationEventBinding;
    readonly runtimeError: ObservationEventBinding;
    readonly lcp: ObservationEventBinding;
    readonly inp: ObservationEventBinding;
    readonly cls: ObservationEventBinding;
  };
  readonly signals: {
    readonly deadClickDelayMs: number;
    readonly rageClickWindowMs: number;
    readonly rageClickCount: number;
    readonly correctionWindowMs: number;
  };
  readonly limits: {
    readonly maxBatchSize: number;
    readonly maxQueueSize: number;
    readonly maxEventBytes: number;
    readonly maxPayloadBytes: number;
    readonly maxEventsPerMinute: number;
    readonly flushIntervalMs: number;
    readonly requestTimeoutMs: number;
  };
}

export interface GeneratedSourceFile {
  readonly relativePath:
    | "src/instrumentation-client.ts"
    | "src/living-observer.generated.ts";
  readonly content: string;
}

export interface GeneratedNextObserverFiles {
  readonly instrumentationClient: GeneratedSourceFile;
  readonly browserModule: GeneratedSourceFile;
  readonly runtimeMap: ObservationRuntimeMap;
}

export interface BrowserObserverController {
  flush(): Promise<void>;
  routeStart(candidate: string): void;
  stop(): Promise<void>;
  snapshot(): Readonly<{
    queued: number;
    dropped: number;
    sessionId: string;
  }>;
}

/** Compile-time assertion target for generated runtime events. */
export type BrowserWorkflowEvent = WorkflowEvent;
