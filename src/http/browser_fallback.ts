import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

const OPENCLAW_USER_DATA_DIR_CANDIDATE_SUFFIXES = [
  ["Library", "Application Support", "OpenClaw", "ChromeProfile"],
  ["Library", "Application Support", "OpenClaw", "Browser", "ChromeProfile"],
  ["Library", "Application Support", "OpenClaw", "Browser", "chrome"],
] as const;

const NITAN_CHROME_USER_DATA_DIR_SUFFIX = ["Library", "Application Support", "NitanMCP", "ChromeProfile"] as const;

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
  const profileDirectory = params.loginProfileName || "Default";
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
  return {
    userDataDir: nitanUserDataDir,
    profileDirectory,
    source: "nitan",
  };
}

export class BrowserFallbackClient {
  private readonly timeoutMs: number;

  constructor(private readonly logger: Logger, private readonly options: BrowserFallbackOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 45_000;
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
      const content = await page.content();
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
    let playwright: any;
    try {
      const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;
      playwright = await dynamicImport("playwright");
    } catch (e: any) {
      throw new Error(`Playwright is not installed. Install with: npm i playwright (macOS only for browser fallback). Details: ${e?.message || e}`);
    }

    const chromium = playwright.chromium;
    const profileSelection = this.resolvePlaywrightProfileSelection();
    const context = await chromium.launchPersistentContext(profileSelection.userDataDir, {
      channel: "chrome",
      headless: false,
      viewport: { width: 1366, height: 900 },
      args: [`--profile-directory=${profileSelection.profileDirectory}`],
    });

    try {
      const page = await context.newPage();
      const response = await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
      const content = await page.content();
      const status = response?.status() ?? 0;
      const headers = response?.headers?.() ?? {};
      const finalUrl = page.url();

      // If method is not GET, attempt in-page fetch using the browser session
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
      await context.close();
    }
  }

  async maybePromptInteractiveLogin(siteUrl: string): Promise<void> {
    if (!this.options.interactiveLoginEnabled) return;
    if (process.platform !== "darwin") {
      throw new Error("interactive_login_not_supported_on_platform");
    }

    const profileSelection = this.resolvePlaywrightProfileSelection();
    const url = this.options.loginCheckUrl || siteUrl;

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("open", [
        "-a",
        "Google Chrome",
        "--args",
        `--user-data-dir=${profileSelection.userDataDir}`,
        `--profile-directory=${profileSelection.profileDirectory}`,
        url,
      ]);
      proc.on("error", reject);
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to open Chrome profile '${profileSelection.profileDirectory}', exit code: ${code}`));
      });
    });

    this.logger.info(
      `Interactive login required. Opened Chrome profile '${profileSelection.profileDirectory}' using ${profileSelection.source} user-data-dir at ${url}`
    );
    throw new Error(
      `Interactive login required: Chrome profile '${profileSelection.profileDirectory}' has been opened with ${profileSelection.source} user-data-dir. Please login to uscardforum in that window, then retry.`
    );
  }
}
