import "server-only";

import { watch, type FSWatcher } from "node:fs";
import { lstat } from "node:fs/promises";
import path from "node:path";

import {
  LIVE_COMMAND_RESULT_SCHEMA_VERSION,
  LIVE_STATE_SCHEMA_VERSION,
  LIVE_VIEW_SCHEMA_VERSION,
  parseLiveCommandResult,
  parseLiveState,
  parseLiveView,
  type DetectorProgress,
  type EvolutionReceipt,
  type LiveCommandEnvelope,
  type LiveCommandResult,
  type LiveEvent,
  type LiveView,
  type Sha256,
  type WorkflowEvent,
} from "@living-software/contracts";
import {
  loadAutomaticEvolutionInput,
  loadLiveHostState,
  runTerminalCommand,
  sha256,
  type AutomaticEvolutionInput,
  type LiveHostState,
  type TerminalLifecycleEvent,
} from "@living-software/cli";
import {
  analyzeEvidenceRecords,
  type CollectorDefinition,
  type EvidenceAnalysis,
} from "@living-software/collector";
import {
  evaluateOpportunityDetectors,
  type OpportunityDetectorEvaluation,
} from "@living-software/core";
import {
  applySourceEvolution,
  approveSourceEvolution,
  getEvolutionReceipts,
  getEvolutionStatus,
  listEvolutionStatuses,
  rollbackSourceEvolution,
  SourceEvolutionError,
  type SourceEvolutionProgressEvent,
  type SourceEvolutionState,
} from "@living-software/evolution";

import { ReleaseEvidenceTailer } from "./evidence-tailer";
import { loadLiveStudioConfig, type LiveStudioConfig } from "./live-config";
import {
  DurableLiveEventStore,
  type LiveEventDraft,
  type LiveSubscription,
} from "./live-event-store";
import {
  projectEvolution,
  readCurrentTargetHash,
} from "./live-evolution-projection";

const RECONCILE_DEBOUNCE_MS = 80;
const TECHNICAL_SIGNALS = new Set(["correction", "dead-click", "rage-click"]);

type InstalledHost = Extract<
  LiveHostState["installation"],
  { status: "installed" }
>;

