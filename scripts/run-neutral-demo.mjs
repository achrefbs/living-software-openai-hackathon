import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  parseWorkflowEvent,
  validateWorkflowEventAgainstConfig,
} from "@living-software/contracts";
import { planInit } from "@living-software/cli";
import {
  detectBacktrackingOpportunity,
  projectWorkflowVariants,
} from "@living-software/core";

const sampleRoot = new URL("../samples/neutral-host/", import.meta.url);

async function readJson(name) {
  return JSON.parse(await readFile(new URL(name, sampleRoot), "utf8"));
}

function assertScenarios(candidate) {
  if (
    candidate?.schemaVersion !== "living.synthetic-scenarios/v1" ||
    candidate?.provenance?.source !== "simulator" ||
    candidate?.provenance?.synthetic !== true ||
    !Array.isArray(candidate?.cases)
  ) {
    throw new TypeError("Expected explicitly synthetic workflow scenarios");
  }
  return candidate;
}

export async function buildNeutralDemo() {
  const hostFixture = await readJson("host-fixture.json");
  const scenarios = assertScenarios(await readJson("workflow-scenarios.json"));
  const plan = planInit(hostFixture);

  if (plan.config === undefined || plan.manifest === undefined) {
    throw new Error("The integration plan did not produce config and manifest contracts");
  }
  if (scenarios.appId !== plan.config.application.id) {
    throw new Error("Scenario appId does not match the mapped host");
  }

  const baseTime = Date.parse(scenarios.generatedAt);
  const events = scenarios.cases.flatMap((workflowCase, caseIndex) => {
    if (!Array.isArray(workflowCase.steps)) {
      throw new TypeError(`Scenario '${workflowCase.id}' must declare steps`);
    }
    return workflowCase.steps.map(([name, surfaceId], sequence) => {
      const definition = plan.config.semantics.events[name];
      if (definition === undefined) {
        throw new TypeError(`Scenario event '${name}' is not declared by the host`);
      }
      const event = parseWorkflowEvent({
        schemaVersion: "living.workflow-event/v1",
        eventId: `event.${workflowCase.id}.${sequence}`,
        appId: plan.config.application.id,
        environment: "development",
        releaseRevision: plan.manifest.release.revision,
        occurredAt: new Date(baseTime + caseIndex * 3_600_000 + sequence * 60_000).toISOString(),
        sequence,
        name,
        kind: definition.kind,
        status: "succeeded",
        sessionId: `session.${workflowCase.id}`,
        product: {
          manifestHash: plan.manifest.contentHash,
          nodeId: surfaceId,
          surfaceId,
        },
        metadata: {},
        provenance: scenarios.provenance,
      });
      const validation = validateWorkflowEventAgainstConfig(event, plan.config);
      if (!validation.ok) {
        throw new TypeError(validation.issues.join("; "));
      }
      return event;
    });
  });

  const variants = projectWorkflowVariants(events);
  const opportunity = detectBacktrackingOpportunity({
    events,
    manifestHash: plan.manifest.contentHash,
    evidenceUri: "living://samples/neutral-host/workflow-scenarios",
  });

  if (variants.length !== 2 || opportunity === null) {
    throw new Error("Neutral replay did not reproduce the expected detector result");
  }

  const sampledEventIds = new Set(opportunity.evidence.sampleEventIds);
  const evidenceSessionIds = new Set(
    events
      .filter((event) => sampledEventIds.has(event.eventId))
      .map((event) => event.sessionId),
  );
  const evidenceEvents = events.filter((event) => evidenceSessionIds.has(event.sessionId));

  if (
    evidenceSessionIds.size !== opportunity.evidence.sessionCount ||
    evidenceEvents.length === 0
  ) {
    throw new Error("Neutral replay could not reconstruct the opportunity evidence bundle");
  }

  const report = {
    schemaVersion: "living.neutral-demo-result/v1",
    provenance: scenarios.provenance,
    integrationPlan: {
      command: plan.command,
      mode: plan.mode,
      changes: plan.changes.map(({ action, path, packageName, packageVersion }) => ({
        action,
        path,
        ...(packageName === undefined ? {} : { packageName }),
        ...(packageVersion === undefined ? {} : { packageVersion }),
      })),
      diagnostics: plan.diagnostics,
    },
    mappedHost: {
      appId: plan.manifest.appId,
      manifestHash: plan.manifest.contentHash,
      nodes: plan.manifest.nodes.length,
      edges: plan.manifest.edges.length,
    },
    replay: {
      cases: scenarios.cases.length,
      events: events.length,
      variants,
    },
    opportunity,
  };

  return {
    config: plan.config,
    manifest: plan.manifest,
    events,
    evidenceEvents,
    opportunity,
    report,
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { report } = await buildNeutralDemo();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
