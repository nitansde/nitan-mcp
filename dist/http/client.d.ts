import { Logger } from "../util/logger.js";
import { type BrowserFallbackOptions } from "./browser_fallback.js";
export type AuthMode = {
    type: "none";
} | {
    type: "api_key";
    key: string;
    username?: string;
} | {
    type: "user_api_key";
    key: string;
    client_id?: string;
};
export type BypassMethod = "cloudscraper" | "curl_cffi" | "both";
export interface HttpClientOptions {
    baseUrl: string;
    timeoutMs: number;
    logger: Logger;
    auth: AuthMode;
    useCloudscraper?: boolean;
    bypassMethod?: BypassMethod;
    pythonPath?: string;
    loginCredentials?: {
        username: string;
        password: string;
        second_factor_token?: string;
    };
    browserFallback?: BrowserFallbackOptions;
}
export declare class HttpError extends Error {
    status: number;
    body?: unknown | undefined;
    constructor(status: number, message: string, body?: unknown | undefined);
}
export declare class HttpClient {
    private opts;
    private base;
    private userAgent;
    private cache;
    private cookies;
    private lastUrl;
    private cloudscraperClient?;
    private curlCffiClient?;
    private bypassMethod;
    private cloudscraperFailed;
    private browserFallbackClient?;
    constructor(opts: HttpClientOptions);
    private headers;
    private parseCookies;
    get(path: string, { signal }?: {
        signal?: AbortSignal;
    }): Promise<any>;
    getCached(path: string, ttlMs: number, { signal }?: {
        signal?: AbortSignal;
    }): Promise<any>;
    post(path: string, body: unknown, { signal }?: {
        signal?: AbortSignal;
    }): Promise<any>;
    private request;
    private isCloudflareChallenge;
    private isLoginRequired;
    private tryBrowserFallback;
    private requestViaBypass;
    dispose(): Promise<void>;
}