function eventIdentity(prefix: string, value: unknown): string {
  return `live.${prefix}.${sha256(value).slice(7, 31)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown live-monitor failure";
}

function safeErrorCode(code: string, fallback: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u.test(code) ? code : fallback;
}

function originForEvents(events: readonly WorkflowEvent[]): "synthetic" | "observed" | "mixed" {
  const synthetic = events.filter((event) => event.provenance.synthetic).length;
  if (synthetic === 0) return "observed";
  if (synthetic === events.length) return "synthetic";
  return "mixed";
}

function clueForEvent(event: WorkflowEvent) {
  const signal = event.metadata.signal;
  return {
    eventName: event.name,
    eventKind: event.kind,
    productNodeId: event.product?.nodeId ?? event.name,
    ...(typeof signal === "string" && TECHNICAL_SIGNALS.has(signal)
      ? { technicalSignal: signal as "correction" | "dead-click" | "rage-click" }
      : {}),
  };
}

function receiptStage(kind: EvolutionReceipt["kind"]):
  | "preparation"
  | "approval"
  | "application"
  | "rollback" {
  if (kind === "activation.approved" || kind === "contract.confirmed") return "approval";
  if (kind === "installation.activated" || kind === "installation.disabled") return "application";
  if (kind === "installation.rolled-back") return "rollback";
  return "preparation";
}

function liveActor(actor: EvolutionReceipt["actor"]): "model" | "system" | "human" {
  return actor.type;
}

function modelRunAlias(runId: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u.test(runId)
    ? runId
    : eventIdentity("model-run", runId);
}

function terminalModelStage(operation: "interpretation" | "source-patch"):
  | "model-interpretation"
  | "model-patch" {
  return operation === "interpretation" ? "model-interpretation" : "model-patch";
}

export class LiveSession {
  readonly #config: LiveStudioConfig;
  readonly #store: DurableLiveEventStore;
  readonly #watchers = new Map<string, FSWatcher>();
  #started: Promise<void> | undefined;
  #reconcileSerial: Promise<void> = Promise.resolve();
  #progressSerial: Promise<void> = Promise.resolve();
  #debounce: ReturnType<typeof setTimeout> | undefined;
  #host: LiveHostState | undefined;
  #installed: InstalledHost | undefined;
  #tailer: ReleaseEvidenceTailer | undefined;
  #tailerPath: string | undefined;
  #analysis: EvidenceAnalysis | undefined;
  #evaluation: OpportunityDetectorEvaluation;
  #automaticInput: AutomaticEvolutionInput | undefined;
  #evolutionState: SourceEvolutionState | undefined;
  #evolutionView: LiveView["evolution"] = null;
  #integrityError: { code: string; message: string } | undefined;
  #activeStage: LiveEvent["stage"] = "connection";
  #stageState: LiveEvent["state"] = "started";
  #headSequence: number | null = null;
  #headHash: string | null = null;
  #commandInFlight = false;
  #closed = false;

  public constructor(config: LiveStudioConfig) {
    this.#config = config;
    this.#store = new DurableLiveEventStore({
      directory: config.eventDirectory,
      sessionId: config.sessionId,
    });
    this.#evaluation = evaluateOpportunityDetectors({
      events: [],
      manifestHash: config.startupManifestHash as Sha256,
    });
  }

  public start(): Promise<void> {
    if (this.#closed) return Promise.reject(new TypeError("Live session is closed"));
    this.#started ??= this.#initialize();
    return this.#started;
  }

  public close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#debounce !== undefined) {
      clearTimeout(this.#debounce);
      this.#debounce = undefined;
    }
    this.#closeWatchers();
    this.#tailer?.stop();
    this.#tailer = undefined;
    this.#tailerPath = undefined;
  }

  async #initialize(): Promise<void> {
    await this.#store.ready();
    if (this.#closed) return;
    const pages = await this.#store.replay(null);
    if (this.#closed) return;
    const historical = pages.flatMap((page) => page.events);
    const latest = historical.at(-1);
    if (latest !== undefined) {
      this.#activeStage = latest.stage;
      this.#stageState = latest.state;
      this.#headSequence = latest.sequence;
      this.#headHash = latest.eventHash;
    }
    await this.#emitStatus({
      identity: "mapping-started",
      stage: "mapping",
      state: "started",
      summary: "Read-only product mapping started",
      code: "mapping-started",
    });
    await this.#reconcile();
  }

  async #emit(draft: LiveEventDraft): Promise<LiveEvent> {
    const event = await this.#store.append(draft);
    this.#activeStage = event.stage;
    this.#stageState = event.state;
    if (this.#headSequence === null || event.sequence >= this.#headSequence) {
      this.#headSequence = event.sequence;
      this.#headHash = event.eventHash;
    }
    return event;
  }

  async #emitStatus(options: {
    identity: string;
    stage: LiveEvent["stage"];
    state: LiveEvent["state"];
    summary: string;
    code: string;
    actor?: "observer" | "collector" | "detector" | "model" | "system" | "human";
    origin?: "synthetic" | "observed" | "mixed" | "system";
    refs?: LiveEvent["refs"];
    emittedAt?: string;
    errorCode?: string;
  }): Promise<LiveEvent> {
    const application = this.#installed === undefined
      ? this.#host === undefined
        ? {
            appId: this.#config.startupAppId,
            manifestHash: this.#config.startupManifestHash as Sha256,
          }
        : {
            appId: this.#host.application.appId,
            manifestHash: this.#host.application.manifestHash,
          }
      : {
          appId: this.#installed.manifest.appId,
          manifestHash: this.#installed.manifest.contentHash,
        };
    return this.#emit({
      kind: "status",
      eventId: eventIdentity("status", options.identity),
      emittedAt: options.emittedAt ?? new Date().toISOString(),
      ...application,
      origin: options.origin ?? "system",
      stage: options.stage,
      state: options.state,
      actor: options.actor ?? "system",
      summary: options.summary,
      refs: options.refs ?? {},
      facts: {
        code: options.code,
        ...(options.errorCode === undefined ? {} : { errorCode: options.errorCode }),
      },
    } as LiveEventDraft);
  }

  #queueProgress(task: () => Promise<void>): void {
    if (this.#closed) return;
    this.#progressSerial = this.#progressSerial
      .then(async () => {
        if (!this.#closed) await task();
      })
      .catch((error) => {
        this.#integrityError ??= {
          code: "display-event-failed",
          message: `The governed operation continued, but live event persistence failed: ${errorMessage(error)}`,
        };
      });
  }

  #scheduleReconcile(): void {
    if (
      this.#closed ||
      this.#commandInFlight ||
      this.#debounce !== undefined ||
      this.#integrityError !== undefined
    ) return;
    this.#debounce = setTimeout(() => {
      this.#debounce = undefined;
      if (this.#closed || this.#commandInFlight || this.#integrityError !== undefined) return;
      this.#reconcileSerial = this.#reconcileSerial
        .then(() => this.#reconcile())
        .catch((error) => this.#recordIntegrityFailure("reconcile-failed", error));
    }, RECONCILE_DEBOUNCE_MS);
  }

  async #recordIntegrityFailure(code: string, error: unknown): Promise<void> {
    if (this.#closed || this.#integrityError !== undefined) return;
    const boundedCode = safeErrorCode(code, "live-integrity-error");
    this.#integrityError = { code: boundedCode, message: errorMessage(error) };
    try {
      await this.#emitStatus({
        identity: `integrity-${boundedCode}`,
        stage: this.#activeStage,
        state: "failed",
        summary: "Live monitoring stopped on an integrity error",
        code: "integrity-error",
        errorCode: boundedCode,
      });
    } catch {
      // A damaged display log cannot be repaired by granting it more authority.
    }
    this.#closeWatchers();
    this.#tailer?.stop();
  }

  async #reconcile(): Promise<void> {
    if (this.#closed || this.#integrityError !== undefined) return;
    let host: LiveHostState;
    try {
      host = await loadLiveHostState(this.#config.hostRoot);
    } catch (error) {
      await this.#recordIntegrityFailure("host-state-invalid", error);
      return;
    }
    this.#host = host;
    await this.#emitStatus({
      identity: `mapping-completed-${host.application.manifestHash}`,
      stage: "mapping",
      state: "completed",
      summary: `Validated ${host.application.nodes} mapped product nodes and ${host.application.edges} relationships`,
      code: "mapping-completed",
    });

    if (host.installation.status === "invalid") {
      await this.#recordIntegrityFailure(host.installation.reason, new Error(host.installation.message));
      return;
    }
    if (host.installation.status === "not-installed") {
      this.#installed = undefined;
      this.#tailer = undefined;
      this.#tailerPath = undefined;
      this.#analysis = undefined;
      this.#automaticInput = undefined;
      this.#evolutionState = undefined;
      this.#evolutionView = null;
      this.#evaluation = evaluateOpportunityDetectors({
        events: [],
        manifestHash: host.application.manifestHash,
      });
      await this.#emitStatus({
        identity: "living-not-installed",
        stage: "installation",
        state: "waiting",
        summary: "Host found, Living not installed",
        code: "living-not-installed",
      });
      await this.#refreshWatchers();
      return;
    }

    this.#installed = host.installation;
    await this.#emitStatus({
      identity: `installed-${host.installation.record.installId}`,
      stage: "installation",
      state: "completed",
      summary: "Validated install record; observer ready",
      code: "observer-ready",
      refs: { installId: host.installation.record.installId },
    });
    const evidencePath = path.join(
      host.root,
      ...host.installation.evidenceRelativePath.split("/"),
    );
    if (this.#tailer === undefined || this.#tailerPath !== evidencePath) {
      this.#tailer?.stop();
      this.#tailer = new ReleaseEvidenceTailer(
        host.root,
        evidencePath,
        host.installation.collectorDefinition,
      );
      this.#tailerPath = evidencePath;
      this.#analysis = undefined;
      this.#automaticInput = undefined;
      this.#evaluation = evaluateOpportunityDetectors({
        events: [],
        manifestHash: host.installation.manifest.contentHash,
      });
    }
    await this.#reconcileEvidence(host.installation);
    await this.#reconcileEvolution(host.installation);
    await this.#refreshWatchers();
  }

  async #reconcileEvidence(installed: InstalledHost): Promise<void> {
    if (this.#tailer === undefined) return;
    let snapshot;
    try {
      snapshot = await this.#tailer.read();
    } catch (error) {
      await this.#recordIntegrityFailure(
        error instanceof Error && "code" in error ? String(error.code) : "evidence-invalid",
        error,
      );
      return;
    }
    if (snapshot.records.length === 0) {
      await this.#emitStatus({
        identity: snapshot.status === "partial" ? "evidence-partial" : "evidence-waiting",
        stage: "observation",
        state: "waiting",
        summary: snapshot.status === "partial"
          ? "Waiting for the collector to finish the current evidence record"
          : "Observer ready; waiting for validated workflow evidence",
        code: snapshot.status === "partial" ? "evidence-partial" : "evidence-waiting",
      });
      return;
    }
    if (snapshot.newRecords.length > 0) {
      const firstNewIndex = snapshot.records.length - snapshot.newRecords.length;
      for (let index = firstNewIndex; index < snapshot.records.length; index += 1) {
        const records = snapshot.records.slice(0, index + 1);
        const analysis = analyzeEvidenceRecords(records, installed.collectorDefinition);
        await this.#emitEvidenceAnalysis(analysis, snapshot.records[index]!);
        this.#analysis = analysis;
        this.#evaluation = evaluateOpportunityDetectors({
          events: analysis.events,
          manifestHash: installed.manifest.contentHash,
          evidenceUri: `living://evidence/${analysis.chainHead.slice(7)}`,
        });
      }
    } else if (this.#analysis === undefined) {
      this.#analysis = analyzeEvidenceRecords(snapshot.records, installed.collectorDefinition);
      this.#evaluation = evaluateOpportunityDetectors({
        events: this.#analysis.events,
        manifestHash: installed.manifest.contentHash,
        evidenceUri: `living://evidence/${this.#analysis.chainHead.slice(7)}`,
      });
    }
    if (this.#analysis?.opportunity !== null && this.#analysis?.opportunity !== undefined) {
      const automatic = await loadAutomaticEvolutionInput(this.#config.hostRoot);
      if (
        automatic.opportunity.opportunityId !== this.#analysis.opportunity.opportunityId ||
        automatic.opportunity.evidence.eventSetHash !== this.#analysis.opportunity.evidence.eventSetHash
      ) {
        throw new TypeError("Automatic evolution input raced the validated live analysis");
      }
      this.#automaticInput = automatic;
    } else {
      this.#automaticInput = undefined;
    }
  }

  async #emitEvidenceAnalysis(
    analysis: EvidenceAnalysis,
    newestRecord: EvidenceAnalysis["records"][number],
  ): Promise<void> {
    const origin = originForEvents(analysis.events);
    const clues = newestRecord.batch.events.slice(0, 16).map(clueForEvent);
    await this.#emit({
      kind: "evidence",
      eventId: eventIdentity("evidence", newestRecord.recordHash),
      emittedAt: newestRecord.acceptedAt,
      appId: this.#installed!.manifest.appId,
      manifestHash: this.#installed!.manifest.contentHash,
      origin,
      stage: "observation",
      state: "progress",
      actor: "collector",
      summary: `Accepted evidence batch ${analysis.records.length}; ${analysis.events.length} safe events across ${analysis.workflowCases.length} workflow cases`,
      refs: {
        evidenceRecordHash: newestRecord.recordHash,
        evidenceChainHead: analysis.chainHead,
      },
      facts: {
        acceptedBatchCount: analysis.records.length,
        eventCount: analysis.events.length,
        workflowCaseCount: analysis.workflowCases.length,
        sessionCount: new Set(analysis.events.map((event) => event.sessionId)).size,
        clues,
      },
    } as LiveEventDraft);
    for (const family of analysis.detectorEvaluations) {
      const progress = family.progress;
      await this.#emit({
        kind: "detector-progress",
        eventId: eventIdentity("detector", {
          detectorId: progress.detectorId,
          chainHead: analysis.chainHead,
        }),
        emittedAt: newestRecord.acceptedAt,
        appId: this.#installed!.manifest.appId,
        manifestHash: this.#installed!.manifest.contentHash,
        origin,
        stage: "detection",
        state: progress.thresholdMet ? "completed" : "progress",
        actor: "detector",
        summary: `${progress.affectedCases}/${progress.minimumAffectedCases} affected cases satisfy ${progress.detectorId}`,
        refs: family.detection === null
          ? {}
          : {
              opportunityId: family.detection.opportunity.opportunityId,
              eventSetHash: family.detection.opportunity.evidence.eventSetHash,
              evidenceChainHead: analysis.chainHead,
            },
        facts: { progress },
      } as LiveEventDraft);
    }
  }

  async #reconcileEvolution(installed: InstalledHost): Promise<void> {
    const summaries = await listEvolutionStatuses(this.#config.hostRoot);
    const states: SourceEvolutionState[] = [];
    for (const summary of summaries) {
      const state = await getEvolutionStatus(this.#config.hostRoot, summary.evolutionId);
      if (state.app.appId === installed.manifest.appId) states.push(state);
    }
    const exact = this.#automaticInput === undefined
      ? undefined
      : states.find((state) =>
          state.bindings.opportunityId === this.#automaticInput!.opportunity.opportunityId &&
          state.inputs.opportunity.evidence.eventSetHash === this.#automaticInput!.opportunity.evidence.eventSetHash
        );
    const selected = states.find((state) => state.status === "applied") ?? exact;
    if (selected === undefined) {
      this.#evolutionState = undefined;
      this.#evolutionView = null;
      return;
    }
    const receipts = await getEvolutionReceipts(this.#config.hostRoot, selected.evolutionId);
    const currentSourceHash = await readCurrentTargetHash(
      this.#config.hostRoot,
      selected.artifact.target.path,
    );
    this.#evolutionState = selected;
    this.#evolutionView = projectEvolution(selected, receipts, currentSourceHash);
    for (const receipt of receipts) {
      await this.#emit({
        kind: "receipt",
        eventId: eventIdentity("receipt", receipt.receiptHash),
        emittedAt: receipt.recordedAt,
        appId: selected.app.appId,
        manifestHash: selected.app.manifestHash,
        origin: "system",
        stage: receiptStage(receipt.kind),
        state: "completed",
        actor: liveActor(receipt.actor),
        summary: `Validated receipt ${receipt.sequence + 1}: ${receipt.kind}`,
        refs: {
          evolutionId: selected.evolutionId,
          artifactHash: receipt.refs.artifactHash,
          proofHash: receipt.refs.proofHash,
          receiptHash: receipt.receiptHash,
          receiptChainHead: receipt.receiptHash,
          targetPath: selected.artifact.target.path,
          preimageHash: selected.artifact.target.preimageHash,
          postimageHash: selected.artifact.target.postimageHash,
        },
        facts: {
          receiptCount: receipt.sequence + 1,
          receiptKind: receipt.kind,
        },
      } as LiveEventDraft);
    }
    if (selected.status === "applied" && selected.application !== null) {
      await this.#emitSourceTransition(selected, "apply", selected.application.receiptHash, selected.application.appliedAt);
    }
    if (selected.status === "rolled-back" && selected.rollback !== null) {
      await this.#emitSourceTransition(selected, "rollback", selected.rollback.receiptHash, selected.rollback.rolledBackAt);
    }
    await this.#emitStatus({
      identity: `source-verified-${selected.evolutionId}-${currentSourceHash}`,
      stage: "source-verification",
      state: "completed",
      summary: "Current host source matches the authoritative lifecycle hash",
      code: "source-hash-verified",
      refs: {
        evolutionId: selected.evolutionId,
        targetPath: selected.artifact.target.path,
        preimageHash: selected.artifact.target.preimageHash,
        postimageHash: selected.artifact.target.postimageHash,
        currentSourceHash,
      },
    });
  }

  async #emitSourceTransition(
    state: SourceEvolutionState,
    transition: "apply" | "rollback",
    receiptHash: Sha256,
    emittedAt: string,
  ): Promise<void> {
    const fromHash = transition === "apply"
      ? state.artifact.target.preimageHash
      : state.artifact.target.postimageHash;
    const toHash = transition === "apply"
      ? state.artifact.target.postimageHash
      : state.artifact.target.preimageHash;
    await this.#emit({
      kind: "source-transition",
      eventId: eventIdentity("source-transition", { transition, receiptHash }),
      emittedAt,
      appId: state.app.appId,
      manifestHash: state.app.manifestHash,
      origin: "system",
      stage: transition === "apply" ? "application" : "rollback",
      state: "completed",
      actor: "system",
      summary: transition === "apply"
        ? "Sealed postimage written and applied receipt recorded"
        : "Exact preimage restored and rollback receipt recorded",
      refs: {
        evolutionId: state.evolutionId,
        artifactHash: state.artifact.contentHash,
        proofHash: state.proof.proofHash,
        receiptHash,
        targetPath: state.artifact.target.path,
        preimageHash: state.artifact.target.preimageHash,
        postimageHash: state.artifact.target.postimageHash,
        currentSourceHash: toHash,
      },
      facts: {
        transition,
        targetPath: state.artifact.target.path,
        fromHash,
        toHash,
        currentHash: toHash,
      },
    } as LiveEventDraft);
  }

  async #refreshWatchers(): Promise<void> {
    this.#closeWatchers();
    if (this.#closed) return;
    const add = async (
      key: string,
      directory: string,
      acceptedNames: ReadonlySet<string> | null,
    ): Promise<void> => {
      let stat;
      try {
        stat = await lstat(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new TypeError(`Live watch target is unsafe: ${key}`);
      }
      if (this.#closed) return;
      const watcher = watch(directory, { persistent: false }, (_eventType, filename) => {
        if (filename === null) return;
        const normalized = filename.toString().replaceAll("\\", "/");
        if (normalized.includes("/")) return;
        if (acceptedNames === null || acceptedNames.has(normalized)) this.#scheduleReconcile();
      });
      watcher.on("error", (error) => {
        void this.#recordIntegrityFailure("watch-failed", error);
      });
      this.#watchers.set(key, watcher);
    };
    await add("host", this.#config.hostRoot, new Set([".living"]));
    const living = path.join(this.#config.hostRoot, ".living");
    await add("living", living, new Set([
      "install-record.json",
      "config.json",
      "product-manifest.json",
      "observation-runtime.json",
      "metric-catalog.json",
      "data",
    ]));
    const data = path.join(living, "data");
    await add("data", data, new Set(["releases", "evolutions-v2"]));
    if (this.#installed !== undefined) {
      const manifestDirectory = this.#installed.manifest.contentHash.slice(7);
      const releases = path.join(data, "releases");
      await add("releases", releases, new Set([manifestDirectory]));
      await add("evidence", path.join(releases, manifestDirectory), new Set(["events.ndjson"]));
      const evolutions = path.join(data, "evolutions-v2");
      await add("evolutions", evolutions, null);
      if (this.#evolutionState !== undefined) {
        await add(
          `evolution-${this.#evolutionState.evolutionId}`,
          path.join(evolutions, this.#evolutionState.evolutionId),
          new Set(["state.json", "receipts.ndjson", "pending-transaction.json"]),
        );
        const targetParent = path.join(
          this.#config.hostRoot,
          ...this.#evolutionState.artifact.target.path.split("/").slice(0, -1),
        );
        await add(
          "source-target",
          targetParent,
          new Set([path.posix.basename(this.#evolutionState.artifact.target.path)]),
        );
      }
    }
  }

  #closeWatchers(): void {
    for (const watcher of this.#watchers.values()) {
      try {
        watcher.close();
      } catch {
        // Closing is best effort; shutdown must not grant watchers authority.
      }
    }
    this.#watchers.clear();
  }

  public async subscribe(
    afterSequence: number | null,
    listener: (event: LiveEvent) => void,
  ): Promise<LiveSubscription> {
    await this.start();
    return this.#store.subscribe(afterSequence, listener);
  }

  public async view(): Promise<LiveView> {
    await this.start();
    if (this.#host === undefined) throw new TypeError("Live host mapping is unavailable");
    const installed = this.#installed;
    const analysis = this.#analysis;
    const opportunity = analysis?.opportunity ?? null;
    const application = installed === undefined
      ? undefined
      : {
          appId: installed.manifest.appId,
          displayName: installed.config.application.displayName,
          environment: installed.runtimeMap.application.environment,
          releaseRevision: installed.manifest.release.revision,
          manifestHash: installed.manifest.contentHash,
          dataOrigin: analysis?.metricReport.dataOrigin ??
            (installed.runtimeMap.application.synthetic ? "synthetic" : "observed"),
        };
    const state = parseLiveState({
      schemaVersion: LIVE_STATE_SCHEMA_VERSION,
      sessionId: this.#config.sessionId,
      generatedAt: new Date().toISOString(),
      connection: "connected",
      headSequence: this.#headSequence,
      headHash: this.#headHash,
      ...(application === undefined ? {} : { application }),
      installation: this.#host.installation.status === "not-installed"
        ? "not-installed"
        : this.#host.installation.status === "invalid"
          ? "invalid"
          : "installed",
      activeStage: this.#activeStage,
      stageState: this.#stageState,
      evidence: {
        acceptedBatchCount: analysis?.records.length ?? 0,
        eventCount: analysis?.events.length ?? 0,
        workflowCaseCount: analysis?.workflowCases.length ?? 0,
        sessionCount: analysis === undefined
          ? 0
          : new Set(analysis.events.map((event) => event.sessionId)).size,
        chainHead: analysis?.chainHead ?? null,
      },
      detectorProgress: this.#evaluation.progress,
      ...(this.#evolutionView === null
        ? {}
        : {
            source: {
              evolutionId: this.#evolutionView.evolutionId,
              status: this.#evolutionView.status === "rolled-back"
                ? "rolled-back"
                : this.#evolutionView.status,
              targetPath: this.#evolutionView.targetPath,
              preimageHash: this.#evolutionView.preimageHash,
              postimageHash: this.#evolutionView.postimageHash,
              currentHash: this.#evolutionView.currentSourceHash,
            },
          }),
      runtime: { status: "not-available" },
      integrity: this.#integrityError === undefined
        ? { status: "valid" }
        : { status: "error", errorCode: this.#integrityError.code },
    });
    const nextAction = this.#nextAction();
    const view = {
      schemaVersion: LIVE_VIEW_SCHEMA_VERSION,
      state,
      mappedHost: {
        appId: this.#host.application.appId,
        displayName: this.#host.application.displayName,
        releaseRevision: this.#host.application.releaseRevision,
        framework: this.#host.application.framework,
        detectedVersion: this.#host.application.detectedVersion,
      },
      hostUrl: this.#config.hostUrl,
      previewUrl: this.#config.previewUrl,
      beforeUrl: this.#config.beforeUrl,
      snapshotHash: this.#automaticInput?.snapshotHash ?? null,
      opportunity: opportunity === null
        ? null
        : {
            opportunityId: opportunity.opportunityId,
            eventSetHash: opportunity.evidence.eventSetHash,
            detectorId: opportunity.detector.id,
            signalKind: opportunity.signal.kind,
            affectedCases: opportunity.evidence.subjectCount,
            occurrenceCount: opportunity.evidence.occurrenceCount,
            dataOrigin: opportunity.evidence.dataOrigin,
            confidence: opportunity.confidence.score,
            metrics: opportunity.signal.metrics,
          },
      evolution: this.#evolutionView,
      nextAction,
      limitations: [
        "Source-hash verification is separate from runtime or browser verification.",
        "A host-frame response means the host responded; visual inspection remains manual.",
        "No post-change improvement is claimed without a fresh measured cohort.",
      ],
    };
    return parseLiveView(view);
  }

  #nextAction(): LiveView["nextAction"] {
    if (this.#integrityError !== undefined) {
      return {
        type: "resolve-integrity",
        label: "Resolve the integrity error before continuing",
        commandEnabled: false,
        reason: `Live integrity verification failed (${this.#integrityError.code}). Inspect server logs and repair the host state before retrying.`,
      };
    }
    if (this.#installed === undefined) {
      return {
        type: "install",
        label: "Install Living in this mapped host",
        commandEnabled: false,
        reason: "Run the real living install --synthetic command in a terminal.",
      };
    }
    if (this.#automaticInput === undefined) {
      return {
        type: "capture-evidence",
        label: "Complete another independent workflow case",
        commandEnabled: false,
        reason: "Waiting for a real detector threshold; no opportunity is inferred from time.",
      };
    }
    if (this.#evolutionState === undefined) {
      return { type: "prepare", label: "Ask GPT to prepare a governed proposal", commandEnabled: true };
    }
    switch (this.#evolutionState.status) {
      case "prepared":
        return { type: "approve", label: "Review and approve the exact artifact + proof hashes", commandEnabled: true };
      case "approved":
        return { type: "apply", label: "Apply the approved sealed postimage", commandEnabled: true };
      case "applied":
        return { type: "rollback", label: "Roll back the exact sealed postimage", commandEnabled: true };
      case "rolled-back":
        return {
          type: "capture-evidence",
          label: "Capture fresh evidence before preparing another change",
          commandEnabled: false,
        };
    }
  }

  public async command(envelope: LiveCommandEnvelope): Promise<LiveCommandResult> {
    await this.start();
    if (this.#commandInFlight) {
      return this.#rejected(envelope.commandId, "command-in-flight", "Another governed command is still running");
    }
    this.#commandInFlight = true;
    try {
      await this.#reconcileSerial;
      if (this.#closed) throw new TypeError("Live session is closed");
      this.#assertCommandBinding(envelope);
      if (envelope.command.type === "evolution.prepare") {
        this.#queueTerminalImprove(envelope.command.provider);
        await runTerminalCommand(
          {
            mode: "terminal",
            command: "improve",
            rootPath: this.#config.hostRoot,
            provider: envelope.command.provider,
            json: true,
          },
          {},
          {
            lifecycleReporter: (event) => this.#queueTerminalEvent(event),
            evolutionProgressObserver: (event) => this.#queueEvolutionEvent(event),
          },
        );
      } else {
        const state = this.#requireEvolution(envelope);
        if (envelope.command.type === "evolution.approve") {
          await approveSourceEvolution({
            root: this.#config.hostRoot,
            evolutionId: state.evolutionId,
            humanId: envelope.command.humanId,
            expectedArtifactHash: envelope.command.artifactHash,
            expectedProofHash: envelope.command.proofHash,
            expectedRevision: envelope.expectedRevision,
            progress: (event) => this.#queueEvolutionEvent(event),
          });
        } else if (envelope.command.type === "evolution.apply") {
          await applySourceEvolution({
            root: this.#config.hostRoot,
            evolutionId: state.evolutionId,
            expectedRevision: envelope.expectedRevision,
            progress: (event) => this.#queueEvolutionEvent(event),
          });
        } else {
          await rollbackSourceEvolution({
            root: this.#config.hostRoot,
            evolutionId: state.evolutionId,
            humanId: envelope.command.humanId,
            expectedRevision: envelope.expectedRevision,
            progress: (event) => this.#queueEvolutionEvent(event),
          });
        }
      }
      await this.#progressSerial;
      await this.#reconcile();
      const revision = this.#evolutionState?.receiptCount ?? 0;
      return parseLiveCommandResult({
        schemaVersion: LIVE_COMMAND_RESULT_SCHEMA_VERSION,
        commandId: envelope.commandId,
        accepted: true,
        revision,
        ...(this.#headSequence === null ? {} : { eventSequence: this.#headSequence }),
      });
    } catch (error) {
      const code = safeErrorCode(
        error instanceof SourceEvolutionError ? error.code : "command-rejected",
        "command-rejected",
      );
      try {
        await this.#progressSerial;
        if (!this.#closed) {
          await this.#emitStatus({
            identity: `command-failed-${envelope.commandId}-${code}`,
            stage: this.#activeStage,
            state: "failed",
            summary: "The governed command failed before lifecycle completion",
            code: "command-failed",
            errorCode: code,
          });
        }
      } catch {
        // Display persistence is never allowed to change command authority.
      }
      return this.#rejected(
        envelope.commandId,
        code,
        error instanceof SourceEvolutionError
          ? "The evolution engine rejected this command because an exact lifecycle or hash precondition was not satisfied"
          : "The governed backend rejected this command",
      );
    } finally {
      this.#commandInFlight = false;
      this.#scheduleReconcile();
    }
  }

  #queueTerminalImprove(_provider: "codex" | "api"): void {
    // The first real lifecycle event is emitted by runTerminalCommand only
    // after it has validated the evidence package. No optimistic event here.
  }

  #assertCommandBinding(envelope: LiveCommandEnvelope): void {
    if (this.#integrityError !== undefined || this.#installed === undefined || this.#automaticInput === undefined) {
      throw new TypeError("Live command prerequisites are not valid");
    }
    const expectedRevision = this.#evolutionState?.receiptCount ?? 0;
    if (
      envelope.sessionId !== this.#config.sessionId ||
      envelope.appId !== this.#installed.manifest.appId ||
      envelope.manifestHash !== this.#installed.manifest.contentHash ||
      envelope.snapshotHash !== this.#automaticInput.snapshotHash ||
      envelope.expectedRevision !== expectedRevision
    ) {
      throw new TypeError("Live command identity or expected revision is stale");
    }
    if (
      envelope.command.type === "evolution.prepare" &&
      (envelope.command.opportunityId !== this.#automaticInput.opportunity.opportunityId ||
        envelope.command.eventSetHash !== this.#automaticInput.opportunity.evidence.eventSetHash)
    ) {
      throw new TypeError("Prepare command is not bound to the current deterministic opportunity");
    }
  }

  #requireEvolution(envelope: LiveCommandEnvelope): SourceEvolutionState {
    const state = this.#evolutionState;
    if (state === undefined || envelope.command.type === "evolution.prepare") {
      throw new TypeError("No exact evolution is available for this command");
    }
    if (
      envelope.command.evolutionId !== state.evolutionId ||
      envelope.command.artifactHash !== state.artifact.contentHash ||
      envelope.command.proofHash !== state.proof.proofHash
    ) {
      throw new TypeError("Command evolution, artifact, or proof identity is stale");
    }
    return state;
  }

  #rejected(commandId: string, code: string, message: string): LiveCommandResult {
    return parseLiveCommandResult({
      schemaVersion: LIVE_COMMAND_RESULT_SCHEMA_VERSION,
      commandId,
      accepted: false,
      revision: this.#evolutionState?.receiptCount ?? 0,
      error: { code: safeErrorCode(code, "command-rejected"), message },
    });
  }

  #queueTerminalEvent(event: TerminalLifecycleEvent): void {
    this.#queueProgress(async () => this.#reportTerminalEvent(event));
  }

  async #reportTerminalEvent(event: TerminalLifecycleEvent): Promise<void> {
    switch (event.type) {
      case "evidence.package.validated":
        await this.#emitStatus({
          identity: `${event.type}-${event.eventSetHash}`,
          stage: "analysis",
          state: "completed",
          summary: "Exact evidence package validated for model interpretation",
          code: "evidence-package-validated",
          origin: event.dataOrigin,
          refs: { opportunityId: event.opportunityId, eventSetHash: event.eventSetHash },
        });
        return;
      case "proposal.reused":
        await this.#emitStatus({
          identity: `${event.type}-${event.evolutionId}-${event.receiptCount}`,
          stage: "preparation",
          state: "completed",
          summary: event.summary,
          code: "proposal-reused",
          refs: {
            evolutionId: event.evolutionId,
            artifactHash: event.artifactHash as Sha256,
            proofHash: event.proofHash as Sha256,
          },
        });
        return;
      case "model.request.dispatched":
        await this.#emit({
          kind: "model",
          eventId: eventIdentity("model-request", event),
          emittedAt: new Date().toISOString(),
          appId: this.#installed!.manifest.appId,
          manifestHash: this.#installed!.manifest.contentHash,
          origin: "system",
          stage: terminalModelStage(event.operation),
          state: "started",
          actor: "model",
          summary: `${event.operation === "interpretation" ? "GPT interpretation" : "GPT source patch"} requested through ${event.transport}`,
          refs: {},
          facts: {
            phase: "requested",
            provider: "openai",
            model: event.transport === "codex-cli" ? "gpt-5.6-terra" : "gpt-5.6",
          },
        } as LiveEventDraft);
        return;
      case "model.thread.started":
      case "model.turn.started":
      case "model.turn.completed":
        await this.#emitStatus({
          identity: `${event.type}-${event.operation}-${event.threadId}`,
          stage: terminalModelStage(event.operation),
          state: "progress",
          actor: "model",
          summary: event.type === "model.thread.started"
            ? "Verified Codex thread started"
            : event.type === "model.turn.started"
              ? "Verified Codex turn started"
              : "Verified Codex turn completed",
          code: event.type.replaceAll(".", "-"),
          refs: { modelRunId: modelRunAlias(event.threadId) },
        });
        return;
      case "model.result.validated": {
        if (event.runId === null) throw new TypeError("Validated model result lacks its run identity");
        const usage = event.tokenUsage;
        await this.#emit({
          kind: "model",
          eventId: eventIdentity("model-result", { operation: event.operation, runId: event.runId }),
          emittedAt: new Date().toISOString(),
          appId: this.#installed!.manifest.appId,
          manifestHash: this.#installed!.manifest.contentHash,
          origin: "system",
          stage: terminalModelStage(event.operation),
          state: "completed",
          actor: "model",
          summary: `${event.operation === "interpretation" ? "GPT interpretation" : "GPT source patch"} completed and passed its structured schema`,
          refs: { modelRunId: modelRunAlias(event.runId) },
          facts: {
            phase: "completed",
            provider: "openai",
            model: event.transport === "codex-cli" ? "gpt-5.6-terra" : "gpt-5.6",
            runId: modelRunAlias(event.runId),
            ...(usage === null
              ? {}
              : {
                  tokenUsage: {
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    totalTokens: usage.inputTokens + usage.outputTokens,
                  },
                }),
          },
        } as LiveEventDraft);
        return;
      }
      case "source-candidates.selected":
        await this.#emitStatus({
          identity: `${event.type}-${sha256(event.candidates)}`,
          stage: "source-selection",
          state: "completed",
          summary: `${event.count} bounded manifest-linked source candidate${event.count === 1 ? "" : "s"} selected`,
          code: "source-candidates-selected",
        });
        return;
      case "evolution.preparation.started":
        await this.#emitStatus({
          identity: `${event.type}-${event.proposalId}`,
          stage: "preparation",
          state: "started",
          summary: "Deterministic evolution preparation started",
          code: "evolution-preparation-started",
          refs: { targetPath: event.targetPath, preimageHash: event.preimageHash as Sha256 },
        });
        return;
      case "evolution.prepared":
        await this.#emitStatus({
          identity: `${event.type}-${event.evolutionId}`,
          stage: "preparation",
          state: "completed",
          summary: "Prepared evolution and proof persisted",
          code: "evolution-prepared",
          refs: {
            evolutionId: event.evolutionId,
            targetPath: event.targetPath,
            artifactHash: event.artifactHash as Sha256,
            proofHash: event.proofHash as Sha256,
            preimageHash: event.preimageHash as Sha256,
            postimageHash: event.postimageHash as Sha256,
            receiptChainHead: event.chainHead as Sha256,
          },
        });
    }
  }

  #queueEvolutionEvent(event: SourceEvolutionProgressEvent): void {
    this.#queueProgress(async () => this.#reportEvolutionEvent(event));
  }

  async #reportEvolutionEvent(event: SourceEvolutionProgressEvent): Promise<void> {
    const refs = { evolutionId: event.evolutionId } as LiveEvent["refs"];
    if ("targetPath" in event) refs.targetPath = event.targetPath;
    if ("artifactHash" in event) refs.artifactHash = event.artifactHash;
    if ("proofHash" in event) refs.proofHash = event.proofHash;
    if ("preimageHash" in event) refs.preimageHash = event.preimageHash;
    if ("postimageHash" in event) refs.postimageHash = event.postimageHash;
    if ("chainHead" in event) refs.receiptChainHead = event.chainHead;
    if (event.stage === "prepare.proof-check-completed") {
      await this.#emit({
        kind: "proof-check",
        eventId: eventIdentity("proof-check", {
          evolutionId: event.evolutionId,
          checkId: event.checkId,
          proofHash: event.proofHash,
        }),
        emittedAt: new Date().toISOString(),
        appId: this.#installed!.manifest.appId,
        manifestHash: this.#installed!.manifest.contentHash,
        origin: "system",
        stage: "proof",
        state: "completed",
        actor: "system",
        summary: `Deterministic proof check passed: ${event.checkId}`,
        refs,
        facts: { checkId: event.checkId, status: "passed" },
      } as LiveEventDraft);
      return;
    }
    const map: Record<SourceEvolutionProgressEvent["stage"], {
      stage: LiveEvent["stage"];
      state: LiveEvent["state"];
      code: string;
      summary: string;
      actor?: "human" | "system";
    } | null> = {
      "prepare.compilation-started": { stage: "preparation", state: "started", code: "compilation-started", summary: "Deterministic patch compilation started" },
      "prepare.proof-started": { stage: "proof", state: "started", code: "proof-started", summary: "Deterministic proof started" },
      "prepare.proof-check-completed": null,
      "prepare.persisted": { stage: "preparation", state: "completed", code: "prepared-persisted", summary: "Prepared evolution persisted" },
      "approve.hashes-selected": { stage: "approval", state: "started", code: "approval-hashes-selected", summary: "Human selected the exact artifact and proof hashes", actor: "human" },
      "approve.receipts-persisted": { stage: "approval", state: "completed", code: "approval-receipts-persisted", summary: "Human approval receipts persisted", actor: "human" },
      "apply.artifact-selected": { stage: "application", state: "started", code: "approved-artifact-selected", summary: "Approved sealed artifact selected" },
      "apply.preimage-verified": { stage: "application", state: "progress", code: "preimage-verified", summary: "Current target preimage verified" },
      "apply.postimage-written": { stage: "application", state: "progress", code: "postimage-written", summary: "Sealed postimage written by the evolution engine" },
      "apply.receipt-state-persisted": { stage: "application", state: "progress", code: "apply-receipt-persisted", summary: "Applied receipt and lifecycle state persisted" },
      "apply.hash-transition-completed": { stage: "source-verification", state: "completed", code: "apply-hash-transition-completed", summary: "Source hash changed from exact preimage to exact postimage" },
      "rollback.artifact-selected": { stage: "rollback", state: "started", code: "rollback-artifact-selected", summary: "Applied sealed artifact selected for rollback" },
      "rollback.postimage-verified": { stage: "rollback", state: "progress", code: "postimage-verified", summary: "Current target postimage verified" },
      "rollback.preimage-written": { stage: "rollback", state: "progress", code: "preimage-written", summary: "Exact sealed preimage restored by the evolution engine" },
      "rollback.receipt-state-persisted": { stage: "rollback", state: "progress", code: "rollback-receipt-persisted", summary: "Rollback receipt and lifecycle state persisted" },
      "rollback.hash-transition-completed": { stage: "source-verification", state: "completed", code: "rollback-hash-transition-completed", summary: "Source hash changed from exact postimage to exact preimage" },
    };
    const projection = map[event.stage];
    if (projection === null) return;
    await this.#emitStatus({
      identity: `${event.stage}-${sha256(event)}`,
      stage: projection.stage,
      state: projection.state,
      summary: projection.summary,
      code: projection.code,
      actor: projection.actor,
      refs,
    });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __livingLiveSession: Promise<LiveSession> | undefined;
}

export function getLiveSession(): Promise<LiveSession> {
  globalThis.__livingLiveSession ??= (async () => {
    const session = new LiveSession(await loadLiveStudioConfig());
    await session.start();
    return session;
  })();
  return globalThis.__livingLiveSession;
}
