"use client";

import {
  parseLiveCommandEnvelope,
  parseLiveCommandResult,
  parseLiveEvent,
  parseLiveView,
  type DetectorProgress,
  type LiveCommandEnvelope,
  type LiveEvent,
  type LiveState,
  type LiveView,
} from "@living-software/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { deriveLivePipeline } from "@/lib/live-pipeline";

import styles from "./live-run.module.css";

type Connection = LiveState["connection"];
type Provider = "codex" | "api";
type DetectorKind = DetectorProgress["signalKind"] | "repeated-sequence";
type DetectorProgressView = Omit<DetectorProgress, "signalKind"> & {
  signalKind: DetectorKind;
  affectedSessions?: number;
  minimumIndependentSessions?: number;
};

const DETECTORS = [
  {
    kind: "rework-loop",
    label: "Rework loop",
    detail: "Repeated correction-oriented paths across workflow cases.",
  },
  {
    kind: "failure-cluster",
    label: "Failure cluster",
    detail: "Captured interaction failures concentrated across cases.",
  },
  {
    kind: "repeated-sequence",
    label: "Recurring workflow",
    detail:
      "A recurring route and action sequence observed across independent sessions; recurrence alone does not prove friction or intent.",
  },
  {
    kind: "backtracking",
    label: "Backtracking",
    detail: "Repeated revisits within the same workflow case.",
  },
] as const satisfies readonly Readonly<{
  kind: DetectorKind;
  label: string;
  detail: string;
}>[];

const ACTOR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u;

function formatTime(value: string | undefined): string {
  if (value === undefined) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(parsed);
}

