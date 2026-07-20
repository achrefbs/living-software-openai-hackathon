import { createHash } from "node:crypto";

import type { JsonValue, Sha256 } from "@living-software/contracts";

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
}

export function canonicalStringify(value: JsonValue): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: JsonValue): Sha256 {
  return `sha256:${createHash("sha256")
    .update(canonicalStringify(value))
    .digest("hex")}`;
}
