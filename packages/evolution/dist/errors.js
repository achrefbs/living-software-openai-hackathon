export class SourceEvolutionError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = "SourceEvolutionError";
    }
}
//# sourceMappingURL=errors.js.map