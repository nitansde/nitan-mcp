import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserFallbackClient } from "../http/browser_fallback.js";
import { Logger } from "../util/logger.js";

function overridePlatform(platform: NodeJS.Platform): () => void {
  const originalPlatform = process.platform;
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform,
  });
  return () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform,
    });
  };
}

function createFakePlaywrightModule() {
  let launchPersistentContextCalls = 0;
  let newPageCalls = 0;
  let closeCalls = 0;
  let clearCookiesCalls = 0;
  let fillLoginValue = "";
  let fillPasswordValue = "";
  let clickCalls = 0;
  let currentUrl = "about:blank";
  let pageClosed = false;

  const keyboard = {
    press: async () => {
      currentUrl = "https://www.uscardforum.com/latest";
    },
  };

  const page = {
    isClosed: () => pageClosed,
    keyboard,
    goto: async (url: string) => {
      currentUrl = url;
      return {
        status: () => 200,
        headers: () => ({ "content-type": "text/html" }),
        text: async () => currentUrl,
      };
    },
    waitForSelector: async () => undefined,
    fill: async (selector: string, value: string) => {
      if (selector.includes("password")) {
        fillPasswordValue = value;
      } else {
        fillLoginValue = value;
      }
    },
    $: async (selector: string) => {
      if (selector === "#login-button") return { selector };
      return null;
    },
    click: async () => {
      clickCalls += 1;
      currentUrl = "https://www.uscardforum.com/latest";
    },
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    content: async () => `<html><body>${currentUrl}</body></html>`,
    url: () => currentUrl,
    evaluate: async () => ({
      status: 200,
      body: "ok",
      headers: { "content-type": "text/plain" },
      finalUrl: currentUrl,
    }),
  };

  const pages: Array<typeof page> = [];
  const context = {
    pages: () => pages.filter((candidate) => !candidate.isClosed()),
    newPage: async () => {
      newPageCalls += 1;
      pages.push(page);
      return page;
    },
    close: async () => {
      closeCalls += 1;
      pageClosed = true;
    },
    clearCookies: async () => {
      clearCookiesCalls += 1;
    },
  };

  return {
    module: {
      chromium: {
        launchPersistentContext: async () => {
          launchPersistentContextCalls += 1;
          return context;
        },
      },
    },
    stats: {
      get launchPersistentContextCalls() {
        return launchPersistentContextCalls;
      },
      get newPageCalls() {
        return newPageCalls;
      },
      get closeCalls() {
        return closeCalls;
      },
      get clearCookiesCalls() {
        return clearCookiesCalls;
      },
      get fillLoginValue() {
        return fillLoginValue;
      },
      get fillPasswordValue() {
        return fillPasswordValue;
      },
      get clickCalls() {
        return clickCalls;
      },
    },
  };
}

function createSingletonLockThenRecoverPlaywrightModule() {
  let launchPersistentContextCalls = 0;
  let newPageCalls = 0;
  let closeCalls = 0;
  let clearCookiesCalls = 0;
  let currentUrl = "about:blank";
  let pageClosed = false;

  const page = {
    isClosed: () => pageClosed,
    goto: async (url: string) => {
      currentUrl = url;
      return {
        status: () => 200,
        headers: () => ({ "content-type": "text/html" }),
        text: async () => currentUrl,
      };
    },
    content: async () => `<html><body>${currentUrl}</body></html>`,
    url: () => currentUrl,
    evaluate: async () => ({
      status: 200,
      body: "ok",
      headers: { "content-type": "text/plain" },
      finalUrl: currentUrl,
    }),
  };

  const pages: Array<typeof page> = [];
  const context = {
    pages: () => pages.filter((candidate) => !candidate.isClosed()),
    newPage: async () => {
      newPageCalls += 1;
      pages.push(page);
      return page;
    },
    close: async () => {
      closeCalls += 1;
      pageClosed = true;
    },
    clearCookies: async () => {
      clearCookiesCalls += 1;
    },
  };

  return {
    module: {
      chromium: {
        launchPersistentContext: async () => {
          launchPersistentContextCalls += 1;
          if (launchPersistentContextCalls === 1) {
            throw new Error("Failed to create a ProcessSingleton for your profile directory. This usually means that the profile is already in use by another instance of Chromium.");
          }
          return context;
        },
      },
    },
    stats: {
      get launchPersistentContextCalls() {
        return launchPersistentContextCalls;
      },
      get newPageCalls() {
        return newPageCalls;
      },
      get closeCalls() {
        return closeCalls;
      },
      get clearCookiesCalls() {
        return clearCookiesCalls;
      },
    },
  };
}

