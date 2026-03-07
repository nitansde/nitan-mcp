export type BrowserFallbackProvider = "playwright" | "openclaw_proxy";
export const DEFAULT_BROWSER_FALLBACK_PROVIDER: BrowserFallbackProvider = "playwright";

export function getDefaultBrowserFallbackEnabled(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "darwin";
}

export function getDefaultBrowserFallbackProvider(
  platform: NodeJS.Platform = process.platform
): BrowserFallbackProvider {
  return DEFAULT_BROWSER_FALLBACK_PROVIDER;
}

export function resolveBrowserFallbackProvider(
  configuredProvider?: BrowserFallbackProvider
): BrowserFallbackProvider {
  return configuredProvider ?? DEFAULT_BROWSER_FALLBACK_PROVIDER;
}

export function resolveBrowserFallbackEnabled(
  configuredEnabled: boolean,
  platform: NodeJS.Platform = process.platform
): boolean {
  return platform === "darwin" ? configuredEnabled : false;
}