function humanize(value: string): string {
  const spaced = value.replaceAll("-", " ").replaceAll(".", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function toneForState(value: LiveEvent["state"]): string {
  if (value === "completed") return styles.positive;
  if (value === "failed") return styles.negative;
  if (value === "started" || value === "progress") return styles.active;
  return styles.waiting;
}

function runtimeStatement(runtime: LiveState["runtime"]): string {
  switch (runtime.status) {
    case "not-available":
      return "No runtime response has been recorded. Source state and static proof do not establish host behavior.";
    case "responded":
      return `The configured host responded at ${formatTime(runtime.observedAt)}. An HTTP response does not prove that the proposed behavior is correct.`;
    case "verified":
      return `A separate runtime verification was recorded at ${formatTime(runtime.observedAt)}. It remains distinct from source application and static proof.`;
    case "failed":
      return `The runtime check failed at ${formatTime(runtime.observedAt)}. This does not rewrite the authoritative source or receipt history.`;
  }
}

function receiptActorDetail(
  actor: NonNullable<LiveView["evolution"]>["receipts"][number]["actor"],
): string {
  switch (actor.type) {
    case "human":
      return actor.id;
    case "system":
      return `${actor.component}@${actor.version}`;
    case "model":
      return `${actor.provider} · ${actor.model} · ${actor.runId}`;
  }
}

function ModelRun({
  label,
  run,
}: {
  label: string;
  run: NonNullable<LiveView["evolution"]>["modelRuns"]["interpretation"];
}) {
  const usage = run.tokenUsage;
  return (
    <article className={styles.modelRun}>
      <span className={styles.kicker}>{label}</span>
      <h3>{run.transport === "codex-cli" ? "Codex CLI" : "Responses API"}</h3>
      <dl className={styles.compactFacts}>
        <div><dt>Requested</dt><dd>{run.requestedModel}</dd></div>
        <div><dt>Actual</dt><dd>{run.actualModel ?? "Not reported"}</dd></div>
        <div><dt>Run ID</dt><dd><code>{run.runId ?? "Not reported"}</code></dd></div>
        <div>
          <dt>Tokens</dt>
          <dd>
            {usage === null
              ? "Not reported"
              : `${usage.inputTokens} in · ${usage.outputTokens} out · ${usage.reasoningOutputTokens} reasoning`}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function DetectorCard({ progress, slot }: {
  progress: DetectorProgressView | undefined;
  slot: (typeof DETECTORS)[number];
}) {
  return (
    <article className={styles.detectorCard}>
      <div className={styles.detectorHeading}>
        <div>
          <span className={styles.kicker}>Deterministic detector</span>
          <h3>{slot.label}</h3>
        </div>
        <span className={`${styles.threshold} ${progress?.thresholdMet ? styles.positive : styles.waiting}`}>
          {progress === undefined
            ? "Awaiting count"
            : progress.thresholdMet
              ? "Threshold met"
              : "Below threshold"}
        </span>
      </div>
      <p>{slot.detail}</p>
      {progress === undefined ? (
        <p className={styles.emptyFact}>No validated detector count has been reported.</p>
      ) : (
        <>
          <div className={styles.detectorCount}>
            <strong>{progress.affectedCases}</strong>
            <span>affected of {progress.totalCases} cases</span>
          </div>
          <dl className={styles.compactFacts}>
            <div><dt>Required</dt><dd>{progress.minimumAffectedCases} cases</dd></div>
            <div><dt>Occurrences</dt><dd>{progress.occurrenceCount}</dd></div>
            <div><dt>Version</dt><dd>{progress.detectorVersion}</dd></div>
            {progress.minimumRevisitsPerCase !== undefined && (
              <div><dt>Revisits / case</dt><dd>{progress.minimumRevisitsPerCase} minimum</dd></div>
            )}
            {progress.affectedSessions !== undefined && (
              <div><dt>Independent sessions</dt><dd>{progress.affectedSessions}</dd></div>
            )}
            {progress.minimumIndependentSessions !== undefined && (
              <div><dt>Required sessions</dt><dd>{progress.minimumIndependentSessions}</dd></div>
            )}
          </dl>
        </>
      )}
    </article>
  );
}

function EventRail({ events }: { events: readonly LiveEvent[] }) {
  if (events.length === 0) {
    return <p className={styles.emptyRail}>Waiting for validated lifecycle events from the durable stream.</p>;
  }
  return (
    <ol className={styles.eventRail}>
      {[...events].reverse().map((event) => {
        const refs = Object.entries(event.refs).filter((entry): entry is [string, string] =>
          typeof entry[1] === "string"
        );
        return (
          <li key={`${event.sessionId}:${event.sequence}`}>
            <span className={`${styles.eventDot} ${toneForState(event.state)}`} aria-hidden="true" />
            <details>
              <summary>
                <span>
                  <strong>{event.summary}</strong>
                  <small>{humanize(event.stage)} · {humanize(event.state)} · {humanize(event.actor)}</small>
                </span>
                <time dateTime={event.emittedAt}>{formatTime(event.emittedAt)}</time>
              </summary>
              <dl className={styles.eventRefs}>
                <div><dt>Sequence</dt><dd>{event.sequence}</dd></div>
                <div><dt>Event hash</dt><dd><code>{event.eventHash}</code></dd></div>
                {refs.map(([key, value]) => (
                  <div key={key}><dt>{humanize(key)}</dt><dd><code>{value}</code></dd></div>
                ))}
                {refs.length === 0 && <div><dt>References</dt><dd>No artifact reference on this event.</dd></div>}
              </dl>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

function buildCommand(
  view: LiveView,
  provider: Provider,
  actor: string,
  reviewConfirmed: boolean,
): LiveCommandEnvelope | null {
  const { application } = view.state;
  if (
    application?.manifestHash === undefined ||
    view.snapshotHash === null ||
    view.state.integrity.status !== "valid"
  ) return null;

  const common = {
    schemaVersion: "living.live-command/v1" as const,
    commandId: `live-command-${crypto.randomUUID()}`,
    sessionId: view.state.sessionId,
    appId: application.appId,
    manifestHash: application.manifestHash,
    snapshotHash: view.snapshotHash,
    expectedRevision: view.evolution?.revision ?? 0,
  };
  const action = view.nextAction.type;
  if (action === "prepare" && view.opportunity !== null) {
    return parseLiveCommandEnvelope({
      ...common,
      command: {
        type: "evolution.prepare",
        provider,
        opportunityId: view.opportunity.opportunityId,
        eventSetHash: view.opportunity.eventSetHash,
      },
    });
  }
  if (view.evolution === null) return null;
  if (
    action === "approve" &&
    reviewConfirmed &&
    ACTOR_PATTERN.test(actor) &&
    view.evolution.normalizedDiff !== null &&
    view.evolution.proofChecks.every((check) => check.status === "passed")
  ) {
    return parseLiveCommandEnvelope({
      ...common,
      command: {
        type: "evolution.approve",
        evolutionId: view.evolution.evolutionId,
        humanId: actor,
        reviewConfirmed: true,
        artifactHash: view.evolution.artifactHash,
        proofHash: view.evolution.proofHash,
      },
    });
  }
  if (action === "apply") {
    return parseLiveCommandEnvelope({
      ...common,
      command: {
        type: "evolution.apply",
        evolutionId: view.evolution.evolutionId,
        artifactHash: view.evolution.artifactHash,
        proofHash: view.evolution.proofHash,
      },
    });
  }
  if (action === "rollback" && ACTOR_PATTERN.test(actor)) {
    return parseLiveCommandEnvelope({
      ...common,
      command: {
        type: "evolution.rollback",
        evolutionId: view.evolution.evolutionId,
        humanId: actor,
        artifactHash: view.evolution.artifactHash,
        proofHash: view.evolution.proofHash,
      },
    });
  }
  return null;
}

export function LiveRunClient() {
  const [view, setView] = useState<LiveView | null>(null);
  const [events, setEvents] = useState<readonly LiveEvent[]>([]);
  const [streamConnection, setStreamConnection] = useState<Connection>("reconnecting");
  const [stateError, setStateError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("Connecting to the validated live event stream.");
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<Provider>("codex");
  const [actor, setActor] = useState("");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [appliedSequence, setAppliedSequence] = useState<number | null>(null);
  const [hostResponseAfterApply, setHostResponseAfterApply] = useState<
    number | null
  >(null);
  const requests = useRef(new Set<AbortController>());
  const requestSequence = useRef(0);
  const latestSettledRequest = useRef(0);

  const refreshState = useCallback(async (): Promise<LiveView | null> => {
    const controller = new AbortController();
    requests.current.add(controller);
    const sequence = ++requestSequence.current;
    try {
      const response = await fetch("/api/live/state", {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Live state is unavailable.");
      const parsed = parseLiveView(await response.json() as unknown);
      if (sequence >= latestSettledRequest.current) {
        latestSettledRequest.current = sequence;
        setView(parsed);
        setStateError(null);
      }
      return parsed;
    } catch (error) {
      if (controller.signal.aborted) return null;
      if (sequence >= latestSettledRequest.current) {
        latestSettledRequest.current = sequence;
        setStateError(error instanceof Error ? error.message : "Live state failed validation.");
      }
      return null;
    } finally {
      requests.current.delete(controller);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let disconnectStream: (() => void) | null = null;

    const connect = async (): Promise<void> => {
      const initialView = await refreshState();
      if (cancelled || initialView === null) return;

      const initialHeadSequence = initialView.state.headSequence ?? -1;
      const source = new EventSource("/api/live/events");
      const onOpen = () => {
        setStreamConnection("connected");
        setStreamError(null);
        setAnnouncement("Connected to the validated live event stream.");
      };
      const onError = () => {
        const disconnected = source.readyState === EventSource.CLOSED;
        setStreamConnection(disconnected ? "disconnected" : "reconnecting");
        setStreamError(
          disconnected
            ? "The live event stream disconnected."
            : "The live event stream is reconnecting automatically.",
        );
      };
      const onLiveEvent = (message: Event) => {
        try {
          const parsed = parseLiveEvent(
            JSON.parse((message as MessageEvent<string>).data) as unknown,
          );
          setEvents((current) => {
            const bySequence = new Map(
              current
                .filter((event) => event.sessionId === parsed.sessionId)
                .map((event) => [event.sequence, event]),
            );
            bySequence.set(parsed.sequence, parsed);
            return [...bySequence.values()]
              .sort((left, right) => left.sequence - right.sequence)
              .slice(-200);
          });
          if (
            parsed.kind === "source-transition" &&
            parsed.facts.transition === "apply" &&
            parsed.sequence > initialHeadSequence
          ) {
            setAppliedSequence(parsed.sequence);
            setHostResponseAfterApply(null);
          }
          setAnnouncement(
            `${parsed.summary}. ${humanize(parsed.state)} at ${formatTime(parsed.emittedAt)}.`,
          );
          setStreamError(null);
          void refreshState();
        } catch {
          setStreamError(
            "A live event failed validation; the visible state was not refreshed.",
          );
        }
      };
      source.addEventListener("open", onOpen);
      source.addEventListener("error", onError);
      source.addEventListener("live-event", onLiveEvent);
      disconnectStream = () => {
        source.removeEventListener("open", onOpen);
        source.removeEventListener("error", onError);
        source.removeEventListener("live-event", onLiveEvent);
        source.close();
      };
      if (cancelled) disconnectStream();
    };

    void connect();
    return () => {
      cancelled = true;
      disconnectStream?.();
      for (const controller of requests.current) controller.abort();
      requests.current.clear();
    };
  }, [refreshState]);

  const displayConnection = streamConnection === "connected"
    ? view?.state.connection ?? "connected"
    : streamConnection;
  const command = useMemo(
    () => view === null
      ? null
      : buildCommand(view, provider, actor, reviewConfirmed),
    [actor, provider, reviewConfirmed, view],
  );

  const sendCommand = useCallback(async () => {
    if (
      view === null ||
      command === null ||
      !view.nextAction.commandEnabled ||
      busy
    ) return;
    setBusy(true);
    setCommandError(null);
    setCommandMessage(null);
    try {
      const response = await fetch("/api/live/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      const result = parseLiveCommandResult(await response.json() as unknown);
      if (!response.ok || !result.accepted) {
        throw new Error(
          result.error?.message ?? "The governed command was rejected.",
        );
      }
      setCommandMessage(
        `Command accepted at revision ${result.revision}. Waiting for the authoritative live event before changing the view.`,
      );
      setReviewConfirmed(false);
    } catch (error) {
      setCommandError(
        error instanceof Error ? error.message : "The governed command failed.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, command, view]);

  return (
    <>
      <a className={styles.skipLink} href="#live-main">Skip to live run</a>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <a className={styles.brand} href="/" aria-label="Living Studio home">
            <span aria-hidden="true">L</span>
            <span>
              <strong>Living Studio</strong>
              <small>Validated live run</small>
            </span>
          </a>
          <div className={styles.connection} role="status" aria-live="polite">
            <span
              className={`${styles.connectionDot} ${styles[displayConnection]}`}
              aria-hidden="true"
            />
            <span>
              <small>Event stream</small>
              <strong>{humanize(displayConnection)}</strong>
            </span>
          </div>
        </header>

        <main className={styles.main} id="live-main">
          <p
            className={styles.srOnly}
            aria-live="polite"
            aria-atomic="true"
          >
            {announcement}
          </p>
          {(stateError !== null || streamError !== null) && (
            <div className={styles.alert} role="alert">
              <strong>Live connection needs attention.</strong>
              <span>{stateError ?? streamError}</span>
            </div>
          )}

          {view === null ? (
            <section
              className={styles.loading}
              aria-busy="true"
              aria-labelledby="live-loading-title"
            >
              <span className={styles.loadingMark} aria-hidden="true" />
              <div>
                <p className={styles.kicker}>Live run</p>
                <h1 id="live-loading-title">Reading validated host state</h1>
              </div>
            </section>
          ) : (
            <LiveDashboard
              actor={actor}
              appliedSequence={appliedSequence}
              busy={busy}
              commandAvailable={command !== null && view.nextAction.commandEnabled}
              commandError={commandError}
              commandMessage={commandMessage}
              events={events}
              hostRespondedAfterApply={
                appliedSequence !== null &&
                hostResponseAfterApply === appliedSequence
              }
              onActorChange={setActor}
              onCommand={() => void sendCommand()}
              onHostRespondedAfterApply={setHostResponseAfterApply}
              onProviderChange={setProvider}
              onReviewChange={setReviewConfirmed}
              provider={provider}
              reviewConfirmed={reviewConfirmed}
              view={view}
            />
          )}
        </main>
      </div>
    </>
  );
}

type DashboardProps = Readonly<{
  actor: string;
  appliedSequence: number | null;
  busy: boolean;
  commandAvailable: boolean;
  commandError: string | null;
  commandMessage: string | null;
  events: readonly LiveEvent[];
  hostRespondedAfterApply: boolean;
  onActorChange(value: string): void;
  onCommand(): void;
  onHostRespondedAfterApply(sequence: number): void;
  onProviderChange(value: Provider): void;
  onReviewChange(value: boolean): void;
  provider: Provider;
  reviewConfirmed: boolean;
  view: LiveView;
}>;

function LiveDashboard(props: DashboardProps) {
  const { view } = props;
  const { state, evolution, opportunity } = view;
  const application = state.application;
  const headerHost = {
    appId: application?.appId ?? view.mappedHost.appId,
    displayName: application?.displayName ?? view.mappedHost.displayName,
    environment: application?.environment,
    releaseRevision:
      application?.releaseRevision ?? view.mappedHost.releaseRevision,
    framework:
      `${humanize(view.mappedHost.framework)} · ${view.mappedHost.detectedVersion}`,
  };
  const origin = opportunity?.dataOrigin ?? application?.dataOrigin ?? "system";
  const pipeline = deriveLivePipeline(state);
  const progressByKind = new Map<DetectorKind, DetectorProgressView>(
    state.detectorProgress.map((progress) => [progress.signalKind, progress]),
  );
  const supportedAction = ["prepare", "approve", "apply", "rollback"]
    .includes(view.nextAction.type);
  const needsActor =
    view.nextAction.type === "approve" || view.nextAction.type === "rollback";
  const actorValid = ACTOR_PATTERN.test(props.actor);
  const frames = [
    {
      id: "host",
      label: "Connected host",
      title: "Current host response",
      detail:
        "A response from this frame is not proof that the proposed behavior is correct.",
      url: view.hostUrl,
    },
    ...(view.beforeUrl === null
      ? []
      : [{
          id: "before",
          label: "Before",
          title: "Reviewed preimage",
          detail:
            "Configured comparison for the source version before the proposal.",
          url: view.beforeUrl,
        }]),
    ...(view.previewUrl === null
      ? []
      : [{
          id: "proposed",
          label: "Proposed · isolated",
          title: "GPT-authored candidate",
          detail:
            "An isolated preview of the proposed postimage; it is not approval or application.",
          url: view.previewUrl,
        }]),
  ];

  return (
    <div className={styles.dashboard}>
      <section className={styles.hero} aria-labelledby="live-run-title">
        <div className={styles.heroCopy}>
          <div className={styles.heroLabels}>
            <span className={styles.livePill}>
              <span aria-hidden="true" />
              Live run
            </span>
            <span
              className={`${styles.originPill} ${
                origin === "synthetic" ? styles.synthetic : ""
              }`}
            >
              Evidence origin: {humanize(origin)}
            </span>
          </div>
          <h1 id="live-run-title">
            {headerHost.displayName}
          </h1>
          <p>
            Evidence, detector counts, GPT-authored proposals, deterministic
            proof, human authority, and source/runtime state—kept visibly
            separate.
          </p>
        </div>
        <dl className={styles.hostIdentity}>
          <div>
            <dt>Host ID</dt>
            <dd><code>{headerHost.appId}</code></dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>
              {headerHost.environment === undefined
                ? "Not available"
                : humanize(headerHost.environment)}
            </dd>
          </div>
          <div>
            <dt>Release</dt>
            <dd><code>{headerHost.releaseRevision}</code></dd>
          </div>
          <div>
            <dt>Framework</dt>
            <dd>{headerHost.framework}</dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd><time dateTime={state.generatedAt}>{formatTime(state.generatedAt)}</time></dd>
          </div>
          <div>
            <dt>Install</dt>
            <dd>{humanize(state.installation)}</dd>
          </div>
          <div>
            <dt>Integrity</dt>
            <dd>
              {state.integrity.status === "valid"
                ? "Validated"
                : `Error · ${state.integrity.errorCode}`}
            </dd>
          </div>
        </dl>
      </section>

      {(origin === "synthetic" || origin === "mixed") && (
        <aside
          className={styles.syntheticWarning}
          aria-label="Synthetic evidence warning"
        >
          <strong>
            {origin === "synthetic"
              ? "Synthetic evidence only"
              : "Mixed evidence includes synthetic activity"}
          </strong>
          <p>
            Detector counts and model context must not be presented as
            production user behavior.
          </p>
        </aside>
      )}

      <section
        className={styles.pipelineSection}
        aria-labelledby="pipeline-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Authoritative lifecycle</p>
            <h2 id="pipeline-title">From host signal to governed change</h2>
          </div>
          <span className={`${styles.stageBadge} ${toneForState(state.stageState)}`}>
            {humanize(state.activeStage)} · {humanize(state.stageState)}
          </span>
        </div>
        <ol className={styles.pipeline}>
          {pipeline.main.map((item, index) => {
            return (
              <li
                className={item.current ? styles.currentStage : ""}
                key={item.stage}
              >
                <span
                  className={`${styles.pipelineMarker} ${toneForState(item.state)}`}
                  aria-hidden="true"
                >
                  {item.state === "completed" ? "✓" : index + 1}
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{humanize(item.state)}</small>
                </span>
              </li>
            );
          })}
        </ol>
        <ul
          aria-label="Source, runtime, and recovery branches"
          className={styles.pipelineBranches}
        >
          {pipeline.branches.map((item) => (
            <li
              className={item.current ? styles.currentStage : ""}
              key={item.stage}
            >
              <span className={styles.branchLabel}>{humanize(item.branch)} branch</span>
              <span
                className={`${styles.pipelineMarker} ${toneForState(item.state)}`}
                aria-hidden="true"
              >
                {item.state === "completed" ? "✓" : "↳"}
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{humanize(item.state)}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="detectors-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>What the software learned</p>
            <h2 id="detectors-title">Detector evidence, with actual counts</h2>
          </div>
          <span>
            {state.evidence.workflowCaseCount} workflow cases · {state.evidence.eventCount} events
          </span>
        </div>
        <div className={styles.detectorGrid}>
          {DETECTORS.map((slot) => (
            <DetectorCard
              key={slot.kind}
              progress={progressByKind.get(slot.kind)}
              slot={slot}
            />
          ))}
        </div>
      </section>

      <section
        className={styles.truthGrid}
        aria-label="Learned, invented, and proved boundaries"
      >
        <article>
          <span className={styles.truthIndex}>01</span>
          <p className={styles.kicker}>Living learned</p>
          <h2>Observed and detected</h2>
          <p>
            {opportunity === null
              ? "No evidence-bound opportunity has crossed a detector threshold."
              : `${opportunity.affectedCases} affected workflow cases and ${opportunity.occurrenceCount} occurrences support a ${humanize(opportunity.signalKind)} signal.`}
          </p>
        </article>
        <article>
          <span className={styles.truthIndex}>02</span>
          <p className={styles.kicker}>GPT invented</p>
          <h2>A candidate, not a fact</h2>
          <p>
            {evolution === null
              ? "No GPT-authored source proposal is recorded for this evidence."
              : evolution.proposalSummary}
          </p>
        </article>
        <article>
          <span className={styles.truthIndex}>03</span>
          <p className={styles.kicker}>Living proved</p>
          <h2>Deterministic boundaries</h2>
          <p>
            {evolution === null
              ? "No proposal artifact has reached deterministic proof."
              : `${evolution.proofChecks.filter((check) => check.status === "passed").length} of ${evolution.proofChecks.length} exact checks passed. Proof does not grant approval or runtime truth.`}
          </p>
        </article>
      </section>

      <section className={styles.nextAction} aria-labelledby="next-action-title">
        <div>
          <p className={styles.kicker}>One governed next action</p>
          <h2 id="next-action-title">{view.nextAction.label}</h2>
          <p>
            {view.nextAction.reason ??
              "The current validated state determines this action."}
          </p>
        </div>
        <div className={styles.actionControls}>
          {view.nextAction.type === "prepare" && (
            <label>
              Model transport
              <select
                disabled={props.busy}
                onChange={(event) =>
                  props.onProviderChange(event.target.value as Provider)
                }
                value={props.provider}
              >
                <option value="codex">Codex CLI</option>
                <option value="api">Responses API</option>
              </select>
            </label>
          )}
          {needsActor && (
            <label htmlFor="live-actor">
              Human receipt label
              <input
                aria-describedby="live-actor-help"
                autoComplete="off"
                disabled={props.busy}
                id="live-actor"
                maxLength={160}
                onChange={(event) => props.onActorChange(event.target.value)}
                placeholder="operator.label"
                value={props.actor}
              />
              <small id="live-actor-help">
                A bounded local receipt label; not authenticated identity.
              </small>
            </label>
          )}
          {view.nextAction.type === "approve" && (
            <label className={styles.reviewCheck}>
              <input
                checked={props.reviewConfirmed}
                disabled={props.busy}
                onChange={(event) => props.onReviewChange(event.target.checked)}
                type="checkbox"
              />
              <span>
                I reviewed the exact proposal, normalized diff, artifact hash,
                and proof hash. I understand approval does not apply source.
              </span>
            </label>
          )}
          {supportedAction ? (
            <button
              className={styles.primaryButton}
              disabled={
                !props.commandAvailable ||
                props.busy ||
                (needsActor && !actorValid)
              }
              onClick={props.onCommand}
              type="button"
            >
              {props.busy
                ? "Submitting governed command…"
                : view.nextAction.label}
            </button>
          ) : (
            <p className={styles.informationalAction}>
              This state exposes guidance, not a browser mutation command.
            </p>
          )}
          <p className={styles.commandStatus} aria-live="polite">
            {props.commandMessage}
          </p>
          {props.commandError !== null && (
            <p className={styles.commandError} role="alert">
              {props.commandError}
            </p>
          )}
        </div>
      </section>

      {evolution !== null && (
        <section
          className={styles.proposalSection}
          aria-labelledby="proposal-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>Exact GPT-authored proposal</p>
              <h2 id="proposal-title">{evolution.title}</h2>
            </div>
            <span
              className={`${styles.stageBadge} ${
                evolution.status === "applied" ? styles.positive : styles.waiting
              }`}
            >
              {humanize(evolution.status)}
            </span>
          </div>
          <div className={styles.proposalGrid}>
            <article>
              <h3>Interpretation</h3>
              <p>{evolution.interpretation}</p>
            </article>
            <article>
              <h3>Proposed change</h3>
              <p><strong>{evolution.proposalSummary}</strong></p>
              <p>{evolution.proposalRationale}</p>
              <code>{evolution.targetPath}</code>
            </article>
          </div>
          <details className={styles.diff} open>
            <summary>Normalized source diff</summary>
            {evolution.normalizedDiff === null ? (
              <p>
                The bounded normalized diff is unavailable. Approval must remain
                blocked outside an exact review path.
              </p>
            ) : (
              <pre>{evolution.normalizedDiff}</pre>
            )}
          </details>
        </section>
      )}

      {evolution !== null && (
        <section
          className={styles.proofSection}
          aria-labelledby="proof-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>Deterministic proof</p>
              <h2 id="proof-title">Checks and exact bindings</h2>
            </div>
          </div>
          <div className={styles.proofGrid}>
            <div className={styles.checkList}>
              {evolution.proofChecks.map((check) => (
                <article key={check.id}>
                  <span
                    className={
                      check.status === "passed"
                        ? styles.positive
                        : styles.negative
                    }
                  >
                    {check.status === "passed" ? "Passed" : "Failed"}
                  </span>
                  <div>
                    <h3>{check.id}</h3>
                    <p>{check.detail}</p>
                  </div>
                </article>
              ))}
            </div>
            <dl className={styles.hashList}>
              <div><dt>Artifact</dt><dd><code>{evolution.artifactHash}</code></dd></div>
              <div><dt>Proof</dt><dd><code>{evolution.proofHash}</code></dd></div>
              <div><dt>Preimage</dt><dd><code>{evolution.preimageHash}</code></dd></div>
              <div><dt>Postimage</dt><dd><code>{evolution.postimageHash}</code></dd></div>
              <div><dt>Current source</dt><dd><code>{evolution.currentSourceHash}</code></dd></div>
            </dl>
          </div>
          <div className={styles.modelGrid}>
            <ModelRun
              label="Evidence interpretation"
              run={evolution.modelRuns.interpretation}
            />
            <ModelRun label="Source patch" run={evolution.modelRuns.patch} />
          </div>
        </section>
      )}

      <section
        className={styles.sourceRuntime}
        aria-labelledby="source-runtime-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Do not collapse these states</p>
            <h2 id="source-runtime-title">Source versus runtime</h2>
          </div>
        </div>
        <div>
          <article>
            <span className={styles.kicker}>Authoritative source</span>
            <h3>
              {state.source
                ? humanize(state.source.status)
                : "No source evolution"}
            </h3>
            <p>
              {state.source
                ? <>The current source hash is <code>{state.source.currentHash}</code>.</>
                : "No prepared, approved, applied, or rolled-back source state is recorded."}
            </p>
          </article>
          <article>
            <span className={styles.kicker}>Host response</span>
            <h3>{humanize(state.runtime.status)}</h3>
            <p>{runtimeStatement(state.runtime)}</p>
          </article>
        </div>
      </section>

      <section aria-labelledby="frames-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Configured loopback views</p>
            <h2 id="frames-title">Host, before, and proposed</h2>
          </div>
          <span>Frames appear only when a validated URL exists.</span>
        </div>
        <div className={styles.frameGrid}>
          {frames.map((frame) => (
            <article
              className={`${styles.frameCard} ${
                frame.id === "host" && props.appliedSequence !== null
                  ? styles.applyPulse
                  : ""
              }`}
              key={
                frame.id === "host"
                  ? `host-${props.appliedSequence ?? "idle"}`
                  : frame.id
              }
            >
              <header>
                <div>
                  <span className={styles.kicker}>{frame.label}</span>
                  <h3>{frame.title}</h3>
                  <p>{frame.detail}</p>
                </div>
              </header>
              <iframe
                loading="lazy"
                onLoad={() => {
                  if (
                    frame.id === "host" &&
                    props.appliedSequence !== null
                  ) {
                    props.onHostRespondedAfterApply(props.appliedSequence);
                  }
                }}
                sandbox="allow-same-origin allow-scripts"
                src={frame.url}
                title={`${frame.label}: ${
                  headerHost.displayName
                }`}
              />
              {frame.id === "host" && props.hostRespondedAfterApply && (
                <p className={styles.hostResponse} role="status">
                  Host responded after source apply — visually inspect the change.
                </p>
              )}
              <a
                href={frame.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                Open {frame.label.toLowerCase()} in a new tab
              </a>
            </article>
          ))}
        </div>
      </section>

      {evolution !== null && (
        <section className={styles.receipts} aria-labelledby="receipts-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>Append-only authority</p>
              <h2 id="receipts-title">Receipt chain</h2>
            </div>
            <span>
              {evolution.receipts.length} receipts · revision {evolution.revision}
            </span>
          </div>
          <div className={styles.receiptScroller}>
            <table>
              <caption className={styles.srOnly}>
                Validated evolution receipts
              </caption>
              <thead>
                <tr>
                  <th>Seq</th>
                  <th>Recorded</th>
                  <th>Kind</th>
                  <th>Actor</th>
                  <th>Receipt hash</th>
                </tr>
              </thead>
              <tbody>
                {evolution.receipts.map((receipt) => (
                  <tr key={receipt.receiptHash}>
                    <td>{receipt.sequence}</td>
                    <td>
                      <time dateTime={receipt.recordedAt}>
                        {formatTime(receipt.recordedAt)}
                      </time>
                    </td>
                    <td>{humanize(receipt.kind)}</td>
                    <td>
                      {receipt.actor.type}<br />
                      <code>{receiptActorDetail(receipt.actor)}</code>
                    </td>
                    <td><code>{receipt.receiptHash}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.chainHead}>
            Chain head <code>{evolution.receiptChainHead}</code>
          </p>
        </section>
      )}

      <section
        className={styles.eventsSection}
        aria-labelledby="events-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Durable event rail</p>
            <h2 id="events-title">Validated lifecycle timestamps</h2>
          </div>
          <span>{props.events.length} events in this view</span>
        </div>
        <EventRail events={props.events} />
      </section>

      {view.limitations.length > 0 && (
        <aside
          className={styles.limitations}
          aria-labelledby="limitations-title"
        >
          <h2 id="limitations-title">Current limitations</h2>
          <ul>
            {view.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
