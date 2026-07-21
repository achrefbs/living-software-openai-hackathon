export class AutomaticBundleError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "AutomaticBundleError";
    }
}
//# sourceMappingURL=types.js.map