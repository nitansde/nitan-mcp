import { HttpClient } from "../http/client.js";
function normalizeBase(url) {
    const u = new URL(url);
    u.pathname = "/";
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
}
export class SiteState {
    constructor(opts) {
        this.opts = opts;
        this.clientCache = new Map();
    }
    getSiteBase() {
        return this.currentSiteBase;
    }
    ensureSelectedSite() {
        if (!this.currentSiteBase || !this.currentClient) {
            throw new Error("No site selected. Call discourse_select_site first.");
        }
        return { base: this.currentSiteBase, client: this.currentClient };
    }
    buildClientForSite(siteUrl) {
        const base = normalizeBase(siteUrl);
        const cached = this.clientCache.get(base);
        if (cached)
            return { base, client: cached };
        const auth = this.resolveAuthForSite(base);
        const loginCreds = this.resolveLoginForSite(base);
        // Determine bypass method (support legacy useCloudscraper option)
        let bypassMethod = this.opts.bypassMethod;
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
        });
        this.clientCache.set(base, client);
        return { base, client };
    }
    selectSite(siteUrl) {
        const { base, client } = this.buildClientForSite(siteUrl);
        this.currentSiteBase = base;
        this.currentClient = client;
        return { base, client };
    }
    async dispose() {
        const clients = Array.from(new Set(this.clientCache.values()));
        await Promise.allSettled(clients.map((client) => client.dispose()));
    }
    resolveAuthForSite(base) {
        const overrides = this.opts.authOverrides || [];
        const match = overrides.find((o) => normalizeBase(o.site) === base || this.sameOrigin(o.site, base));
        if (match) {
            // Prefer user_api_key if provided
            if (match.user_api_key)
                return { type: "user_api_key", key: match.user_api_key, client_id: match.user_api_client_id };
            if (match.api_key)
                return { type: "api_key", key: match.api_key, username: match.api_username };
        }
        return this.opts.defaultAuth;
    }
    resolveLoginForSite(base) {
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
    sameOrigin(a, b) {
        try {
            const ua = new URL(a);
            const ub = new URL(b);
            return ua.protocol === ub.protocol && ua.host === ub.host;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=state.js.map