function createJsonResponsePlaywrightModule() {
  let launchPersistentContextCalls = 0;
  let newPageCalls = 0;
  let closeCalls = 0;
  let currentUrl = "about:blank";
  let pageClosed = false;

  const page = {
    isClosed: () => pageClosed,
    goto: async (url: string) => {
      currentUrl = url;
      return {
        status: () => 200,
        headers: () => ({ "content-type": "application/json" }),
        text: async () => '{"ok":true}',
      };
    },
    content: async () => `<html><body><pre>{"ok":true}</pre></body></html>`,
    url: () => currentUrl,
    evaluate: async () => ({
      status: 200,
      body: "ok",
      headers: { "content-type": "text/plain" },
      finalUrl: currentUrl,
    }),
  };

  const pages: Array<typeof page> = [];
  const context = {
    pages: () => pages.filter((candidate) => !candidate.isClosed()),
    newPage: async () => {
      newPageCalls += 1;
      pages.push(page);
      return page;
    },
    close: async () => {
      closeCalls += 1;
      pageClosed = true;
    },
    clearCookies: async () => undefined,
  };

  return {
    module: {
      chromium: {
        launchPersistentContext: async () => {
          launchPersistentContextCalls += 1;
          return context;
        },
      },
    },
    stats: {
      get launchPersistentContextCalls() {
        return launchPersistentContextCalls;
      },
      get newPageCalls() {
        return newPageCalls;
      },
      get closeCalls() {
        return closeCalls;
      },
    },
  };
}

function createChallengeThenRecoverPlaywrightModule() {
  let launchPersistentContextCalls = 0;
  let newPageCalls = 0;
  let closeCalls = 0;
  let clearCookiesCalls = 0;
  let gotoCalls = 0;
  let currentUrl = "about:blank";
  let pageClosed = false;

  const page = {
    isClosed: () => pageClosed,
    goto: async (url: string) => {
      gotoCalls += 1;
      currentUrl = url;
      if (gotoCalls === 1) {
        return {
          status: () => 403,
          headers: () => ({ "content-type": "text/html" }),
          text: async () => "<!DOCTYPE html><html><body>Just a moment...</body></html>",
        };
      }
      return {
        status: () => 200,
        headers: () => ({ "content-type": "application/json" }),
        text: async () => '{"recovered":true}',
      };
    },
    content: async () => `<html><body><pre>${gotoCalls > 1 ? '{"recovered":true}' : 'Just a moment...'}</pre></body></html>`,
    url: () => currentUrl,
    evaluate: async () => ({
      status: 200,
      body: "ok",
      headers: { "content-type": "text/plain" },
      finalUrl: currentUrl,
    }),
  };

  const pages: Array<typeof page> = [];
  const context = {
    pages: () => pages.filter((candidate) => !candidate.isClosed()),
    newPage: async () => {
      newPageCalls += 1;
      pages.push(page);
      return page;
    },
    close: async () => {
      closeCalls += 1;
      pageClosed = true;
    },
    clearCookies: async () => {
      clearCookiesCalls += 1;
    },
  };

  return {
    module: {
      chromium: {
        launchPersistentContext: async () => {
          launchPersistentContextCalls += 1;
          return context;
        },
      },
    },
    stats: {
      get launchPersistentContextCalls() {
        return launchPersistentContextCalls;
      },
      get newPageCalls() {
        return newPageCalls;
      },
      get closeCalls() {
        return closeCalls;
      },
      get clearCookiesCalls() {
        return clearCookiesCalls;
      },
      get gotoCalls() {
        return gotoCalls;
      },
    },
  };
}

function createHeaderAwareGetPlaywrightModule() {
  let launchPersistentContextCalls = 0;
  let newPageCalls = 0;
  let closeCalls = 0;
  let currentUrl = "about:blank";
  let pageClosed = false;
  let evaluateCalls = 0;
  let lastFetchRequest: any = null;
  const gotoUrls: string[] = [];

  const page = {
    isClosed: () => pageClosed,
    goto: async (url: string) => {
      currentUrl = url;
      gotoUrls.push(url);
      return {
        status: () => 200,
        headers: () => ({ "content-type": "text/html" }),
        text: async () => `<html><body>${url}</body></html>`,
      };
    },
    content: async () => `<html><body>${currentUrl}</body></html>`,
    url: () => currentUrl,
    evaluate: async (_fn: unknown, req: any) => {
      evaluateCalls += 1;
      lastFetchRequest = req;
      return {
        status: 200,
        body: '{"ok":true}',
        headers: { "content-type": "application/json" },
        finalUrl: req.url,
      };
    },
  };

  const pages: Array<typeof page> = [];
  const context = {
    pages: () => pages.filter((candidate) => !candidate.isClosed()),
    newPage: async () => {
      newPageCalls += 1;
      pages.push(page);
      return page;
    },
    close: async () => {
      closeCalls += 1;
      pageClosed = true;
    },
    clearCookies: async () => undefined,
  };

  return {
    module: {
      chromium: {
        launchPersistentContext: async () => {
          launchPersistentContextCalls += 1;
          return context;
        },
      },
    },
    stats: {
      get launchPersistentContextCalls() {
        return launchPersistentContextCalls;
      },
      get newPageCalls() {
        return newPageCalls;
      },
      get closeCalls() {
        return closeCalls;
      },
      get evaluateCalls() {
        return evaluateCalls;
      },
      get lastFetchRequest() {
        return lastFetchRequest;
      },
      get gotoUrls() {
        return gotoUrls;
      },
    },
  };
}

