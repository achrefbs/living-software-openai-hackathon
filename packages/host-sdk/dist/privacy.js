const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_KEYS = 24;
const DEFAULT_MAX_STRING_LENGTH = 256;
const SENSITIVE_KEY_PARTS = [
    "address",
    "apikey",
    "authorization",
    "body",
    "content",
    "cookie",
    "credential",
    "email",
    "message",
    "name",
    "note",
    "password",
    "phone",
    "secret",
    "text",
    "token",
];
export class MetadataPrivacyError extends Error {
    path;
    constructor(path, reason) {
        super(`Metadata at ${path || "<root>"} is not allowed: ${reason}`);
        this.name = "MetadataPrivacyError";
        this.path = path;
    }
}
function normalizedKey(key) {
    return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}
function isSensitiveKey(key) {
    const normalized = normalizedKey(key);
    return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
 * Enforces a small, explicit metadata vocabulary after contract validation.
 * Values are never copied into error messages.
 */
export function assertPrivacySafeMetadata(metadata, options = {}) {
    const allowed = new Set(options.allowedKeys ?? []);
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
    const maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
    if (!Number.isInteger(maxDepth) || maxDepth < 1) {
        throw new TypeError("metadata.maxDepth must be a positive integer");
    }
    if (!Number.isInteger(maxKeys) || maxKeys < 0) {
        throw new TypeError("metadata.maxKeys must be a non-negative integer");
    }
    if (!Number.isInteger(maxStringLength) || maxStringLength < 0) {
        throw new TypeError("metadata.maxStringLength must be a non-negative integer");
    }
    let keyCount = 0;
    const visit = (value, path, depth) => {
        if (depth > maxDepth) {
            throw new MetadataPrivacyError(path, `depth exceeds ${maxDepth}`);
        }
        if (typeof value === "string" && value.length > maxStringLength) {
            throw new MetadataPrivacyError(path, `string length exceeds ${maxStringLength}`);
        }
        if (Array.isArray(value)) {
            for (let index = 0; index < value.length; index += 1) {
                const item = value[index];
                if (item === undefined)
                    continue;
                if (isPlainObject(item)) {
                    throw new MetadataPrivacyError(path, "objects inside arrays are not supported");
                }
                visit(item, `${path}[${index}]`, depth + 1);
            }
            return;
        }
        if (!isPlainObject(value))
            return;
        for (const [key, child] of Object.entries(value)) {
            const childPath = path ? `${path}.${key}` : key;
            keyCount += 1;
            if (keyCount > maxKeys) {
                throw new MetadataPrivacyError(childPath, `key count exceeds ${maxKeys}`);
            }
            if (isSensitiveKey(key)) {
                throw new MetadataPrivacyError(childPath, "key resembles sensitive content");
            }
            if (isPlainObject(child)) {
                visit(child, childPath, depth + 1);
                continue;
            }
            if (!allowed.has(childPath)) {
                throw new MetadataPrivacyError(childPath, "key is not allowlisted");
            }
            visit(child, childPath, depth + 1);
        }
    };
    visit(metadata, "", 0);
}
//# sourceMappingURL=privacy.js.map