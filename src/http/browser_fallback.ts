import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Logger } from "../util/logger.js";
import {
  getDefaultBrowserFallbackProvider,
  type BrowserFallbackProvider,
} from "./browser_fallback_defaults.js";

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

export class BrowserFallbackRelayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserFallbackRelayUnavailableError";
  }
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

interface PlaywrightSession {
  key: string;
  context: any;
  page?: any;
}

const OPENCLAW_USER_DATA_DIR_CANDIDATE_SUFFIXES = [
  ["Library", "Application Support", "OpenClaw", "ChromeProfile"],
  ["Library", "Application Support", "OpenClaw", "Browser", "ChromeProfile"],
  ["Library", "Application Support", "OpenClaw", "Browser", "chrome"],
] as const;

const NITAN_CHROME_USER_DATA_DIR_SUFFIX = ["Library", "Application Support", "NitanMCP", "ChromeProfile"] as const;
const execFileAsync = promisify(execFile);

function readJsonObject(filePath: string): Record<string, any> {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
  } catch {
  }
  return {};
}

function writeJsonObject(filePath: string, value: Record<string, any>): void {
  writeFileSync(filePath, JSON.stringify(value));
}

function ensureManagedProfileMetadata(userDataDir: string, profileDirectory: string): void {
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
  } catch {
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
  } catch {
  }
}

function getOpenClawUserDataDirCandidates(homeDir: string, openClawChromeProfileDirOverride?: string): string[] {
  const envOverride = openClawChromeProfileDirOverride?.trim();
  return [
    envOverride,
    ...OPENCLAW_USER_DATA_DIR_CANDIDATE_SUFFIXES.map((suffix) => join(homeDir, ...suffix)),
  ].filter((candidate): candidate is string => Boolean(candidate));
}

