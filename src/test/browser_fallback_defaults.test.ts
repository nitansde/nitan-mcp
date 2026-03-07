import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BROWSER_FALLBACK_PROVIDER,
  getDefaultBrowserFallbackEnabled,
  getDefaultBrowserFallbackProvider,
  resolveBrowserFallbackEnabled,
  resolveBrowserFallbackProvider,
} from "../http/browser_fallback_defaults.js";

test("non-macOS browser fallback remains disabled", () => {
  assert.equal(resolveBrowserFallbackEnabled(true, "linux"), false);
  assert.equal(resolveBrowserFallbackEnabled(true, "win32"), false);
  assert.equal(resolveBrowserFallbackEnabled(false, "linux"), false);
});

test("default browser fallback provider stays playwright (relay is opt-in)", () => {
  assert.equal(DEFAULT_BROWSER_FALLBACK_PROVIDER, "playwright");
  assert.equal(getDefaultBrowserFallbackProvider("darwin"), "playwright");
  assert.equal(getDefaultBrowserFallbackProvider("linux"), "playwright");
  assert.equal(getDefaultBrowserFallbackProvider("win32"), "playwright");
  assert.equal(resolveBrowserFallbackProvider(undefined), "playwright");
  assert.equal(resolveBrowserFallbackProvider("openclaw_proxy"), "openclaw_proxy");
  assert.notEqual(getDefaultBrowserFallbackProvider("darwin"), "openclaw_proxy");
  assert.equal(getDefaultBrowserFallbackEnabled("darwin"), true);
});
