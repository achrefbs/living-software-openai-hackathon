export type ComparisonPhase =
  | "ready"
  | "draft_ready"
  | "approved"
  | "active"
  | "rolled_back";

export type ComparisonStatus = Readonly<{
  connected: boolean;
  phase: ComparisonPhase;
  evolutionId: string | null;
  title: string | null;
  proposalSummary: string | null;
  proposalRationale: string | null;
  targetPath: string | null;
  preHash: string | null;
  postHash: string | null;
  hostSourceHash: string | null;
  artifactHash: string | null;
  proofHash: string | null;
  proofPassed: boolean;
  approvalActor: string | null;
  error?: string;
}>;

export const PREVIEW_IDENTITY_SCHEMA = "living.preview-identity/v1";

export type PreviewIdentity = Readonly<{
  schemaVersion: typeof PREVIEW_IDENTITY_SCHEMA;
  evolutionId: string;
  postHash: string;
  targetPath: string;
}>;

export type ComparisonPresentation = Readonly<{
  canCompare: boolean;
  lifecycleLabel: string;
  notice: string;
  currentTitle: string;
  currentDetail: string;
  proposedTitle: string;
  proposedDetail: string;
}>;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const ALLOWED_SOURCE_PATH = /^src\/(?:app|components)\/.+\.(?:css|jsx?|tsx?)$/u;
const EXCLUDED_SOURCE_SEGMENT = /^(?:__tests__|e2e|test|tests)$/iu;
const EXCLUDED_SOURCE_FILE = /(?:^route\.(?:jsx?|tsx?)$|\.(?:spec|stories|test)\.(?:jsx?|tsx?)$|(?:^|\.)config\.(?:jsx?|tsx?)$|(?:^|\.)env\.(?:css|jsx?|tsx?)$|^env\.(?:css|jsx?|tsx?)$|\.d\.ts$|\.lock$)/iu;

function validTargetPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    return false;
  }
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const fileName = segments.at(-1);
  return (
    normalized === value &&
    !normalized.startsWith("/") &&
    !/^[A-Za-z]:\//u.test(normalized) &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..") &&
    ALLOWED_SOURCE_PATH.test(normalized) &&
    fileName !== undefined &&
    !segments.slice(0, -1).some((segment) => EXCLUDED_SOURCE_SEGMENT.test(segment)) &&
    !EXCLUDED_SOURCE_FILE.test(fileName) &&
    !fileName.startsWith(".env") &&
    !/(?:^|[-_.])lock(?:[-_.]|$)/iu.test(fileName)
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Preview identity must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export function parsePreviewIdentity(value: unknown): PreviewIdentity {
  const record = asRecord(value);
  const keys = Object.keys(record).sort();
  const expected = ["evolutionId", "postHash", "schemaVersion", "targetPath"];
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError("Preview identity contains unknown or missing fields");
  }
  if (
    record.schemaVersion !== PREVIEW_IDENTITY_SCHEMA ||
    typeof record.evolutionId !== "string" ||
    !IDENTIFIER.test(record.evolutionId) ||
    typeof record.postHash !== "string" ||
    !SHA256.test(record.postHash) ||
    !validTargetPath(record.targetPath)
  ) {
    throw new TypeError("Preview identity is invalid");
  }
  return record as PreviewIdentity;
}

export function previewIdentityMatches(
  status: ComparisonStatus,
  identity: PreviewIdentity | null,
): boolean {
  return (
    identity !== null &&
    status.connected &&
    (status.phase === "draft_ready" || status.phase === "approved") &&
    status.evolutionId !== null &&
    status.targetPath !== null &&
    status.postHash !== null &&
    status.hostSourceHash !== null &&
    status.proofPassed &&
    status.hostSourceHash === status.preHash &&
    identity.evolutionId === status.evolutionId &&
    identity.postHash === status.postHash &&
    identity.targetPath === status.targetPath
  );
}

export function describeComparison(
  status: ComparisonStatus,
): ComparisonPresentation {
  switch (status.phase) {
    case "draft_ready":
      return {
        canCompare: true,
        lifecycleLabel: "Prepared draft",
        notice:
          "Prepared only: no human approval or source application has occurred.",
        currentTitle: "Current application",
        currentDetail: "Unchanged connected source running on the host.",
        proposedTitle: "Proposed application",
        proposedDetail: "Verified isolated preview of the prepared target postimage.",
      };
    case "approved":
      return {
        canCompare: true,
        lifecycleLabel: "Human approved",
        notice:
          "The exact artifact is approved but has not yet been applied to the connected application.",
        currentTitle: "Current application",
        currentDetail: "Connected source remains unchanged until Apply is selected.",
        proposedTitle: "Approved proposal",
        proposedDetail: "Verified isolated preview of the approved target postimage.",
      };
    case "active":
      return {
        canCompare: false,
        lifecycleLabel: "Applied to source",
        notice:
          "Source application is recorded. This before/after view is locked because the connected host can no longer be truthfully labeled the old application.",
        currentTitle: "Connected application",
        currentDetail: "The approved postimage has been applied to source.",
        proposedTitle: "Applied proposal",
        proposedDetail: "Review runtime verification in Evolution Review.",
      };
    case "rolled_back":
      return {
        canCompare: false,
        lifecycleLabel: "Rolled back",
        notice:
          "The exact preimage was restored. This historical proposal is locked and new evidence is required for another attempt.",
        currentTitle: "Restored application",
        currentDetail: "The connected source has returned to its approved preimage.",
        proposedTitle: "Historical proposal",
        proposedDetail: "The rolled-back postimage is not an active candidate.",
      };
    case "ready":
      return {
        canCompare: false,
        lifecycleLabel: "Evidence ready",
        notice:
          "Prepare an evidence-bound evolution before opening a version comparison.",
        currentTitle: "Connected application",
        currentDetail: "No exact proposal is currently prepared.",
        proposedTitle: "No proposal",
        proposedDetail: "A verified postimage does not exist yet.",
      };
  }
}
