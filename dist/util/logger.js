export class Logger {
    constructor(level = "info") {
        this.level = level;
        this.levelOrder = {
            silent: 0,
            error: 1,
            info: 2,
            debug: 3,
        };
    }
    setLevel(level) {
        this.level = level;
    }
    error(msg, meta) {
        if (this.levelOrder[this.level] >= 1) {
            this.write("ERROR", msg, meta);
        }
    }
    info(msg, meta) {
        if (this.levelOrder[this.level] >= 2) {
            this.write("INFO", msg, meta);
        }
    }
    debug(msg, meta) {
        if (this.levelOrder[this.level] >= 3) {
            this.write("DEBUG", msg, meta);
        }
    }
    write(level, msg, meta) {
        const line = meta ? `${msg} ${safeJson(meta)}` : msg;
        // Log to stderr per spec
        process.stderr.write(`[${new Date().toISOString()}] ${level} ${line}\n`);
    }
}
function safeJson(obj) {
    try {
        return JSON.stringify(obj);
    }
    catch {
        return "<unserializable>";
    }
}
//# sourceMappingURL=logger.js.map