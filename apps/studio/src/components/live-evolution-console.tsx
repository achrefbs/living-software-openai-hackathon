"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudioEvidenceIdentity } from "@/lib/studio-types";

type EvolutionPhase =
  | "ready"
  | "draft_ready"
  | "approved"
  | "active"
  | "rolled_back";

type EvolutionStatus = Readonly<{
  connected: boolean;
  phase: EvolutionPhase;
  evolutionId: string | null;
  revision: number;
  title: string | null;
  interpretation: string | null;
  proposalSummary: string | null;
  modelChangeSummary: string | null;
  modelAffectedNodeIds: readonly string[];
  targetPath: string | null;
  preHash: string | null;
  postHash: string | null;
  artifactHash: string | null;
  proofHash: string | null;
  patchPreview: string | null;
  proofPassed: boolean;
  approvalActor: string | null;
  receiptCount: number;
  provider: "codex" | "api" | null;
  evidenceRelation: "exact" | "stale" | null;
  error?: string;
}>;

const PHASES: ReadonlyArray<Readonly<{
  id: EvolutionPhase;
  label: string;
  detail: string;
}>> = [
  {
    id: "ready",
    label: "Evidence",
    detail: "Exact CRM manifest, opportunity, and event set",
  },
  {
    id: "draft_ready",
    label: "Proposal + proof",
    detail: "GPT interpretation and deterministic static patch proof",
  },
  {
    id: "approved",
    label: "Human approval",
    detail: "Exact pre/post hashes approved by a person",
  },
  {
    id: "active",
    label: "Source applied",
    detail: "Exact host bytes replaced; runtime verification remains separate",
  },
  {
    id: "rolled_back",
    label: "Rolled back",
    detail: "Exact preimage restored; receipts preserved",
  },
];

const PHASE_INDEX = new Map(PHASES.map((phase, index) => [phase.id, index]));

function shortHash(value: string | null): string {
  return value === null ? "—" : value.replace(/^sha256:/u, "").slice(0, 12);
}

