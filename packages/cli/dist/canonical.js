import { createHash } from "node:crypto";
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map((item) => canonicalize(item));
    if (typeof value !== "object" || value === null)
        return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]));
}
export function canonicalJson(value, pretty = false) {
    const serialized = JSON.stringify(canonicalize(value), null, pretty ? 2 : undefined);
    if (serialized === undefined)
        throw new TypeError("Value cannot be serialized as JSON");
    return pretty ? `${serialized}\n` : serialized;
}
export function sha256(value) {
    return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
//# sourceMappingURL=canonical.js.map