export function resolveMacPlaywrightProfileSelection(params: {
  homeDir: string;
  loginProfileName?: string;
  openClawChromeProfileDirOverride?: string;
}): BrowserProfileSelection {
  const profileDirectory = params.loginProfileName || "nitan";
  const openClawCandidates = getOpenClawUserDataDirCandidates(params.homeDir, params.openClawChromeProfileDirOverride);

  for (const candidate of openClawCandidates) {
    if (!existsSync(candidate)) continue;
    const selectedProfilePath = join(candidate, profileDirectory);
    if (!existsSync(selectedProfilePath)) continue;
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
  private readonly timeoutMs: number;
  private readonly playwrightModuleLoader: () => Promise<any>;
  private playwrightSession?: PlaywrightSession;
  private creatingPlaywrightSession?: Promise<PlaywrightSession>;

  constructor(private readonly logger: Logger, private readonly options: BrowserFallbackOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.playwrightModuleLoader = options.playwrightModuleLoader ?? BrowserFallbackClient.defaultPlaywrightModuleLoader;
  }

  private static defaultPlaywrightModuleLoader = async (): Promise<any> => {
    const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;
    return dynamicImport("playwright");
  };

  async dispose(): Promise<void> {
    await this.closePlaywrightSession();
  }

  private async openChromeOnMac(openArgs: string[], errorPrefix: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("open", openArgs);
      proc.on("error", reject);
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${errorPrefix}, exit code: ${code}`));
      });
    });
  }

  private escapeAppleScriptString(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  }

  private async runAppleScript(lines: string[]): Promise<string> {
    const args = lines.flatMap((line) => ["-e", line]);
    return await new Promise<string>((resolve, reject) => {
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

  private async openUrlInFrontChromeTabOnMac(url: string): Promise<void> {
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

    throw new Error(
      `Failed to open target login URL '${url}' in Chrome front tab. Last observed front tab URL: '${lastFrontUrl || "unknown"}'`
    );
  }

  private getMacHomeDir(): string {
    const home = process.env.HOME || homedir();
    if (!home) throw new Error("browser_fallback_home_directory_not_found");
    return home;
  }

  private resolvePlaywrightProfileSelection(): BrowserProfileSelection {
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

  private resolveEnvAutoLoginCredentials(): { username: string; password: string } | undefined {
    const username = process.env.NITAN_USERNAME?.trim();
    const password = process.env.NITAN_PASSWORD;
    if (!username || !password) return undefined;
    return { username, password };
  }

  private async submitLoginForm(page: any, loginUrl: string, username: string, password: string): Promise<void> {
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
    await page.waitForSelector(loginInputSelector, { timeout: Math.min(this.timeoutMs, 10_000) });
    await page.waitForSelector(passwordInputSelector, { timeout: Math.min(this.timeoutMs, 10_000) });

    await page.fill(loginInputSelector, username);
    await page.fill(passwordInputSelector, password);

    let submitted = false;
    for (const selector of submitSelectors) {
      const button = await page.$(selector);
      if (!button) continue;

      await Promise.allSettled([
        page.waitForLoadState("domcontentloaded", { timeout: Math.min(this.timeoutMs, 10_000) }),
        page.click(selector),
      ]);
      submitted = true;
      break;
    }

    if (!submitted) {
      await page.keyboard.press("Enter");
      await page.waitForLoadState("domcontentloaded", { timeout: Math.min(this.timeoutMs, 10_000) }).catch(() => undefined);
    }

    if (typeof page.waitForTimeout === "function") {
      await page.waitForTimeout(500);
    }
  }

  async maybeAutoLogin(siteUrl: string): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    const provider = this.options.provider ?? getDefaultBrowserFallbackProvider();
    if (provider !== "playwright") return false;

    const credentials = this.resolveEnvAutoLoginCredentials();
    if (!credentials) return false;

    try {
      const profileSelection = this.resolvePlaywrightProfileSelection();
      const session = await this.getOrCreatePlaywrightSession(profileSelection);
      const page = await this.getOrCreatePlaywrightPage(session);
      const loginUrl = this.options.loginCheckUrl || siteUrl;

      this.logger.info("Attempting browser auto-login with configured NITAN credentials");
      await this.submitLoginForm(page, loginUrl, credentials.username, credentials.password);
      return true;
    } catch (e: any) {
      this.logger.info(`Browser auto-login attempt did not complete: ${e?.message || String(e)}`);
      return true;
    }
  }

  private buildPlaywrightSessionKey(profileSelection: BrowserProfileSelection): string {
    return `${profileSelection.userDataDir}::${profileSelection.profileDirectory}`;
  }

  private isContextUsable(context: any): boolean {
    if (!context) return false;
    try {
      context.pages?.();
      return true;
    } catch {
      return false;
    }
  }

  private isPageUsable(page: any): boolean {
    if (!page) return false;
    if (typeof page.isClosed !== "function") return true;
    try {
      return !page.isClosed();
    } catch {
      return false;
    }
  }

  private isRetryablePlaywrightSessionError(error: unknown): boolean {
    const message = String((error as any)?.message || error || "").toLowerCase();
    return (
      message.includes("target closed") ||
      message.includes("has been closed") ||
      message.includes("context closed") ||
      message.includes("browser has disconnected") ||
      message.includes("browser has been closed")
    );
  }

  private async closePlaywrightSession(): Promise<void> {
    const session = this.playwrightSession;
    this.playwrightSession = undefined;

    if (session) {
      try {
        await session.context.close();
      } catch (e: any) {
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
          } catch (closeError: any) {
            this.logger.debug(`Failed to close pending Playwright context: ${closeError?.message || String(closeError)}`);
          }
        }
      } catch (pendingError: any) {
        this.logger.debug(`Pending Playwright session did not resolve cleanly: ${pendingError?.message || String(pendingError)}`);
      }
    }
  }

  private isProfileSingletonLockError(error: unknown): boolean {
    const message = String((error as any)?.message || error || "").toLowerCase();
    return (
      message.includes("processsingleton") ||
      message.includes("singletonlock") ||
      message.includes("profile is already in use by another instance of chromium")
    );
  }

  private async listLockedProfileChromePids(profileSelection: BrowserProfileSelection): Promise<number[]> {
    try {
      const { stdout } = await execFileAsync("ps", ["-axo", "pid=,command="]); 
      const userDataArg = `--user-data-dir=${profileSelection.userDataDir}`;
      const pids = new Set<number>();

      for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const match = trimmed.match(/^(\d+)\s+(.*)$/);
        if (!match) continue;

        const pid = Number(match[1]);
        const command = match[2];
        if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) continue;
        if (!command.includes("Google Chrome.app/Contents/MacOS/Google Chrome")) continue;
        if (!command.includes(userDataArg)) continue;
        pids.add(pid);
      }

      return Array.from(pids);
    } catch (e: any) {
      this.logger.debug(`Failed to inspect Chrome processes for lock recovery: ${e?.message || String(e)}`);
      return [];
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.isProcessAlive(pid)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return !this.isProcessAlive(pid);
  }

  private async terminateLockedProfileChromeProcesses(profileSelection: BrowserProfileSelection): Promise<number> {
    const pids = await this.listLockedProfileChromePids(profileSelection);
    if (pids.length === 0) return 0;

    let terminated = 0;
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch (e: any) {
        this.logger.debug(`Failed SIGTERM for Chrome pid ${pid}: ${e?.message || String(e)}`);
        continue;
      }

      const exitedAfterTerm = await this.waitForProcessExit(pid, 1_500);
      if (exitedAfterTerm) {
        terminated += 1;
        continue;
      }

      try {
        process.kill(pid, "SIGKILL");
      } catch (e: any) {
        this.logger.debug(`Failed SIGKILL for Chrome pid ${pid}: ${e?.message || String(e)}`);
        continue;
      }

      const exitedAfterKill = await this.waitForProcessExit(pid, 1_000);
      if (exitedAfterKill) {
        terminated += 1;
      }
    }

    return terminated;
  }

  private async launchPlaywrightPersistentContext(chromium: any, profileSelection: BrowserProfileSelection): Promise<any> {
    return await chromium.launchPersistentContext(profileSelection.userDataDir, {
      channel: "chrome",
      headless: false,
      viewport: { width: 1366, height: 900 },
      args: [`--profile-directory=${profileSelection.profileDirectory}`],
    });
  }

  private async createPlaywrightSession(
    key: string,
    profileSelection: BrowserProfileSelection
  ): Promise<PlaywrightSession> {
    let playwright: any;
    try {
      playwright = await this.playwrightModuleLoader();
    } catch (e: any) {
      throw new Error(
        `Playwright is not installed. Install with: npm i playwright (macOS only for browser fallback). Details: ${e?.message || e}`
      );
    }

    const chromium = playwright?.chromium;
    if (!chromium?.launchPersistentContext) {
      throw new Error("Playwright chromium launcher is unavailable for browser fallback");
    }

    let context: any;
    try {
      context = await this.launchPlaywrightPersistentContext(chromium, profileSelection);
    } catch (e: any) {
      if (!this.isProfileSingletonLockError(e)) {
        throw e;
      }

      const terminated = await this.terminateLockedProfileChromeProcesses(profileSelection);
      if (terminated <= 0) {
        throw e;
      }

      this.logger.info(
        `Recovered locked Chrome profile '${profileSelection.profileDirectory}' by terminating ${terminated} process(es), retrying launch`
      );
      context = await this.launchPlaywrightPersistentContext(chromium, profileSelection);
    }

    return {
      key,
      context,
    };
  }

  private async getOrCreatePlaywrightSession(profileSelection: BrowserProfileSelection): Promise<PlaywrightSession> {
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
      } catch (pendingError: any) {
        this.logger.debug(`Pending Playwright session reuse skipped: ${pendingError?.message || String(pendingError)}`);
      }
    }

    const creation = this.createPlaywrightSession(key, profileSelection);
    this.creatingPlaywrightSession = creation;
    try {
      const created = await creation;
      this.playwrightSession = created;
      return created;
    } finally {
      if (this.creatingPlaywrightSession === creation) {
        this.creatingPlaywrightSession = undefined;
      }
    }
  }

  private async getOrCreatePlaywrightPage(session: PlaywrightSession): Promise<any> {
    if (this.isPageUsable(session.page)) {
      return session.page;
    }

    const existingPages = session.context.pages?.() ?? [];
    const reusablePage = existingPages.find((candidate: any) => this.isPageUsable(candidate));
    if (reusablePage) {
      session.page = reusablePage;
      return reusablePage;
    }

    const newPage = await session.context.newPage();
    session.page = newPage;
    return newPage;
  }

  private async readPlaywrightGetBody(response: any, page: any): Promise<string> {
    if (response && typeof response.text === "function") {
      try {
        return await response.text();
      } catch {
      }
    }

    return await page.content();
  }

  private isChallengeLikeResponse(response: BrowserResponse): boolean {
    const body = (response.body || "").toLowerCase();
    const bodyHit =
      body.includes("just a moment") ||
      body.includes("attention required") ||
      body.includes("/cdn-cgi/challenge-platform/") ||
      body.includes("cf-challenge");
    const statusHit = response.status === 403 || response.status === 429 || response.status === 503;
    return Boolean((statusHit && bodyHit) || bodyHit);
  }

  private shouldRetryWithClearedManagedCookies(
    profileSelection: BrowserProfileSelection,
    input: BrowserRequest,
    response: BrowserResponse
  ): boolean {
    return (
      input.method.toUpperCase() === "GET" &&
      profileSelection.source === "nitan" &&
      !this.options.loginProfileName &&
      this.isChallengeLikeResponse(response)
    );
  }

  private async requestViaPlaywrightPage(page: any, input: BrowserRequest): Promise<BrowserResponse> {
    const response = await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
    const content = await this.readPlaywrightGetBody(response, page);
    const status = response?.status() ?? 0;
    const headers = response?.headers?.() ?? {};
    const finalUrl = page.url();

    if (input.method.toUpperCase() !== "GET") {
      const payload = await page.evaluate(async (req: any) => {
        const fetchResp = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body,
          credentials: "include",
        });
        const text = await fetchResp.text();
        const hdrs: Record<string, string> = {};
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

  isEnabled(): boolean {
    return Boolean(this.options.enabled);
  }

  async request(input: BrowserRequest): Promise<BrowserResponse> {
    const provider = this.options.provider ?? getDefaultBrowserFallbackProvider();
    if (provider === "openclaw_proxy") {
      return this.requestViaOpenClawRelay(input);
    }
    if (provider === "playwright") {
      return this.requestViaPlaywright(input);
    }
    throw new Error(`Browser fallback provider not implemented: ${provider}`);
  }

  private getOpenClawRelayCdpUrl(): string {
    return this.options.openClawRelayCdpUrl || process.env.OPENCLAW_CHROME_RELAY_CDP_URL || "http://127.0.0.1:18792";
  }

  private buildOpenClawRelayUnavailableMessage(cdpUrl: string, reason?: string): string {
    const detail = reason ? ` Details: ${reason}` : "";
    return [
      `OpenClaw Chrome relay is unavailable at ${cdpUrl}.${detail}`,
      "Please attach an OpenClaw Browser Relay tab in Chrome first (extension badge should show ON), then retry.",
      "You can verify relay status with: openclaw browser --browser-profile chrome tabs",
    ].join(" ");
  }

  private async probeOpenClawRelay(cdpUrl: string): Promise<{ reachable: boolean; hasAttachedTab: boolean; reason?: string }> {
    const normalized = cdpUrl.replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 5000));

    try {
      const response = await fetch(`${normalized}/json/list`, { signal: controller.signal });
      if (!response.ok) {
        return { reachable: false, hasAttachedTab: false, reason: `relay_http_${response.status}` };
      }

      const payload = (await response.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string }> | unknown;
      if (!Array.isArray(payload)) {
        return { reachable: false, hasAttachedTab: false, reason: "invalid_relay_payload" };
      }

      const pageTargets = payload.filter((entry) => entry?.type === "page" || Boolean(entry?.webSocketDebuggerUrl));
      return { reachable: true, hasAttachedTab: pageTargets.length > 0 };
    } catch (e: any) {
      const reason = e?.name === "AbortError" ? "relay_probe_timeout" : e?.message || String(e);
      return { reachable: false, hasAttachedTab: false, reason };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestViaOpenClawRelay(input: BrowserRequest): Promise<BrowserResponse> {
    const cdpUrl = this.getOpenClawRelayCdpUrl();
    const probe = await this.probeOpenClawRelay(cdpUrl);
    if (!probe.reachable) {
      throw new BrowserFallbackRelayUnavailableError(this.buildOpenClawRelayUnavailableMessage(cdpUrl, probe.reason));
    }
    if (!probe.hasAttachedTab) {
      throw new BrowserFallbackRelayUnavailableError(
        this.buildOpenClawRelayUnavailableMessage(cdpUrl, "no_attached_tab_detected")
      );
    }

    let playwright: any;
    try {
      const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;
      playwright = await dynamicImport("playwright");
    } catch (e: any) {
      throw new Error(`Playwright is required for OpenClaw relay CDP mode. Install with: npm i playwright. Details: ${e?.message || e}`);
    }

    let browser: any;
    try {
      browser = await playwright.chromium.connectOverCDP(cdpUrl, {
        timeout: this.timeoutMs,
      });
    } catch (e: any) {
      throw new BrowserFallbackRelayUnavailableError(
        this.buildOpenClawRelayUnavailableMessage(cdpUrl, e?.message || String(e))
      );
    }

    try {
      const context = browser.contexts?.()[0];
      const page = context?.pages?.()[0];
      if (!context || !page) {
        throw new BrowserFallbackRelayUnavailableError(
          this.buildOpenClawRelayUnavailableMessage(cdpUrl, "no_attached_tab_detected")
        );
      }

      const response = await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
      const content = await this.readPlaywrightGetBody(response, page);
      const status = response?.status() ?? 0;
      const headers = response?.headers?.() ?? {};
      const finalUrl = page.url();

      if (input.method.toUpperCase() !== "GET") {
        const payload = await page.evaluate(async (req: any) => {
          const fetchResp = await fetch(req.url, {
            method: req.method,
            headers: req.headers,
            body: req.body,
            credentials: "include",
          });
          const text = await fetchResp.text();
          const hdrs: Record<string, string> = {};
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
    } finally {
      await browser.close();
    }
  }

  private async requestViaPlaywright(input: BrowserRequest): Promise<BrowserResponse> {
    const profileSelection = this.resolvePlaywrightProfileSelection();
    try {
      const session = await this.getOrCreatePlaywrightSession(profileSelection);
      const page = await this.getOrCreatePlaywrightPage(session);
      let response = await this.requestViaPlaywrightPage(page, input);
      if (
        this.shouldRetryWithClearedManagedCookies(profileSelection, input, response) &&
        typeof session.context.clearCookies === "function"
      ) {
        await session.context.clearCookies();
        response = await this.requestViaPlaywrightPage(page, input);
      }
      return response;
    } catch (e: any) {
      if (!this.isRetryablePlaywrightSessionError(e)) {
        throw e;
      }

      await this.closePlaywrightSession();
      const freshSession = await this.getOrCreatePlaywrightSession(profileSelection);
      const freshPage = await this.getOrCreatePlaywrightPage(freshSession);
      let response = await this.requestViaPlaywrightPage(freshPage, input);
      if (
        this.shouldRetryWithClearedManagedCookies(profileSelection, input, response) &&
        typeof freshSession.context.clearCookies === "function"
      ) {
        await freshSession.context.clearCookies();
        response = await this.requestViaPlaywrightPage(freshPage, input);
      }
      return response;
    }
  }

  async maybePromptInteractiveLogin(siteUrl: string): Promise<void> {
    if (!this.options.interactiveLoginEnabled) return;
    if (process.platform !== "darwin") {
      throw new Error("interactive_login_not_supported_on_platform");
    }

    const profileSelection = this.resolvePlaywrightProfileSelection();
    const url = this.options.loginCheckUrl || siteUrl;

    await this.openChromeOnMac(
      [
        "-na",
        "Google Chrome",
        "--args",
        `--user-data-dir=${profileSelection.userDataDir}`,
        `--profile-directory=${profileSelection.profileDirectory}`,
      ],
      `Failed to open Chrome profile '${profileSelection.profileDirectory}'`
    );

    await this.openUrlInFrontChromeTabOnMac(url);

    this.logger.info(
      `Interactive login required. Opened Chrome profile '${profileSelection.profileDirectory}' using ${profileSelection.source} user-data-dir at ${url}`
    );
    throw new Error(
      `Interactive login required: Chrome profile '${profileSelection.profileDirectory}' has been opened with ${profileSelection.source} user-data-dir. Please login to uscardforum in that window, then retry.`
    );
  }
}
