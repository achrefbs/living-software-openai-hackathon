export class DiscoveryError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "DiscoveryError";
    }
}
//# sourceMappingURL=types.js.map