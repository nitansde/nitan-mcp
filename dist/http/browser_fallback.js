var _a;
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getDefaultBrowserFallbackProvider, } from "./browser_fallback_defaults.js";
export class BrowserFallbackRelayUnavailableError extends Error {
    constructor(message) {
        super(message);
        this.name = "BrowserFallbackRelayUnavailableError";
    }
}
const OPENCLAW_USER_DATA_DIR_CANDIDATE_SUFFIXES = [
    ["Library", "Application Support", "OpenClaw", "ChromeProfile"],
    ["Library", "Application Support", "OpenClaw", "Browser", "ChromeProfile"],
    ["Library", "Application Support", "OpenClaw", "Browser", "chrome"],
];
const NITAN_CHROME_USER_DATA_DIR_SUFFIX = ["Library", "Application Support", "NitanMCP", "ChromeProfile"];
const execFileAsync = promisify(execFile);
function readJsonObject(filePath) {
    try {
        const raw = readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
    }
    catch {
    }
    return {};
}
function writeJsonObject(filePath, value) {
    writeFileSync(filePath, JSON.stringify(value));
}
function ensureManagedProfileMetadata(userDataDir, profileDirectory) {
    const profileName = profileDirectory;
    try {
        const localStatePath = join(userDataDir, "Local State");
        const localState = readJsonObject(localStatePath);
        const localStateProfile = localState.profile && typeof localState.profile === "object"
            ? localState.profile
            : {};
        const infoCache = localStateProfile.info_cache && typeof localStateProfile.info_cache === "object"
            ? localStateProfile.info_cache
            : {};
        const profileInfo = infoCache[profileDirectory] && typeof infoCache[profileDirectory] === "object"
            ? infoCache[profileDirectory]
            : {};
        const profilesOrder = Array.isArray(localStateProfile.profiles_order)
            ? [...localStateProfile.profiles_order]
            : [];
        if (!profilesOrder.includes(profileDirectory)) {
            profilesOrder.push(profileDirectory);
        }
        const lastActiveProfiles = Array.isArray(localStateProfile.last_active_profiles)
            ? [...localStateProfile.last_active_profiles]
            : [];
        if (!lastActiveProfiles.includes(profileDirectory)) {
            lastActiveProfiles.push(profileDirectory);
        }
        infoCache[profileDirectory] = {
            ...profileInfo,
            name: profileName,
            is_using_default_name: false,
        };
        localState.profile = {
            ...localStateProfile,
            info_cache: infoCache,
            last_used: profileDirectory,
            profiles_order: profilesOrder,
            last_active_profiles: lastActiveProfiles,
        };
        writeJsonObject(localStatePath, localState);
    }
    catch {
    }
    try {
        const preferencesPath = join(userDataDir, profileDirectory, "Preferences");
        const preferences = readJsonObject(preferencesPath);
        const profilePreferences = preferences.profile && typeof preferences.profile === "object"
            ? preferences.profile
            : {};
        preferences.profile = {
            ...profilePreferences,
            name: profileName,
            using_default_name: false,
        };
        writeJsonObject(preferencesPath, preferences);
    }
    catch {
    }
}
function getOpenClawUserDataDirCandidates(homeDir, openClawChromeProfileDirOverride) {
    const envOverride = openClawChromeProfileDirOverride?.trim();
    return [
        envOverride,
        ...OPENCLAW_USER_DATA_DIR_CANDIDATE_SUFFIXES.map((suffix) => join(homeDir, ...suffix)),
    ].filter((candidate) => Boolean(candidate));
}
export function resolveMacPlaywrightProfileSelection(params) {
    const profileDirectory = params.loginProfileName || "nitan";
    const openClawCandidates = getOpenClawUserDataDirCandidates(params.homeDir, params.openClawChromeProfileDirOverride);
    for (const candidate of openClawCandidates) {
        if (!existsSync(candidate))
            continue;
        const selectedProfilePath = join(candidate, profileDirectory);
        if (!existsSync(selectedProfilePath))
            continue;
        return {
            userDataDir: candidate,
            profileDirectory,
            source: "openclaw",
        };
    }
    const nitanUserDataDir = join(params.homeDir, ...NITAN_CHROME_USER_DATA_DIR_SUFFIX);
    mkdirSync(join(nitanUserDataDir, profileDirectory), { recursive: true });
    ensureManagedProfileMetadata(nitanUserDataDir, profileDirectory);
    return {
        userDataDir: nitanUserDataDir,
        profileDirectory,
        source: "nitan",
    };
}
export class BrowserFallbackClient {
    constructor(logger, options = {}) {
        this.logger = logger;
        this.options = options;
        this.timeoutMs = options.timeoutMs ?? 45000;
        this.playwrightModuleLoader = options.playwrightModuleLoader ?? _a.defaultPlaywrightModuleLoader;
    }
    async dispose() {
        await this.closePlaywrightSession();
    }
    async openChromeOnMac(openArgs, errorPrefix) {
        await new Promise((resolve, reject) => {
            const proc = spawn("open", openArgs);
            proc.on("error", reject);
            proc.on("exit", (code) => {
                if (code === 0)
                    resolve();
                else
                    reject(new Error(`${errorPrefix}, exit code: ${code}`));
            });
        });
    }
    escapeAppleScriptString(value) {
        return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    }
    async runAppleScript(lines) {
        const args = lines.flatMap((line) => ["-e", line]);
        return await new Promise((resolve, reject) => {
            const proc = spawn("osascript", args);
            let stdout = "";
            let stderr = "";
            proc.stdout?.on("data", (chunk) => {
                stdout += String(chunk);
            });
            proc.stderr?.on("data", (chunk) => {
                stderr += String(chunk);
            });
            proc.on("error", reject);
            proc.on("exit", (code) => {
                if (code === 0) {
                    resolve(stdout.trim());
                    return;
                }
                const suffix = stderr.trim() ? `. ${stderr.trim()}` : "";
                reject(new Error(`AppleScript failed, exit code: ${code}${suffix}`));
            });
        });
    }
    async openUrlInFrontChromeTabOnMac(url) {
        const escapedUrl = this.escapeAppleScriptString(url);
        let lastFrontUrl = "";
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const frontUrl = await this.runAppleScript([
                "tell application \"Google Chrome\" to activate",
                "tell application \"Google Chrome\" to if (count of windows) = 0 then make new window",
                `tell application \"Google Chrome\" to set URL of active tab of front window to \"${escapedUrl}\"`,
                "delay 0.25",
                "tell application \"Google Chrome\" to return URL of active tab of front window",
            ]);
            lastFrontUrl = frontUrl;
            if (frontUrl === url || frontUrl.startsWith(url)) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        throw new Error(`Failed to open target login URL '${url}' in Chrome front tab. Last observed front tab URL: '${lastFrontUrl || "unknown"}'`);
    }
    getMacHomeDir() {
        const home = process.env.HOME || homedir();
        if (!home)
            throw new Error("browser_fallback_home_directory_not_found");
        return home;
    }
    resolvePlaywrightProfileSelection() {
        if (process.platform !== "darwin") {
            throw new Error("browser_fallback_not_supported_on_platform");
        }
        const homeDir = this.getMacHomeDir();
        return resolveMacPlaywrightProfileSelection({
            homeDir,
            loginProfileName: this.options.loginProfileName,
            openClawChromeProfileDirOverride: process.env.OPENCLAW_CHROME_PROFILE_DIR,
        });
    }
    resolveEnvAutoLoginCredentials() {
        const username = process.env.NITAN_USERNAME?.trim();
        const password = process.env.NITAN_PASSWORD;
        if (!username || !password)
            return undefined;
        return { username, password };
    }
    async submitLoginForm(page, loginUrl, username, password) {
        const loginInputSelector = [
            'input[name="login"]',
            "#login-account-name",
            'input[autocomplete="username"]',
            'input[type="email"]',
        ].join(",");
        const passwordInputSelector = [
            'input[name="password"]',
            "#login-account-password",
            'input[autocomplete="current-password"]',
            'input[type="password"]',
        ].join(",");
        const submitSelectors = [
            "#login-button",
            'button[type="submit"]',
            '.login-button button',
            '.btn-primary[type="submit"]',
        ];
        await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
        await page.waitForSelector(loginInputSelector, { timeout: Math.min(this.timeoutMs, 10000) });
        await page.waitForSelector(passwordInputSelector, { timeout: Math.min(this.timeoutMs, 10000) });
        await page.fill(loginInputSelector, username);
        await page.fill(passwordInputSelector, password);
        let submitted = false;
        for (const selector of submitSelectors) {
            const button = await page.$(selector);
            if (!button)
                continue;
            await Promise.allSettled([
                page.waitForLoadState("domcontentloaded", { timeout: Math.min(this.timeoutMs, 10000) }),
                page.click(selector),
            ]);
            submitted = true;
            break;
        }
        if (!submitted) {
            await page.keyboard.press("Enter");
            await page.waitForLoadState("domcontentloaded", { timeout: Math.min(this.timeoutMs, 10000) }).catch(() => undefined);
        }
        if (typeof page.waitForTimeout === "function") {
            await page.waitForTimeout(500);
        }
    }
    async maybeAutoLogin(siteUrl) {
        if (process.platform !== "darwin")
            return false;
        const provider = this.options.provider ?? getDefaultBrowserFallbackProvider();
        if (provider !== "playwright")
            return false;
        const credentials = this.resolveEnvAutoLoginCredentials();
        if (!credentials)
            return false;
        try {
            const profileSelection = this.resolvePlaywrightProfileSelection();
            const session = await this.getOrCreatePlaywrightSession(profileSelection);
            const page = await this.getOrCreatePlaywrightPage(session);
            const loginUrl = this.options.loginCheckUrl || siteUrl;
            this.logger.info("Attempting browser auto-login with configured NITAN credentials");
            await this.submitLoginForm(page, loginUrl, credentials.username, credentials.password);
            return true;
        }
        catch (e) {
            this.logger.info(`Browser auto-login attempt did not complete: ${e?.message || String(e)}`);
            return true;
        }
    }
    buildPlaywrightSessionKey(profileSelection) {
        return `${profileSelection.userDataDir}::${profileSelection.profileDirectory}`;
    }
    isContextUsable(context) {
        if (!context)
            return false;
        try {
            context.pages?.();
            return true;
        }
        catch {
            return false;
        }
    }
    isPageUsable(page) {
        if (!page)
            return false;
        if (typeof page.isClosed !== "function")
            return true;
        try {
            return !page.isClosed();
        }
        catch {
            return false;
        }
    }
    isRetryablePlaywrightSessionError(error) {
        const message = String(error?.message || error || "").toLowerCase();
        return (message.includes("target closed") ||
            message.includes("has been closed") ||
            message.includes("context closed") ||
            message.includes("browser has disconnected") ||
            message.includes("browser has been closed"));
    }
    async closePlaywrightSession() {
        const session = this.playwrightSession;
        this.playwrightSession = undefined;
        if (session) {
            try {
                await session.context.close();
            }
            catch (e) {
                this.logger.debug(`Failed to close Playwright context cleanly: ${e?.message || String(e)}`);
            }
        }
        const pendingSession = this.creatingPlaywrightSession;
        this.creatingPlaywrightSession = undefined;
        if (pendingSession) {
            try {
                const created = await pendingSession;
                if (created && created !== session) {
                    try {
                        await created.context.close();
                    }
                    catch (closeError) {
                        this.logger.debug(`Failed to close pending Playwright context: ${closeError?.message || String(closeError)}`);
                    }
                }
            }
            catch (pendingError) {
                this.logger.debug(`Pending Playwright session did not resolve cleanly: ${pendingError?.message || String(pendingError)}`);
            }
        }
    }
    isProfileSingletonLockError(error) {
        const message = String(error?.message || error || "").toLowerCase();
        return (message.includes("processsingleton") ||
            message.includes("singletonlock") ||
            message.includes("profile is already in use by another instance of chromium"));
    }
    async listLockedProfileChromePids(profileSelection) {
        try {
            const { stdout } = await execFileAsync("ps", ["-axo", "pid=,command="]);
            const userDataArg = `--user-data-dir=${profileSelection.userDataDir}`;
            const pids = new Set();
            for (const line of stdout.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                const match = trimmed.match(/^(\d+)\s+(.*)$/);
                if (!match)
                    continue;
                const pid = Number(match[1]);
                const command = match[2];
                if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid)
                    continue;
                if (!command.includes("Google Chrome.app/Contents/MacOS/Google Chrome"))
                    continue;
                if (!command.includes(userDataArg))
                    continue;
                pids.add(pid);
            }
            return Array.from(pids);
        }
        catch (e) {
            this.logger.debug(`Failed to inspect Chrome processes for lock recovery: ${e?.message || String(e)}`);
            return [];
        }
    }
    isProcessAlive(pid) {
        try {
            process.kill(pid, 0);
            return true;
        }
        catch {
            return false;
        }
    }
    async waitForProcessExit(pid, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (!this.isProcessAlive(pid))
                return true;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return !this.isProcessAlive(pid);
    }
    async terminateLockedProfileChromeProcesses(profileSelection) {
        const pids = await this.listLockedProfileChromePids(profileSelection);
        if (pids.length === 0)
            return 0;
        let terminated = 0;
        for (const pid of pids) {
            try {
                process.kill(pid, "SIGTERM");
            }
            catch (e) {
                this.logger.debug(`Failed SIGTERM for Chrome pid ${pid}: ${e?.message || String(e)}`);
                continue;
            }
            const exitedAfterTerm = await this.waitForProcessExit(pid, 1500);
            if (exitedAfterTerm) {
                terminated += 1;
                continue;
            }
            try {
                process.kill(pid, "SIGKILL");
            }
            catch (e) {
                this.logger.debug(`Failed SIGKILL for Chrome pid ${pid}: ${e?.message || String(e)}`);
                continue;
            }
            const exitedAfterKill = await this.waitForProcessExit(pid, 1000);
            if (exitedAfterKill) {
                terminated += 1;
            }
        }
        return terminated;
    }
    async launchPlaywrightPersistentContext(chromium, profileSelection) {
        return await chromium.launchPersistentContext(profileSelection.userDataDir, {
            channel: "chrome",
            headless: false,
            viewport: { width: 1366, height: 900 },
            args: [`--profile-directory=${profileSelection.profileDirectory}`],
        });
    }
    async createPlaywrightSession(key, profileSelection) {
        let playwright;
        try {
            playwright = await this.playwrightModuleLoader();
        }
        catch (e) {
            throw new Error(`Playwright is not installed. Install with: npm i playwright (macOS only for browser fallback). Details: ${e?.message || e}`);
        }
        const chromium = playwright?.chromium;
        if (!chromium?.launchPersistentContext) {
            throw new Error("Playwright chromium launcher is unavailable for browser fallback");
        }
        let context;
        try {
            context = await this.launchPlaywrightPersistentContext(chromium, profileSelection);
        }
        catch (e) {
            if (!this.isProfileSingletonLockError(e)) {
                throw e;
            }
            const terminated = await this.terminateLockedProfileChromeProcesses(profileSelection);
            if (terminated <= 0) {
                throw e;
            }
            this.logger.info(`Recovered locked Chrome profile '${profileSelection.profileDirectory}' by terminating ${terminated} process(es), retrying launch`);
            context = await this.launchPlaywrightPersistentContext(chromium, profileSelection);
        }
        return {
            key,
            context,
        };
    }
    async getOrCreatePlaywrightSession(profileSelection) {
        const key = this.buildPlaywrightSessionKey(profileSelection);
        if (this.playwrightSession?.key === key && this.isContextUsable(this.playwrightSession.context)) {
            return this.playwrightSession;
        }
        if (this.playwrightSession && this.playwrightSession.key !== key) {
            await this.closePlaywrightSession();
        }
        if (this.creatingPlaywrightSession) {
            try {
                const pending = await this.creatingPlaywrightSession;
                if (pending.key === key && this.isContextUsable(pending.context)) {
                    this.playwrightSession = pending;
                    return pending;
                }
            }
            catch (pendingError) {
                this.logger.debug(`Pending Playwright session reuse skipped: ${pendingError?.message || String(pendingError)}`);
            }
        }
        const creation = this.createPlaywrightSession(key, profileSelection);
        this.creatingPlaywrightSession = creation;
        try {
            const created = await creation;
            this.playwrightSession = created;
            return created;
        }
        finally {
            if (this.creatingPlaywrightSession === creation) {
                this.creatingPlaywrightSession = undefined;
            }
        }
    }
    async getOrCreatePlaywrightPage(session) {
        if (this.isPageUsable(session.page)) {
            return session.page;
        }
        const existingPages = session.context.pages?.() ?? [];
        const reusablePage = existingPages.find((candidate) => this.isPageUsable(candidate));
        if (reusablePage) {
            session.page = reusablePage;
            return reusablePage;
        }
        const newPage = await session.context.newPage();
        session.page = newPage;
        return newPage;
    }
    async requestViaPlaywrightPage(page, input) {
        const response = await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
        const content = await page.content();
        const status = response?.status() ?? 0;
        const headers = response?.headers?.() ?? {};
        const finalUrl = page.url();
        if (input.method.toUpperCase() !== "GET") {
            const payload = await page.evaluate(async (req) => {
                const fetchResp = await fetch(req.url, {
                    method: req.method,
                    headers: req.headers,
                    body: req.body,
                    credentials: "include",
                });
                const text = await fetchResp.text();
                const hdrs = {};
                fetchResp.headers.forEach((value, key) => {
                    hdrs[key] = value;
                });
                return {
                    status: fetchResp.status,
                    body: text,
                    headers: hdrs,
                    finalUrl: fetchResp.url,
                };
            }, {
                url: input.url,
                method: input.method,
                headers: input.headers || {},
                body: input.body,
            });
            return payload;
        }
        return {
            status,
            body: content,
            headers,
            finalUrl,
        };
    }
    isEnabled() {
        return Boolean(this.options.enabled);
    }
    async request(input) {
        const provider = this.options.provider ?? getDefaultBrowserFallbackProvider();
        if (provider === "openclaw_proxy") {
            return this.requestViaOpenClawRelay(input);
        }
        if (provider === "playwright") {
            return this.requestViaPlaywright(input);
        }
        throw new Error(`Browser fallback provider not implemented: ${provider}`);
    }
    getOpenClawRelayCdpUrl() {
        return this.options.openClawRelayCdpUrl || process.env.OPENCLAW_CHROME_RELAY_CDP_URL || "http://127.0.0.1:18792";
    }
    buildOpenClawRelayUnavailableMessage(cdpUrl, reason) {
        const detail = reason ? ` Details: ${reason}` : "";
        return [
            `OpenClaw Chrome relay is unavailable at ${cdpUrl}.${detail}`,
            "Please attach an OpenClaw Browser Relay tab in Chrome first (extension badge should show ON), then retry.",
            "You can verify relay status with: openclaw browser --browser-profile chrome tabs",
        ].join(" ");
    }
    async probeOpenClawRelay(cdpUrl) {
        const normalized = cdpUrl.replace(/\/+$/, "");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 5000));
        try {
            const response = await fetch(`${normalized}/json/list`, { signal: controller.signal });
            if (!response.ok) {
                return { reachable: false, hasAttachedTab: false, reason: `relay_http_${response.status}` };
            }
            const payload = (await response.json());
            if (!Array.isArray(payload)) {
                return { reachable: false, hasAttachedTab: false, reason: "invalid_relay_payload" };
            }
            const pageTargets = payload.filter((entry) => entry?.type === "page" || Boolean(entry?.webSocketDebuggerUrl));
            return { reachable: true, hasAttachedTab: pageTargets.length > 0 };
        }
        catch (e) {
            const reason = e?.name === "AbortError" ? "relay_probe_timeout" : e?.message || String(e);
            return { reachable: false, hasAttachedTab: false, reason };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async requestViaOpenClawRelay(input) {
        const cdpUrl = this.getOpenClawRelayCdpUrl();
        const probe = await this.probeOpenClawRelay(cdpUrl);
        if (!probe.reachable) {
            throw new BrowserFallbackRelayUnavailableError(this.buildOpenClawRelayUnavailableMessage(cdpUrl, probe.reason));
        }
        if (!probe.hasAttachedTab) {
            throw new BrowserFallbackRelayUnavailableError(this.buildOpenClawRelayUnavailableMessage(cdpUrl, "no_attached_tab_detected"));
        }
        let playwright;
        try {
            const dynamicImport = new Function("m", "return import(m)");
            playwright = await dynamicImport("playwright");
        }
        catch (e) {
            throw new Error(`Playwright is required for OpenClaw relay CDP mode. Install with: npm i playwright. Details: ${e?.message || e}`);
        }
        let browser;
        try {
            browser = await playwright.chromium.connectOverCDP(cdpUrl, {
                timeout: this.timeoutMs,
            });
        }
        catch (e) {
            throw new BrowserFallbackRelayUnavailableError(this.buildOpenClawRelayUnavailableMessage(cdpUrl, e?.message || String(e)));
        }
        try {
            const context = browser.contexts?.()[0];
            const page = context?.pages?.()[0];
            if (!context || !page) {
                throw new BrowserFallbackRelayUnavailableError(this.buildOpenClawRelayUnavailableMessage(cdpUrl, "no_attached_tab_detected"));
            }
            const response = await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
            const content = await page.content();
            const status = response?.status() ?? 0;
            const headers = response?.headers?.() ?? {};
            const finalUrl = page.url();
            if (input.method.toUpperCase() !== "GET") {
                const payload = await page.evaluate(async (req) => {
                    const fetchResp = await fetch(req.url, {
                        method: req.method,
                        headers: req.headers,
                        body: req.body,
                        credentials: "include",
                    });
                    const text = await fetchResp.text();
                    const hdrs = {};
                    fetchResp.headers.forEach((value, key) => {
                        hdrs[key] = value;
                    });
                    return {
                        status: fetchResp.status,
                        body: text,
                        headers: hdrs,
                        finalUrl: fetchResp.url,
                    };
                }, {
                    url: input.url,
                    method: input.method,
                    headers: input.headers || {},
                    body: input.body,
                });
                return payload;
            }
            return {
                status,
                body: content,
                headers,
                finalUrl,
            };
        }
        finally {
            await browser.close();
        }
    }
    async requestViaPlaywright(input) {
        const profileSelection = this.resolvePlaywrightProfileSelection();
        try {
            const session = await this.getOrCreatePlaywrightSession(profileSelection);
            const page = await this.getOrCreatePlaywrightPage(session);
            return await this.requestViaPlaywrightPage(page, input);
        }
        catch (e) {
            if (!this.isRetryablePlaywrightSessionError(e)) {
                throw e;
            }
            await this.closePlaywrightSession();
            const freshSession = await this.getOrCreatePlaywrightSession(profileSelection);
            const freshPage = await this.getOrCreatePlaywrightPage(freshSession);
            return await this.requestViaPlaywrightPage(freshPage, input);
        }
    }
    async maybePromptInteractiveLogin(siteUrl) {
        if (!this.options.interactiveLoginEnabled)
            return;
        if (process.platform !== "darwin") {
            throw new Error("interactive_login_not_supported_on_platform");
        }
        const profileSelection = this.resolvePlaywrightProfileSelection();
        const url = this.options.loginCheckUrl || siteUrl;
        await this.openChromeOnMac([
            "-na",
            "Google Chrome",
            "--args",
            `--user-data-dir=${profileSelection.userDataDir}`,
            `--profile-directory=${profileSelection.profileDirectory}`,
        ], `Failed to open Chrome profile '${profileSelection.profileDirectory}'`);
        await this.openUrlInFrontChromeTabOnMac(url);
        this.logger.info(`Interactive login required. Opened Chrome profile '${profileSelection.profileDirectory}' using ${profileSelection.source} user-data-dir at ${url}`);
        throw new Error(`Interactive login required: Chrome profile '${profileSelection.profileDirectory}' has been opened with ${profileSelection.source} user-data-dir. Please login to uscardforum in that window, then retry.`);
    }
}
_a = BrowserFallbackClient;
BrowserFallbackClient.defaultPlaywrightModuleLoader = async () => {
    const dynamicImport = new Function("m", "return import(m)");
    return dynamicImport("playwright");
};
//# sourceMappingURL=browser_fallback.js.map