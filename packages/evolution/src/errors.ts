export type SourceEvolutionErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_ADAPTER_INPUT"
  | "UNSAFE_TARGET"
  | "TARGET_PREIMAGE_MISMATCH"
  | "TARGET_POSTIMAGE_MISMATCH"
  | "EVOLUTION_ALREADY_EXISTS"
  | "EVOLUTION_NOT_FOUND"
  | "HOST_NOT_INSTALLED"
  | "HOST_INSTALL_MISMATCH"
  | "EVOLUTION_BUSY"
  | "STATE_TAMPERED"
  | "RECEIPT_CHAIN_INVALID"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_HASH_MISMATCH"
  | "INVALID_TRANSITION"
  | "EVOLUTION_REPLAY_REJECTED"
  | "TRANSACTION_RECOVERY_FAILED"
  | "STALE_REVISION"
  | "STORAGE_CONFLICT";

export class SourceEvolutionError extends Error {
  public constructor(
    public readonly code: SourceEvolutionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SourceEvolutionError";
  }
}
