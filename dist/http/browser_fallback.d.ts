import { Logger } from "../util/logger.js";
import { type BrowserFallbackProvider } from "./browser_fallback_defaults.js";
export interface BrowserFallbackOptions {
    enabled?: boolean;
    provider?: BrowserFallbackProvider;
    timeoutMs?: number;
    openClawRelayCdpUrl?: string;
    interactiveLoginEnabled?: boolean;
    loginProfileName?: string;
    loginWaitTimeoutMs?: number;
    loginCheckUrl?: string;
    playwrightModuleLoader?: () => Promise<any>;
}
export declare class BrowserFallbackRelayUnavailableError extends Error {
    constructor(message: string);
}
export interface BrowserRequest {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
}
export interface BrowserResponse {
    status: number;
    body: string;
    headers?: Record<string, string>;
    finalUrl?: string;
}
export interface BrowserProfileSelection {
    userDataDir: string;
    profileDirectory: string;
    source: "openclaw" | "nitan";
}
export declare function resolveMacPlaywrightProfileSelection(params: {
    homeDir: string;
    loginProfileName?: string;
    openClawChromeProfileDirOverride?: string;
}): BrowserProfileSelection;
export declare class BrowserFallbackClient {
    private readonly logger;
    private readonly options;
    private readonly timeoutMs;
    private readonly playwrightModuleLoader;
    private playwrightSession?;
    private creatingPlaywrightSession?;
    constructor(logger: Logger, options?: BrowserFallbackOptions);
    private static defaultPlaywrightModuleLoader;
    dispose(): Promise<void>;
    private openChromeOnMac;
    private escapeAppleScriptString;
    private runAppleScript;
    private openUrlInFrontChromeTabOnMac;
    private getMacHomeDir;
    private resolvePlaywrightProfileSelection;
    private resolveEnvAutoLoginCredentials;
    private submitLoginForm;
    maybeAutoLogin(siteUrl: string): Promise<boolean>;
    private buildPlaywrightSessionKey;
    private isContextUsable;
    private isPageUsable;
    private isRetryablePlaywrightSessionError;
    private closePlaywrightSession;
    private isProfileSingletonLockError;
    private listLockedProfileChromePids;
    private isProcessAlive;
    private waitForProcessExit;
    private terminateLockedProfileChromeProcesses;
    private launchPlaywrightPersistentContext;
    private createPlaywrightSession;
    private getOrCreatePlaywrightSession;
    private getOrCreatePlaywrightPage;
    private requestViaPlaywrightPage;
    isEnabled(): boolean;
    request(input: BrowserRequest): Promise<BrowserResponse>;
    private getOpenClawRelayCdpUrl;
    private buildOpenClawRelayUnavailableMessage;
    private probeOpenClawRelay;
    private requestViaOpenClawRelay;
    private requestViaPlaywright;
    maybePromptInteractiveLogin(siteUrl: string): Promise<void>;
}
