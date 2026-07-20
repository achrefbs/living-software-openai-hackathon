import type { WorkflowEvent } from "@living-software/contracts";

export interface WorkflowCase {
  caseId: string;
  sessionIds: string[];
  events: WorkflowEvent[];
  eventNames: string[];
  surfaces: string[];
  durationMs: number;
  outcome: "succeeded" | "failed" | "abandoned" | "unknown";
}

export interface WorkflowVariant {
  signature: string;
  eventNames: string[];
  caseCount: number;
  sessionCount: number;
  averageDurationMs: number;
  outcomes: Record<WorkflowCase["outcome"], number>;
}

export interface WorkflowJourneyStep {
  event: WorkflowEvent;
  kind: "route" | "action" | "outcome";
  nodeId: string;
}

function caseKey(event: WorkflowEvent): string {
  return event.subject === undefined
    ? `session:${event.sessionId}`
    : `${event.subject.type}:${event.subject.pseudonymousId}`;
}

function compareEvents(left: WorkflowEvent, right: WorkflowEvent): number {
  const byTime = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
  return byTime !== 0 ? byTime : left.sequence - right.sequence;
}

function journeyStep(event: WorkflowEvent): WorkflowJourneyStep | undefined {
  const nodeId =
    event.product?.nodeId ?? event.product?.surfaceId ?? event.name;

  if (
    event.kind === "navigation" &&
    event.status === "succeeded" &&
    event.metadata.routePhase !== "start"
  ) {
    return { event, kind: "route", nodeId };
  }
  if (event.kind === "action") {
    return { event, kind: "action", nodeId };
  }
  if (event.kind === "outcome" && event.metadata.signal === undefined) {
    return { event, kind: "outcome", nodeId };
  }
  return undefined;
}

/**
 * Projects telemetry onto meaningful user-journey steps. Explicit route
 * starts, system/performance events, errors, and technical friction signals
 * are not journey movement. Successful legacy navigation events without a
 * routePhase are treated as completed routes. Consecutive duplicate route
 * completions are collapsed because instrumentation can report them twice.
 */
export function projectWorkflowJourneySteps(
  events: readonly WorkflowEvent[],
): WorkflowJourneyStep[] {
  const steps: WorkflowJourneyStep[] = [];
  for (const event of [...events].sort(compareEvents)) {
    const step = journeyStep(event);
    if (step === undefined) continue;
    const previous = steps.at(-1);
    if (
      step.kind === "route" &&
      previous?.kind === "route" &&
      previous.nodeId === step.nodeId
    ) {
      continue;
    }
    steps.push(step);
  }
  return steps;
}

export function findBacktrackingRevisitIndexes(
  steps: readonly WorkflowJourneyStep[],
): number[] {
  const seen = new Set<string>();
  const revisits: number[] = [];

  steps.forEach((step, index) => {
    if (seen.has(step.nodeId) && steps[index - 1]?.nodeId !== step.nodeId) {
      revisits.push(index);
    }
    seen.add(step.nodeId);
  });
  return revisits;
}

function caseOutcome(events: WorkflowEvent[]): WorkflowCase["outcome"] {
  if (events.some((event) => event.status === "abandoned")) {
    return "abandoned";
  }
  if (events.some((event) => event.status === "failed")) {
    return "failed";
  }
  if (
    events.some(
      (event) => event.kind === "outcome" && event.status === "succeeded",
    )
  ) {
    return "succeeded";
  }
  return "unknown";
}

export function projectWorkflowCases(events: WorkflowEvent[]): WorkflowCase[] {
  const grouped = new Map<string, WorkflowEvent[]>();

  for (const event of events) {
    const key = caseKey(event);
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  return [...grouped.entries()]
    .map(([id, groupedEvents]) => {
      const ordered = [...groupedEvents].sort(compareEvents);
      const journey = projectWorkflowJourneySteps(ordered);
      const startedAt = Date.parse(ordered[0]?.occurredAt ?? "");
      const endedAt = Date.parse(ordered.at(-1)?.occurredAt ?? "");

      return {
        caseId: id,
        sessionIds: [...new Set(ordered.map((event) => event.sessionId))],
        events: ordered,
        eventNames: ordered.map((event) => event.name),
        surfaces: journey.map((step) => step.nodeId),
        durationMs:
          Number.isFinite(startedAt) && Number.isFinite(endedAt)
            ? Math.max(0, endedAt - startedAt)
            : 0,
        outcome: caseOutcome(ordered),
      };
    })
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
}

export function projectWorkflowVariants(
  events: WorkflowEvent[],
): WorkflowVariant[] {
  const variants = new Map<
    string,
    {
      eventNames: string[];
      cases: WorkflowCase[];
    }
  >();

  for (const workflowCase of projectWorkflowCases(events)) {
    const signature = workflowCase.eventNames.join(" -> ");
    const existing = variants.get(signature);
    if (existing === undefined) {
      variants.set(signature, {
        eventNames: workflowCase.eventNames,
        cases: [workflowCase],
      });
    } else {
      existing.cases.push(workflowCase);
    }
  }

  return [...variants.entries()]
    .map(([signature, value]) => {
      const outcomes: WorkflowVariant["outcomes"] = {
        succeeded: 0,
        failed: 0,
        abandoned: 0,
        unknown: 0,
      };
      for (const workflowCase of value.cases) {
        outcomes[workflowCase.outcome] += 1;
      }

      return {
        signature,
        eventNames: value.eventNames,
        caseCount: value.cases.length,
        sessionCount: new Set(
          value.cases.flatMap((workflowCase) => workflowCase.sessionIds),
        ).size,
        averageDurationMs:
          value.cases.reduce(
            (sum, workflowCase) => sum + workflowCase.durationMs,
            0,
          ) / value.cases.length,
        outcomes,
      };
    })
    .sort(
      (left, right) =>
        right.caseCount - left.caseCount ||
        left.signature.localeCompare(right.signature),
    );
}