export function LiveEvolutionConsole({
  appId,
  snapshotIdentity,
  crmUrl,
}: {
  appId: string;
  snapshotIdentity: StudioEvidenceIdentity;
  crmUrl?: string;
}) {
  const [status, setStatus] = useState<EvolutionStatus | null>(null);
  const [provider, setProvider] = useState<"codex" | "api">("codex");
  const [approver, setApprover] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const requestSequence = useRef(0);
  const acceptedSequence = useRef(0);
  const refreshController = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    const sequence = ++requestSequence.current;
    try {
      const response = await fetch("/api/evolution", {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json() as EvolutionStatus;
      if (!response.ok) {
        if (sequence >= acceptedSequence.current && body.error) {
          setError(body.error);
        }
        return;
      }
      if (sequence >= acceptedSequence.current) {
        acceptedSequence.current = sequence;
        setStatus(body);
        setError(null);
      }
    } catch (cause) {
      if (
        !(cause instanceof DOMException && cause.name === "AbortError") &&
        sequence >= acceptedSequence.current
      ) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not reach the evolution broker",
        );
      }
    } finally {
      if (refreshController.current === controller) {
        refreshController.current = null;
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 2_000);
    return () => {
      window.clearInterval(timer);
      refreshController.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    // A confirmation is valid only for the artifact currently on screen.
    setConfirmed(false);
  }, [status?.artifactHash, status?.evolutionId]);

  const run = useCallback(async (
    action: "prepare" | "approve" | "activate" | "rollback",
  ) => {
    busyRef.current = true;
    refreshController.current?.abort();
    const sequence = ++requestSequence.current;
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/evolution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          appId,
          snapshotHash: snapshotIdentity.snapshotHash,
          opportunityId: snapshotIdentity.opportunityId,
          eventSetHash: snapshotIdentity.eventSetHash,
          ...(action === "prepare"
            ? {}
            : {
                evolutionId: status?.evolutionId,
                expectedRevision: status?.revision,
              }),
          ...(action === "prepare" ? { provider } : {}),
          ...(action === "approve"
            ? {
                approver,
                confirmed,
                expectedArtifactHash: status?.artifactHash,
                expectedProofHash: status?.proofHash,
              }
            : {}),
          ...(action === "rollback" ? { approver } : {}),
        }),
      });
      const body = await response.json() as EvolutionStatus;
      if (!response.ok) throw new Error(body.error ?? "Evolution command was rejected");
      if (sequence >= acceptedSequence.current) {
        acceptedSequence.current = sequence;
        setStatus(body);
        setError(null);
      }
      if (action === "approve") setConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evolution command failed");
    } finally {
      busyRef.current = false;
      setBusy(null);
      void refresh();
    }
  }, [
    appId,
    approver,
    confirmed,
    provider,
    refresh,
    snapshotIdentity.eventSetHash,
    snapshotIdentity.opportunityId,
    snapshotIdentity.snapshotHash,
    status?.artifactHash,
    status?.evolutionId,
    status?.proofHash,
    status?.revision,
  ]);

  const currentIndex = status === null ? -1 : (PHASE_INDEX.get(status.phase) ?? -1);
  const hasDetectedEvidence =
    snapshotIdentity.snapshotHash !== null &&
    snapshotIdentity.opportunityId !== null &&
    snapshotIdentity.eventSetHash !== null;
  const canPrepare = status?.connected === true &&
    status.phase === "ready" &&
    hasDetectedEvidence;
  const canApprove = status?.phase === "draft_ready" &&
    confirmed &&
    status.artifactHash !== null &&
    status.patchPreview !== null &&
    status.proofHash !== null &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u.test(approver);
  const canActivate = status?.phase === "approved";
  const canRollback = status?.phase === "active";
  const activeProvider = useMemo(
    () => status?.provider ?? provider,
    [provider, status?.provider],
  );

  return (
    <section aria-labelledby="live-evolution-title" className="panel live-evolution">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Connected evolution broker</p>
          <h2 id="live-evolution-title">CRM change, end to end</h2>
          <p className="panel-subtitle">
            Evidence informs GPT-5.6. A deterministic adapter owns the code
            patch, tests, activation, and exact rollback.
          </p>
        </div>
        <span className={"badge " + (status?.connected ? "badge-positive" : "badge-locked")}>
          {status?.connected ? "Host connected" : "Not connected"}
        </span>
      </div>

      <ol className="evolution-run-steps">
        {PHASES.map((phase, index) => {
          const state =
            index < currentIndex ? "complete" : index === currentIndex ? "current" : "locked";
          return (
            <li className={"evolution-run-step evolution-run-" + state} key={phase.id}>
              <span className="evolution-run-marker" aria-hidden="true">
                {index < currentIndex ? "✓" : index + 1}
              </span>
              <div>
                <strong>{phase.label}</strong>
                <small>
                  {phase.id === "ready" && !hasDetectedEvidence
                    ? "Latest capture has no qualifying opportunity"
                    : phase.detail}
                </small>
              </div>
            </li>
          );
        })}
      </ol>

      {status?.title && (
        <div className="evolution-proposal">
          <div>
            <span className="eyebrow">GPT-5.6 evidence interpretation</span>
            <h3>{status.title}</h3>
            {status.interpretation && <p>{status.interpretation}</p>}
            {status.modelChangeSummary && (
              <p className="evolution-model-change">
                <strong>Model-suggested direction:</strong>{" "}
                {status.modelChangeSummary}
              </p>
            )}
          </div>
          <div className="evolution-proposal-change">
            <span>Independent deterministic candidate</span>
            <strong>{status.proposalSummary}</strong>
            <code>{status.targetPath}</code>
          </div>
        </div>
      )}

      {status?.patchPreview && (
        <details className="evolution-diff">
          <summary>Review the normalized source diff</summary>
          <pre>{status.patchPreview}</pre>
        </details>
      )}
      {status?.title && (
        <p className="evolution-boundary-note">
          GPT-5.6 did not choose or generate this source patch. The engine
          independently selected its only eligible backtracking adapter; human
          review decides whether the interpretation and candidate align.
        </p>
      )}
      {status?.phase === "draft_ready" && status.patchPreview === null && (
        <p className="evolution-error" role="alert">
          This prepared patch cannot be rendered within Studio&apos;s bounded
          diff limits. Approval is disabled; inspect or recover it through the
          local CLI before continuing.
        </p>
      )}

      <dl className="evolution-integrity">
        <div><dt>Provider</dt><dd>{activeProvider === "codex" ? "Codex CLI" : "Responses API"}</dd></div>
        <div><dt>Preimage</dt><dd><code>{shortHash(status?.preHash ?? null)}</code></dd></div>
        <div><dt>Postimage</dt><dd><code>{shortHash(status?.postHash ?? null)}</code></dd></div>
        <div><dt>Static proof</dt><dd>{status?.proofPassed ? shortHash(status.proofHash) : "Not run"}</dd></div>
        <div><dt>Receipts</dt><dd>{status?.receiptCount ?? 0}</dd></div>
      </dl>
      {status?.artifactHash && status.proofHash && (
        <details className="evolution-hashes">
          <summary>Exact approval bindings</summary>
          <dl>
            <div><dt>Artifact</dt><dd><code>{status.artifactHash}</code></dd></div>
            <div><dt>Proof</dt><dd><code>{status.proofHash}</code></dd></div>
            <div><dt>Preimage</dt><dd><code>{status.preHash}</code></dd></div>
            <div><dt>Postimage</dt><dd><code>{status.postHash}</code></dd></div>
          </dl>
        </details>
      )}

      {error && <p className="evolution-error" role="alert">{error}</p>}

      <div className="evolution-actions">
        <div className="provider-toggle" aria-label="GPT provider">
          <button
            aria-pressed={provider === "codex"}
            className={provider === "codex" ? "selected" : ""}
            disabled={!canPrepare || busy !== null}
            onClick={() => setProvider("codex")}
            type="button"
          >
            Codex CLI
          </button>
          <button
            aria-pressed={provider === "api"}
            className={provider === "api" ? "selected" : ""}
            disabled={!canPrepare || busy !== null}
            onClick={() => setProvider("api")}
            type="button"
          >
            API key
          </button>
        </div>
        <button
          className="button button-primary"
          disabled={!canPrepare || busy !== null}
          onClick={() => void run("prepare")}
          type="button"
        >
          {busy === "prepare" ? "Drafting with GPT-5.6…" : "1. Generate proposal"}
        </button>
        <label className="approval-check">
          <input
            checked={confirmed}
            disabled={status?.phase !== "draft_ready" || busy !== null}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />
          I reviewed model/candidate alignment, the diff, and byte-hash rollback
        </label>
        <input
          aria-label="Operator label for the human approval receipt"
          className="evolution-approver"
          disabled={status?.phase !== "draft_ready" || busy !== null}
          maxLength={160}
          onChange={(event) => setApprover(event.target.value)}
          placeholder="Operator label, e.g. achref-demo"
          value={approver}
        />
        <button
          className="button button-secondary"
          disabled={!canApprove || busy !== null}
          onClick={() => void run("approve")}
          type="button"
        >
          {busy === "approve" ? "Recording approval…" : "2. Approve exact patch"}
        </button>
        <button
          className="button button-primary"
          disabled={!canActivate || busy !== null}
          onClick={() => void run("activate")}
          type="button"
        >
          {busy === "activate" ? "Applying…" : "3. Apply to CRM source"}
        </button>
        <button
          className="button button-secondary"
          disabled={!canRollback || busy !== null}
          onClick={() => void run("rollback")}
          type="button"
        >
          {busy === "rollback" ? "Rolling back…" : "Roll back"}
        </button>
        {crmUrl && (
          <a className="button button-secondary" href={crmUrl} rel="noreferrer" target="_blank">
            Open configured host
          </a>
        )}
      </div>

      {status?.phase === "active" && (
        <p className="evolution-live-note">
          The exact source patch is applied. If the configured Next.js dev host
          is running, Turbopack should reload it; runtime and DOM verification
          are reported separately from this static proof.
        </p>
      )}
      {status?.evidenceRelation === "stale" && (
        <p className="evolution-stale-note">
          Newer evidence is synced than this installed change. Activation is
          locked, but exact-hash rollback remains available.
        </p>
      )}
      {status?.phase === "rolled_back" && (
        <p className="evolution-stale-note">
          This evidence cycle is closed. Capture and sync new evidence before
          preparing another proposal; the rollback receipts remain immutable.
        </p>
      )}
      {status?.approvalActor && (
        <p className="evolution-approval-note">
          Operator label <code>{status.approvalActor}</code> recorded on the
          human approval receipt. This label is not authenticated identity;
          the model has no activation authority.
        </p>
      )}
    </section>
  );
}
