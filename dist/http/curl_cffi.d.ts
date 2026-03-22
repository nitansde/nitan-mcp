import type { Logger } from "../util/logger.js";
export interface CurlCffiRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    cookies?: Record<string, string>;
    timeout?: number;
    login?: {
        username: string;
        password: string;
        second_factor_token?: string;
    };
}
export interface CurlCffiResponse {
    success: boolean;
    status?: number;
    headers?: Record<string, string>;
    body?: string;
    cookies?: Record<string, string>;
    csrf_token?: string;
    message?: string;
    error?: string;
    error_type?: string;
}
export declare class CurlCffiClient {
    private logger;
    private pythonPath;
    private scriptPath;
    constructor(logger: Logger, pythonPath?: string);
    request(req: CurlCffiRequest): Promise<CurlCffiResponse>;
}
