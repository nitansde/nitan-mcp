export const DEFAULT_BROWSER_FALLBACK_PROVIDER = "playwright";
export function getDefaultBrowserFallbackEnabled(platform = process.platform) {
    return platform === "darwin";
}
export function getDefaultBrowserFallbackProvider(platform = process.platform) {
    return DEFAULT_BROWSER_FALLBACK_PROVIDER;
}
export function resolveBrowserFallbackProvider(configuredProvider) {
    return configuredProvider ?? DEFAULT_BROWSER_FALLBACK_PROVIDER;
}
export function resolveBrowserFallbackEnabled(configuredEnabled, platform = process.platform) {
    return platform === "darwin" ? configuredEnabled : false;
}
//# sourceMappingURL=browser_fallback_defaults.js.map