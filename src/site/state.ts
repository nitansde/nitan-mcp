import type { Logger } from "../util/logger.js";
import { HttpClient, type AuthMode, type BypassMethod } from "../http/client.js";
import type { BrowserFallbackOptions } from "../http/browser_fallback.js";

export type AuthOverride = {
  site: string; // base URL or origin to match
  api_key?: string;
  api_username?: string;
  user_api_key?: string;
  user_api_client_id?: string;
  username?: string; // Username for login (used with cloudscraper)
  password?: string; // Password for login (used with cloudscraper)
  second_factor_token?: string; // 2FA token (used with cloudscraper)
};

function normalizeBase(url: string): string {
  const u = new URL(url);
  u.pathname = "/";
  u.search = "";
  u.hash = "";
  return u.toString().replace(/\/$/, "");
}

export class SiteState {
  private currentSiteBase?: string;
  private currentClient?: HttpClient;
  private readonly clientCache = new Map<string, HttpClient>();

  constructor(
    private opts: {
      logger: Logger;
      timeoutMs: number;
      defaultAuth: AuthMode;
      authOverrides?: AuthOverride[];
      bypassMethod?: BypassMethod;
      useCloudscraper?: boolean; // Deprecated, use bypassMethod instead
      pythonPath?: string;
      browserFallback?: BrowserFallbackOptions;
    }
  ) {}

  getSiteBase(): string | undefined {
    return this.currentSiteBase;
  }

  ensureSelectedSite(): { base: string; client: HttpClient } {
    if (!this.currentSiteBase || !this.currentClient) {
      throw new Error("No site selected. Call discourse_select_site first.");
    }
    return { base: this.currentSiteBase, client: this.currentClient };
  }

  buildClientForSite(siteUrl: string): { base: string; client: HttpClient } {
    const base = normalizeBase(siteUrl);
    const cached = this.clientCache.get(base);
    if (cached) return { base, client: cached };

    const auth = this.resolveAuthForSite(base);
    const loginCreds = this.resolveLoginForSite(base);
    
    // Determine bypass method (support legacy useCloudscraper option)
    let bypassMethod: BypassMethod | undefined = this.opts.bypassMethod;
    if (bypassMethod === undefined && this.opts.useCloudscraper !== undefined) {
      // Legacy support: useCloudscraper=true => "both" for better reliability
      bypassMethod = this.opts.useCloudscraper ? "both" : undefined;
    }
    
    const client = new HttpClient({
      baseUrl: base,
      timeoutMs: this.opts.timeoutMs,
      logger: this.opts.logger,
      auth,
      bypassMethod,
      pythonPath: this.opts.pythonPath,
      loginCredentials: loginCreds,
      browserFallback: this.opts.browserFallback,
    } as any);
    this.clientCache.set(base, client);
    return { base, client };
  }

  selectSite(siteUrl: string): { base: string; client: HttpClient } {
    const { base, client } = this.buildClientForSite(siteUrl);
    this.currentSiteBase = base;
    this.currentClient = client;
    return { base, client };
  }

  // 热更新 auth — 替换或追加指定 site 的认证信息，并清除缓存的 client
  updateAuthOverride(override: AuthOverride): void {
    if (!this.opts.authOverrides) this.opts.authOverrides = [];
    const base = normalizeBase(override.site);
    const idx = this.opts.authOverrides.findIndex(
      (o) => normalizeBase(o.site) === base || this.sameOrigin(o.site, base)
    );
    if (idx >= 0) {
      this.opts.authOverrides[idx] = override;
    } else {
      this.opts.authOverrides.push(override);
    }
    // 清除该 site 的缓存 client，下次 buildClientForSite 会用新 auth 重建
    const cached = this.clientCache.get(base);
    if (cached) {
      cached.dispose().catch(() => {});
      this.clientCache.delete(base);
    }
    // 如果当前选中的就是这个 site，也清掉让它重建
    if (this.currentSiteBase === base) {
      this.currentSiteBase = undefined;
      this.currentClient = undefined;
    }
  }

  // 移除指定 site 的认证信息并清除缓存
  removeAuthOverride(siteUrl: string): void {
    if (!this.opts.authOverrides) return;
    const base = normalizeBase(siteUrl);
    this.opts.authOverrides = this.opts.authOverrides.filter(
      (o) => normalizeBase(o.site) !== base && !this.sameOrigin(o.site, base)
    );
    const cached = this.clientCache.get(base);
    if (cached) {
      cached.dispose().catch(() => {});
      this.clientCache.delete(base);
    }
    if (this.currentSiteBase === base) {
      this.currentSiteBase = undefined;
      this.currentClient = undefined;
    }
  }

  async dispose(): Promise<void> {
    const clients = Array.from(new Set(this.clientCache.values()));
    await Promise.allSettled(clients.map((client) => client.dispose()));
  }

  private resolveAuthForSite(base: string): AuthMode {
    const overrides = this.opts.authOverrides || [];
    const match = overrides.find((o) => normalizeBase(o.site) === base || this.sameOrigin(o.site, base));
    if (match) {
      // Prefer user_api_key if provided
      if (match.user_api_key) return { type: "user_api_key", key: match.user_api_key, client_id: match.user_api_client_id };
      if (match.api_key) return { type: "api_key", key: match.api_key, username: match.api_username };
    }
    return this.opts.defaultAuth;
  }

  private resolveLoginForSite(base: string): { username: string; password: string; second_factor_token?: string } | undefined {
    const overrides = this.opts.authOverrides || [];
    const match = overrides.find((o) => normalizeBase(o.site) === base || this.sameOrigin(o.site, base));
    if (match?.username && match?.password) {
      return {
        username: match.username,
        password: match.password,
        second_factor_token: match.second_factor_token,
      };
    }
    return undefined;
  }

  private sameOrigin(a: string, b: string): boolean {
    try {
      const ua = new URL(a);
      const ub = new URL(b);
      return ua.protocol === ub.protocol && ua.host === ub.host;
    } catch {
      return false;
    }
  }
}

export type SiteStateInit = ConstructorParameters<typeof SiteState>[0];
