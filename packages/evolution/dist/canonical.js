import { createHash } from "node:crypto";
import { canonicalStringify, sha256 } from "@living-software/core";
export function hashJson(value) {
    return sha256(value);
}
export function hashBytes(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
export function canonicalJson(value) {
    return canonicalStringify(value);
}
//# sourceMappingURL=canonical.js.map