"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui";
import {
  describeComparison,
  parsePreviewIdentity,
  previewIdentityMatches,
  type ComparisonPhase,
  type ComparisonStatus,
  type PreviewIdentity,
} from "@/lib/evolution-comparison";

const phaseLabels: Record<ComparisonPhase, string> = {
  ready: "Evidence ready",
  draft_ready: "Prepared draft",
  approved: "Human approved",
  active: "Applied to source",
  rolled_back: "Rolled back",
};

function shortHash(value: string | null): string {
  return value === null ? "Not created" : value.replace(/^sha256:/u, "").slice(0, 12);
}

function readPreviewIdentity(value: unknown): PreviewIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Preview verification returned an invalid response");
  }
  const { connected, error: _error, ...identity } = value as Record<string, unknown>;
  if (connected !== true) {
    throw new TypeError("Preview identity is unavailable");
  }
  return parsePreviewIdentity(identity);
}

export function EvolutionComparisonStatus({
  hostUrl,
  previewUrl,
}: {
  hostUrl: string;
  previewUrl: string;
}) {
  const [status, setStatus] = useState<ComparisonStatus | null>(null);
  const [identity, setIdentity] = useState<PreviewIdentity | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;

    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const [statusResponse, previewResponse] = await Promise.all([
          fetch("/api/evolution", {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch("/api/preview-identity", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        const statusBody = await statusResponse.json() as ComparisonStatus;
        const previewBody = await previewResponse.json() as unknown;
        if (!statusResponse.ok) {
          throw new Error(statusBody.error ?? "Evolution status is unavailable");
        }
        let nextIdentity: PreviewIdentity | null = null;
        let nextPreviewError: string | null = null;
        try {
          if (!previewResponse.ok) {
            const body = previewBody as { error?: unknown };
            throw new Error(
              typeof body.error === "string"
                ? body.error
                : "Preview identity is unavailable",
            );
          }
          nextIdentity = readPreviewIdentity(previewBody);
        } catch (cause) {
          nextPreviewError =
            cause instanceof Error ? cause.message : "Preview identity is unavailable";
        }
        if (!disposed) {
          setStatus(statusBody);
          setIdentity(nextIdentity);
          setStatusError(null);
          setPreviewError(nextPreviewError);
        }
      } catch (cause) {
        if (
          !disposed &&
          !(cause instanceof DOMException && cause.name === "AbortError")
        ) {
          setStatus(null);
          setIdentity(null);
          setPreviewError(null);
          setStatusError(
            cause instanceof Error ? cause.message : "Evolution status is unavailable",
          );
        }
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  const presentation = status === null ? null : describeComparison(status);
  const hostPreimageVerified =
    status?.hostSourceHash !== null &&
    status?.hostSourceHash !== undefined &&
    status.hostSourceHash === status.preHash;
  const verified = status !== null && previewIdentityMatches(status, identity);
  const showComparison = presentation?.canCompare === true && verified;

  return (
    <>
      <section aria-live="polite" className="panel comparison-status">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Hash-bound lifecycle status</p>
            <h2>{status?.title ?? "Prepared change identity"}</h2>
            <p className="panel-subtitle">
              Studio renders the proposal only after the isolated process
              declares the same evolution and postimage hashes.
            </p>
          </div>
          <Badge tone={verified ? "positive" : status === null ? "neutral" : "warning"}>
            {status === null
              ? "Checking identities"
              : verified
                ? "Both source hashes verified"
                : phaseLabels[status.phase]}
          </Badge>
        </div>

        {statusError && <p className="evolution-error" role="alert">{statusError}</p>}

        <dl className="comparison-hashes">
          <div><dt>Current preimage</dt><dd><code>{shortHash(status?.preHash ?? null)}</code></dd></div>
          <div><dt>Connected source now</dt><dd><code>{shortHash(status?.hostSourceHash ?? null)}</code></dd></div>
          <div><dt>Proposed postimage</dt><dd><code>{shortHash(status?.postHash ?? null)}</code></dd></div>
          <div><dt>Artifact</dt><dd><code>{shortHash(status?.artifactHash ?? null)}</code></dd></div>
          <div><dt>Static proof</dt><dd><code>{status?.proofPassed ? shortHash(status.proofHash) : "Not passed"}</code></dd></div>
        </dl>

        <div className={"comparison-gate " + (showComparison ? "comparison-gate-verified" : "comparison-gate-locked")}>
          <strong>
            {presentation?.lifecycleLabel ?? "Loading lifecycle"}
          </strong>
          <p>
            {presentation?.notice ?? "Reading the governed lifecycle state."}
          </p>
          {presentation?.canCompare === true && !verified && (
            <p role="alert">
              {hostPreimageVerified
                ? "The preview is hidden because its evolution and postimage identity could not be verified."
                : "Both frames are hidden because the connected CRM source no longer matches the governed preimage."}
              {hostPreimageVerified && previewError !== null
                ? ` ${previewError}`
                : ""}
            </p>
          )}
        </div>
      </section>

      {showComparison && presentation !== null && (
        <section aria-label="CRM version comparison" className="comparison-grid">
          <article className="comparison-frame comparison-current">
            <header>
              <div>
                <p className="eyebrow">Connected host</p>
                <h2>{presentation.currentTitle}</h2>
                <p>{presentation.currentDetail}</p>
              </div>
              <Badge tone="neutral">Before</Badge>
            </header>
            <iframe
              loading="eager"
              sandbox="allow-same-origin allow-scripts"
              src={hostUrl}
              title="Current CRM"
            />
            <a href={hostUrl} rel="noopener noreferrer" target="_blank">
              Open current CRM in a new tab
            </a>
          </article>

          <article className="comparison-frame comparison-proposed">
            <header>
              <div>
                <p className="eyebrow">Verified isolated postimage</p>
                <h2>{presentation.proposedTitle}</h2>
                <p>{presentation.proposedDetail}</p>
              </div>
              <Badge tone="info">Preview only</Badge>
            </header>
            <iframe
              loading="eager"
              sandbox="allow-same-origin allow-scripts"
              src={previewUrl}
              title="Verified isolated proposed CRM preview"
            />
            <a href={previewUrl} rel="noopener noreferrer" target="_blank">
              Open verified preview in a new tab
            </a>
          </article>
        </section>
      )}
    </>
  );
}
