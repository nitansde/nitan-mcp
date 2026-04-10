import test from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../http/client.js";
import { Logger } from "../util/logger.js";

function createHttpClientForFallbackTests(options?: { loginCredentials?: { username: string; password: string; second_factor_token?: string } }): HttpClient {
  return new HttpClient({
    baseUrl: "https://www.uscardforum.com",
    timeoutMs: 5_000,
    logger: new Logger("silent"),
    auth: { type: "none" },
    loginCredentials: options?.loginCredentials,
    bypassMethod: "both",
    browserFallback: {
      enabled: true,
      provider: "playwright",
      interactiveLoginEnabled: true,
    },
  });
}

test("browser fallback retries once after auto-login attempt", async () => {
  const client = createHttpClientForFallbackTests({ loginCredentials: { username: 'demo-user', password: 'demo-password' } });

  let requestCalls = 0;
  let autoLoginCalls = 0;
  let interactiveCalls = 0;

  (client as any).browserFallbackClient = {
    isEnabled: () => true,
    request: async () => {
      requestCalls += 1;
      if (requestCalls === 1) {
        return {
          status: 200,
          body: "<form><input name=\"login\"/><input name=\"password\"/></form>",
          headers: { "content-type": "text/html" },
          finalUrl: "https://www.uscardforum.com/login",
        };
      }
      return {
        status: 200,
        body: "{\"ok\":true}",
        headers: { "content-type": "application/json" },
        finalUrl: "https://www.uscardforum.com/latest",
      };
    },
    maybeAutoLogin: async () => {
      autoLoginCalls += 1;
      return true;
    },
    maybePromptInteractiveLogin: async () => {
      interactiveCalls += 1;
    },
  };

  const result = await (client as any).tryBrowserFallback("GET", "https://www.uscardforum.com/latest", {}, undefined);

  assert.deepEqual(result, { ok: true });
  assert.equal(requestCalls, 2);
  assert.equal(autoLoginCalls, 1);
  assert.equal(interactiveCalls, 0);
  await client.dispose();
});

test("browser fallback keeps interactive flow when auto-login env is missing", async () => {
  const client = createHttpClientForFallbackTests({ loginCredentials: { username: 'demo-user', password: 'demo-password' } });

  let requestCalls = 0;
  let autoLoginCalls = 0;
  let interactiveCalls = 0;

  (client as any).browserFallbackClient = {
    isEnabled: () => true,
    request: async () => {
      requestCalls += 1;
      return {
        status: 200,
        body: "<form><input name=\"login\"/><input name=\"password\"/></form>",
        headers: { "content-type": "text/html" },
        finalUrl: "https://www.uscardforum.com/login",
      };
    },
    maybeAutoLogin: async () => {
      autoLoginCalls += 1;
      return false;
    },
    maybePromptInteractiveLogin: async () => {
      interactiveCalls += 1;
      throw new Error("interactive_login_required");
    },
  };

  await assert.rejects(
    (client as any).tryBrowserFallback("GET", "https://www.uscardforum.com/latest", {}, undefined),
    /interactive_login_required/
  );

  assert.equal(requestCalls, 1);
  assert.equal(autoLoginCalls, 1);
  assert.equal(interactiveCalls, 1);
  await client.dispose();
});

test("browser fallback prompts interactive login when retry still lands on login page", async () => {
  const client = createHttpClientForFallbackTests({ loginCredentials: { username: 'demo-user', password: 'demo-password' } });

  let requestCalls = 0;
  let autoLoginCalls = 0;
  let interactiveCalls = 0;

  (client as any).browserFallbackClient = {
    isEnabled: () => true,
    request: async () => {
      requestCalls += 1;
      return {
        status: 200,
        body: "<form><input name=\"login\"/><input name=\"password\"/></form>",
        headers: { "content-type": "text/html" },
        finalUrl: "https://www.uscardforum.com/login",
      };
    },
    maybeAutoLogin: async () => {
      autoLoginCalls += 1;
      return true;
    },
    maybePromptInteractiveLogin: async () => {
      interactiveCalls += 1;
      throw new Error("interactive_login_required");
    },
  };

  await assert.rejects(
    (client as any).tryBrowserFallback("GET", "https://www.uscardforum.com/latest", {}, undefined),
    /interactive_login_required/
  );

  assert.equal(requestCalls, 2);
  assert.equal(autoLoginCalls, 1);
  assert.equal(interactiveCalls, 1);
  await client.dispose();
});

test("native fetch challenge escalates to browser fallback", async () => {
  const client = createHttpClientForFallbackTests();
  const originalFetch = globalThis.fetch;

  (client as any).cloudscraperClient = undefined;
  (client as any).curlCffiClient = undefined;

  let browserFallbackCalls = 0;
  (client as any).browserFallbackClient = {
    isEnabled: () => true,
    request: async () => {
      browserFallbackCalls += 1;
      return {
        status: 200,
        body: "{\"ok\":true}",
        headers: { "content-type": "application/json" },
        finalUrl: "https://www.uscardforum.com/notifications.json",
      };
    },
    maybeAutoLogin: async () => false,
    maybePromptInteractiveLogin: async () => undefined,
  };

  globalThis.fetch = (async () => new Response("<!DOCTYPE html><html><body>Just a moment...</body></html>", {
    status: 403,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cf-mitigated": "challenge",
      server: "cloudflare",
    },
  })) as any;

  try {
    const result = await client.get("/notifications.json?limit=5");
    assert.deepEqual(result, { ok: true });
    assert.equal(browserFallbackCalls, 1);
  } finally {
    globalThis.fetch = originalFetch as any;
    await client.dispose();
  }
});