test("reuses single Playwright context and tab across repeated fallback GET requests", async () => {
  const restorePlatform = overridePlatform("darwin");
  const originalHome = process.env.HOME;
  const homeDir = mkdtempSync(join(tmpdir(), "nitan-playwright-reuse-"));
  process.env.HOME = homeDir;

  const fakePlaywright = createFakePlaywrightModule();
  const client = new BrowserFallbackClient(new Logger("silent"), {
    enabled: true,
    provider: "playwright",
    loginProfileName: "Default",
    playwrightModuleLoader: async () => fakePlaywright.module,
  });

  try {
    const nitanProfileDir = join(homeDir, "Library", "Application Support", "NitanMCP", "ChromeProfile", "Default");
    mkdirSync(nitanProfileDir, { recursive: true });

    const first = await client.request({ url: "https://example.com/first", method: "GET" });
    const second = await client.request({ url: "https://example.com/second", method: "GET" });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.finalUrl, "https://example.com/second");
    assert.equal(fakePlaywright.stats.launchPersistentContextCalls, 1);
    assert.equal(fakePlaywright.stats.newPageCalls, 1);

    await client.dispose();
    assert.equal(fakePlaywright.stats.closeCalls, 1);
  } finally {
    await client.dispose();
    process.env.HOME = originalHome;
    restorePlatform();
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("uses raw response text for GET JSON endpoints instead of rendered page HTML", async () => {
  const restorePlatform = overridePlatform("darwin");
  const originalHome = process.env.HOME;
  const homeDir = mkdtempSync(join(tmpdir(), "nitan-playwright-json-body-"));
  process.env.HOME = homeDir;

  const fakePlaywright = createJsonResponsePlaywrightModule();
  const client = new BrowserFallbackClient(new Logger("silent"), {
    enabled: true,
    provider: "playwright",
    loginProfileName: "Default",
    playwrightModuleLoader: async () => fakePlaywright.module,
  });

  try {
    const nitanProfileDir = join(homeDir, "Library", "Application Support", "NitanMCP", "ChromeProfile", "Default");
    mkdirSync(nitanProfileDir, { recursive: true });

    const response = await client.request({ url: "https://example.com/about.json", method: "GET" });

    assert.equal(response.status, 200);
    assert.equal(response.body, '{"ok":true}');
    assert.equal(fakePlaywright.stats.launchPersistentContextCalls, 1);
    assert.equal(fakePlaywright.stats.newPageCalls, 1);
  } finally {
    await client.dispose();
    process.env.HOME = originalHome;
    restorePlatform();
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("retries implicit managed nitan profile GET once after clearing cookies on challenge response", async () => {
  const restorePlatform = overridePlatform("darwin");
  const originalHome = process.env.HOME;
  const homeDir = mkdtempSync(join(tmpdir(), "nitan-playwright-cookie-recovery-"));
  process.env.HOME = homeDir;

  const fakePlaywright = createChallengeThenRecoverPlaywrightModule();
  const client = new BrowserFallbackClient(new Logger("silent"), {
    enabled: true,
    provider: "playwright",
    playwrightModuleLoader: async () => fakePlaywright.module,
  });

  try {
    const response = await client.request({ url: "https://example.com/about.json", method: "GET" });

    assert.equal(response.status, 200);
    assert.equal(response.body, '{"recovered":true}');
    assert.equal(fakePlaywright.stats.clearCookiesCalls, 1);
    assert.equal(fakePlaywright.stats.gotoCalls, 2);
  } finally {
    await client.dispose();
    process.env.HOME = originalHome;
    restorePlatform();
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("uses browser fetch for GET requests that need custom auth headers", async () => {
  const restorePlatform = overridePlatform("darwin");
  const originalHome = process.env.HOME;
  const homeDir = mkdtempSync(join(tmpdir(), "nitan-playwright-header-fetch-"));
  process.env.HOME = homeDir;

  const fakePlaywright = createHeaderAwareGetPlaywrightModule();
  const client = new BrowserFallbackClient(new Logger("silent"), {
    enabled: true,
    provider: "playwright",
    loginProfileName: "Default",
    playwrightModuleLoader: async () => fakePlaywright.module,
  });

  try {
    const nitanProfileDir = join(homeDir, "Library", "Application Support", "NitanMCP", "ChromeProfile", "Default");
    mkdirSync(nitanProfileDir, { recursive: true });

    const response = await client.request({
      url: "https://example.com/notifications.json",
      method: "GET",
      headers: {
        "User-Api-Key": "demo-key",
        "User-Api-Client-Id": "demo-client",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body, '{"ok":true}');
    assert.equal(fakePlaywright.stats.evaluateCalls, 1);
    assert.deepEqual(fakePlaywright.stats.lastFetchRequest.headers, {
      "User-Api-Key": "demo-key",
      "User-Api-Client-Id": "demo-client",
    });
    assert.deepEqual(fakePlaywright.stats.gotoUrls, ["https://example.com"]);
  } finally {
    await client.dispose();
    process.env.HOME = originalHome;
    restorePlatform();
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("auto-login is attempted with NITAN env credentials and skipped when env is missing", async () => {
  const restorePlatform = overridePlatform("darwin");
  const originalHome = process.env.HOME;
  const originalUsername = process.env.NITAN_USERNAME;
  const originalPassword = process.env.NITAN_PASSWORD;
  const homeDir = mkdtempSync(join(tmpdir(), "nitan-playwright-autologin-"));
  process.env.HOME = homeDir;

  const fakePlaywright = createFakePlaywrightModule();
  const client = new BrowserFallbackClient(new Logger("silent"), {
    enabled: true,
    provider: "playwright",
    loginProfileName: "nitan",
    playwrightModuleLoader: async () => fakePlaywright.module,
  });

  try {
    const nitanProfileDir = join(homeDir, "Library", "Application Support", "NitanMCP", "ChromeProfile", "nitan");
    mkdirSync(nitanProfileDir, { recursive: true });

    process.env.NITAN_USERNAME = "demo-user";
    process.env.NITAN_PASSWORD = "demo-password";
    const attemptedWithEnv = await client.maybeAutoLogin("https://www.uscardforum.com/login");
    assert.equal(attemptedWithEnv, true);
    assert.equal(fakePlaywright.stats.launchPersistentContextCalls, 1);
    assert.equal(fakePlaywright.stats.fillLoginValue, "demo-user");
    assert.equal(fakePlaywright.stats.fillPasswordValue, "demo-password");
    assert.equal(fakePlaywright.stats.clickCalls, 1);

    delete process.env.NITAN_USERNAME;
    delete process.env.NITAN_PASSWORD;
    const attemptedWithoutEnv = await client.maybeAutoLogin("https://www.uscardforum.com/login");
    assert.equal(attemptedWithoutEnv, false);
    assert.equal(fakePlaywright.stats.launchPersistentContextCalls, 1);
  } finally {
    await client.dispose();
    process.env.HOME = originalHome;
    if (originalUsername === undefined) delete process.env.NITAN_USERNAME;
    else process.env.NITAN_USERNAME = originalUsername;
    if (originalPassword === undefined) delete process.env.NITAN_PASSWORD;
    else process.env.NITAN_PASSWORD = originalPassword;
    restorePlatform();
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("recovers from singleton lock by terminating locked profile process and relaunching", async () => {
  const restorePlatform = overridePlatform("darwin");
  const originalHome = process.env.HOME;
  const homeDir = mkdtempSync(join(tmpdir(), "nitan-playwright-lock-recovery-"));
  process.env.HOME = homeDir;

  const fakePlaywright = createSingletonLockThenRecoverPlaywrightModule();
  const client = new BrowserFallbackClient(new Logger("silent"), {
    enabled: true,
    provider: "playwright",
    loginProfileName: "nitan",
    playwrightModuleLoader: async () => fakePlaywright.module,
  });

  let terminateCalls = 0;
  (client as any).terminateLockedProfileChromeProcesses = async () => {
    terminateCalls += 1;
    return 1;
  };

  try {
    const nitanProfileDir = join(homeDir, "Library", "Application Support", "NitanMCP", "ChromeProfile", "nitan");
    mkdirSync(nitanProfileDir, { recursive: true });

    const response = await client.request({ url: "https://example.com/lock-recovery", method: "GET" });

    assert.equal(response.status, 200);
    assert.equal(response.finalUrl, "https://example.com/lock-recovery");
    assert.equal(terminateCalls, 1);
    assert.equal(fakePlaywright.stats.launchPersistentContextCalls, 2);
    assert.equal(fakePlaywright.stats.newPageCalls, 1);
  } finally {
    await client.dispose();
    process.env.HOME = originalHome;
    restorePlatform();
    rmSync(homeDir, { recursive: true, force: true });
  }
});
