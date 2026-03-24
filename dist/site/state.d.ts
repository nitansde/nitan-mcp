import type { Logger } from "../util/logger.js";
import { HttpClient, type AuthMode, type BypassMethod } from "../http/client.js";
import type { BrowserFallbackOptions } from "../http/browser_fallback.js";
export type AuthOverride = {
    site: string;
    api_key?: string;
    api_username?: string;
    user_api_key?: string;
    user_api_client_id?: string;
    username?: string;
    password?: string;
    second_factor_token?: string;
};
export declare class SiteState {
    private opts;
    private currentSiteBase?;
    private currentClient?;
    private readonly clientCache;
    constructor(opts: {
        logger: Logger;
        timeoutMs: number;
        defaultAuth: AuthMode;
        authOverrides?: AuthOverride[];
        bypassMethod?: BypassMethod;
        useCloudscraper?: boolean;
        pythonPath?: string;
        browserFallback?: BrowserFallbackOptions;
    });
    getSiteBase(): string | undefined;
    ensureSelectedSite(): {
        base: string;
        client: HttpClient;
    };
    buildClientForSite(siteUrl: string): {
        base: string;
        client: HttpClient;
    };
    selectSite(siteUrl: string): {
        base: string;
        client: HttpClient;
    };
    dispose(): Promise<void>;
    private resolveAuthForSite;
    private resolveLoginForSite;
    private sameOrigin;
}
export type SiteStateInit = ConstructorParameters<typeof SiteState>[0];
