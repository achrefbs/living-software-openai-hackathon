import { createHash } from "node:crypto";

import type { JsonValue, Sha256 } from "@living-software/contracts";
import { canonicalStringify, sha256 } from "@living-software/core";

export function hashJson(value: unknown): Sha256 {
  return sha256(value as JsonValue);
}

export function hashBytes(value: string | Buffer): Sha256 {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function canonicalJson(value: unknown): string {
  return canonicalStringify(value as JsonValue);
}
