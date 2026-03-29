import test from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../http/client.js";
import { Logger } from "../util/logger.js";
function createHttpClientForFallbackTests() {
    return new HttpClient({
        baseUrl: "https://www.uscardforum.com",
        timeoutMs: 5000,
        logger: new Logger("silent"),
        auth: { type: "none" },
        bypassMethod: "both",
        browserFallback: {
            enabled: true,
            provider: "playwright",
            interactiveLoginEnabled: true,
        },
    });
}
test("browser fallback retries once after auto-login attempt", async () => {
    const client = createHttpClientForFallbackTests();
    let requestCalls = 0;
    let autoLoginCalls = 0;
    let interactiveCalls = 0;
    client.browserFallbackClient = {
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
    const result = await client.tryBrowserFallback("GET", "https://www.uscardforum.com/latest", {}, undefined);
    assert.deepEqual(result, { ok: true });
    assert.equal(requestCalls, 2);
    assert.equal(autoLoginCalls, 1);
    assert.equal(interactiveCalls, 0);
    await client.dispose();
});
test("browser fallback keeps interactive flow when auto-login env is missing", async () => {
    const client = createHttpClientForFallbackTests();
    let requestCalls = 0;
    let autoLoginCalls = 0;
    let interactiveCalls = 0;
    client.browserFallbackClient = {
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
    await assert.rejects(client.tryBrowserFallback("GET", "https://www.uscardforum.com/latest", {}, undefined), /interactive_login_required/);
    assert.equal(requestCalls, 1);
    assert.equal(autoLoginCalls, 1);
    assert.equal(interactiveCalls, 1);
    await client.dispose();
});
test("browser fallback prompts interactive login when retry still lands on login page", async () => {
    const client = createHttpClientForFallbackTests();
    let requestCalls = 0;
    let autoLoginCalls = 0;
    let interactiveCalls = 0;
    client.browserFallbackClient = {
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
    await assert.rejects(client.tryBrowserFallback("GET", "https://www.uscardforum.com/latest", {}, undefined), /interactive_login_required/);
    assert.equal(requestCalls, 2);
    assert.equal(autoLoginCalls, 1);
    assert.equal(interactiveCalls, 1);
    await client.dispose();
});
//# sourceMappingURL=http_client_browser_fallback_autologin.test.js.map