export type BrowserFallbackProvider = "playwright" | "openclaw_proxy";
export declare const DEFAULT_BROWSER_FALLBACK_PROVIDER: BrowserFallbackProvider;
export declare function getDefaultBrowserFallbackEnabled(platform?: NodeJS.Platform): boolean;
export declare function getDefaultBrowserFallbackProvider(platform?: NodeJS.Platform): BrowserFallbackProvider;
export declare function resolveBrowserFallbackProvider(configuredProvider?: BrowserFallbackProvider): BrowserFallbackProvider;
export declare function resolveBrowserFallbackEnabled(configuredEnabled: boolean, platform?: NodeJS.Platform): boolean;
