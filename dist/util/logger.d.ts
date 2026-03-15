export type LogLevel = "silent" | "error" | "info" | "debug";
export declare class Logger {
    private level;
    private levelOrder;
    constructor(level?: LogLevel);
    setLevel(level: LogLevel): void;
    error(msg: string, meta?: unknown): void;
    info(msg: string, meta?: unknown): void;
    debug(msg: string, meta?: unknown): void;
    private write;
}
