class MizerError extends Error {
    constructor(message, file) {
        super(message);
        this.name = "MizerError";
        this.file = file;
    }
}

module.exports = MizerError

