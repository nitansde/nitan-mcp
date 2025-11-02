import { Logger } from "../util/logger.js";
import { CloudscraperClient } from "./cloudscraper.js";
import { CurlCffiClient } from "./curl_cffi.js";

export type AuthMode =
  | { type: "none" }
  | { type: "api_key"; key: string; username?: string }
  | { type: "user_api_key"; key: string; client_id?: string };

export type BypassMethod = "cloudscraper" | "curl_cffi" | "both";

export interface HttpClientOptions {
  baseUrl: string;
  timeoutMs: number;
  logger: Logger;
  auth: AuthMode;
  useCloudscraper?: boolean; // Use Python cloudscraper to bypass Cloudflare (deprecated, use bypassMethod)
  bypassMethod?: BypassMethod; // Which bypass method to use: "cloudscraper", "curl_cffi", or "both" (fallback)
  pythonPath?: string; // Path to Python executable (default: "python3")
  loginCredentials?: {
    username: string;
    password: string;
    second_factor_token?: string;
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "HttpError";
  }
}

export class HttpClient {
  private base: URL;
  // Mimics Microsoft Edge browser on Windows to avoid bot detection
  private userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
  private cache = new Map<string, { value: any; expiresAt: number }>();
  private cookies = new Map<string, string>(); // Store cookies across requests
  private lastUrl: string | null = null; // Track last URL for Referer header
  private cloudscraperClient?: CloudscraperClient;
  private curlCffiClient?: CurlCffiClient;
  private bypassMethod: BypassMethod;
  private cloudscraperFailed = false; // Track if cloudscraper has failed

  constructor(private opts: HttpClientOptions) {
    this.base = new URL(opts.baseUrl);
    
    // Determine bypass method (support legacy useCloudscraper option)
    if (opts.bypassMethod) {
      this.bypassMethod = opts.bypassMethod;
    } else if (opts.useCloudscraper) {
      // Legacy: if useCloudscraper is true, default to "both" for better reliability
      this.bypassMethod = "both";
    } else {
      this.bypassMethod = "both"; // Default to both with fallback
    }
    
    // Initialize bypass clients based on method
    if (this.bypassMethod === "cloudscraper" || this.bypassMethod === "both") {
      this.cloudscraperClient = new CloudscraperClient(opts.logger, opts.pythonPath);
      this.opts.logger.info("Cloudscraper initialized for Cloudflare bypass");
    }
    if (this.bypassMethod === "curl_cffi" || this.bypassMethod === "both") {
      this.curlCffiClient = new CurlCffiClient(opts.logger, opts.pythonPath);
      this.opts.logger.info("curl_cffi initialized for Cloudflare bypass");
    }
    
    // Log the active bypass strategy
    if (this.bypassMethod === "both") {
      this.opts.logger.info("Using dual bypass strategy: cloudscraper with curl_cffi fallback");
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Dnt": "1",
      "Pragma": "no-cache",
      "Priority": "u=1, i",
      "Sec-Ch-Ua": '"Microsoft Edge";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": this.userAgent,
      "X-Requested-With": "XMLHttpRequest",
    };
    
    // Add Referer header for subsequent requests
    if (this.lastUrl) {
      h["Referer"] = "https://www.uscardforum.com/";
    }
    
    // Add cookies if we have any
    if (this.cookies.size > 0) {
      h["Cookie"] = Array.from(this.cookies.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
      this.opts.logger.debug(`Using ${this.cookies.size} cookies in request`);
    }
    
    if (this.opts.auth.type === "api_key") {
      h["Api-Key"] = this.opts.auth.key;
      if (this.opts.auth.username) h["Api-Username"] = this.opts.auth.username;
    } else if (this.opts.auth.type === "user_api_key") {
      h["User-Api-Key"] = this.opts.auth.key;
      if (this.opts.auth.client_id) h["User-Api-Client-Id"] = this.opts.auth.client_id;
    }
    return h;
  }

  private parseCookies(setCookieHeader: string) {
    // Parse Set-Cookie header and store cookies
    // Handle multiple Set-Cookie headers (split by comma, but be careful with expires dates)
    const cookies = setCookieHeader.split(/,(?=[^ ])/);
    for (const cookie of cookies) {
      const parts = cookie.split(";")[0].trim(); // Get only the name=value part
      const [name, ...valueParts] = parts.split("=");
      if (name && valueParts.length > 0) {
        const value = valueParts.join("=");
        this.cookies.set(name.trim(), value.trim());
        this.opts.logger.debug(`Stored cookie: ${name.trim()}`);
      }
    }
  }

  async get(path: string, { signal }: { signal?: AbortSignal } = {}) {
    return this.request("GET", path, undefined, { signal });
  }

  async getCached(path: string, ttlMs: number, { signal }: { signal?: AbortSignal } = {}) {
    const url = new URL(path, this.base).toString();
    const entry = this.cache.get(url);
    const now = Date.now();
    if (entry && entry.expiresAt > now) return entry.value;
    const value = await this.request("GET", path, undefined, { signal });
    this.cache.set(url, { value, expiresAt: now + ttlMs });
    return value;
  }

  async post(path: string, body: unknown, { signal }: { signal?: AbortSignal } = {}) {
    return this.request("POST", path, body, { signal });
  }

  private async request(method: string, path: string, body?: unknown, { signal }: { signal?: AbortSignal } = {}) {
    const url = new URL(path, this.base).toString();
    const headers = this.headers();
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    this.opts.logger.debug(`HTTP ${method} ${url}`);
    
    // Log request headers for debugging
    this.opts.logger.debug(`Request headers: ${JSON.stringify(headers, null, 2)}`);
    
    // Log request body if present
    if (body !== undefined) {
      this.opts.logger.debug(`Request body: ${JSON.stringify(body, null, 2)}`);
    }

    // Use bypass method if configured
    if (this.cloudscraperClient || this.curlCffiClient) {
      return this.requestViaBypass(method, url, headers, body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    const combinedSignal = mergeSignals([signal, controller.signal]);

    const attempt = async () => {
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: combinedSignal,
        });

        this.opts.logger.debug(`HTTP ${method} ${url} -> ${res.status} ${res.statusText}`);
        
        // Log response headers for debugging
        const responseHeaders: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
        this.opts.logger.debug(`Response headers: ${JSON.stringify(responseHeaders, null, 2)}`);
        
        // Store cookies from response
        const setCookie = res.headers.get("set-cookie");
        if (setCookie) {
          this.parseCookies(setCookie);
          this.opts.logger.debug(`Received Set-Cookie header: ${setCookie}`);
        }
        
        // Update last URL for Referer header
        this.lastUrl = url;

        if (!res.ok) {
          const text = await safeText(res);
          const errorBody = safeJson(text);
          this.opts.logger.error(`HTTP ${res.status} ${res.statusText} for ${method} ${url}: ${text}`);
          throw new HttpError(res.status, `HTTP ${res.status} ${res.statusText}`, errorBody);
        }
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          return res.json();
        } else {
          return res.text();
        }
      } catch (e: any) {
        // Enhanced error logging for fetch failures
        if (e instanceof HttpError) {
          throw e; // Already logged above
        }

        // Check for common fetch failure reasons
        if (e.name === "AbortError") {
          const timeoutMsg = `Request timeout after ${this.opts.timeoutMs}ms for ${method} ${url}`;
          this.opts.logger.error(timeoutMsg);
          throw new Error(timeoutMsg);
        }

        if (e.name === "TypeError" && e.message === "fetch failed") {
          const detailedMsg = `Network error for ${method} ${url}: ${e.message}. Possible causes: DNS resolution failure, network connectivity issue, SSL/TLS error, or server unreachable.`;
          this.opts.logger.error(detailedMsg);
          if (e.cause) {
            this.opts.logger.error(`Underlying cause: ${String(e.cause)}`);
          }
          throw new Error(detailedMsg);
        }

        // Generic network error
        const genericMsg = `Fetch error for ${method} ${url}: ${e.name}: ${e.message}`;
        this.opts.logger.error(genericMsg);
        if (e.cause) {
          this.opts.logger.error(`Cause: ${String(e.cause)}`);
        }
        if (e.stack) {
          this.opts.logger.debug(`Stack: ${e.stack}`);
        }
        throw new Error(`${e.name}: ${e.message}`);
      }
    };

    try {
      return await withRetries(attempt, this.opts.logger, url, method);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestViaBypass(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<any> {
    // Convert cookies Map to object
    const cookiesObj: Record<string, string> = {};
    this.cookies.forEach((value, key) => {
      cookiesObj[key] = value;
    });

    // Log cookies being sent
    this.opts.logger.debug(`Sending ${Object.keys(cookiesObj).length} cookies to bypass: ${Object.keys(cookiesObj).join(", ")}`);

    const requestData: any = {
      url,
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cookies: cookiesObj,
      timeout: Math.floor(this.opts.timeoutMs / 1000), // Convert to seconds
    };

    // Add login credentials if provided
    if (this.opts.loginCredentials) {
      requestData.login = this.opts.loginCredentials;
      this.opts.logger.debug(`Including login credentials for ${this.opts.loginCredentials.username}`);
    }

    // Strategy: Try cloudscraper first (if available), fallback to curl_cffi
    let lastError: Error | null = null;
    
    // Try cloudscraper if available and not previously failed (or if it's the only option)
    if (this.cloudscraperClient && (this.bypassMethod === "cloudscraper" || !this.cloudscraperFailed)) {
      try {
        this.opts.logger.debug(`Using cloudscraper for ${method} ${url}`);
        const result = await this.cloudscraperClient.request(requestData);

        if (!result.success) {
          throw new Error(`Cloudscraper error: ${result.error} (${result.error_type})`);
        }

        this.opts.logger.debug(`Cloudscraper ${method} ${url} -> ${result.status}`);

        // Store cookies from response
        if (result.cookies) {
          Object.entries(result.cookies).forEach(([key, value]) => {
            this.cookies.set(key, value);
            this.opts.logger.debug(`Stored cookie from cloudscraper: ${key}`);
          });
        }

        // Update last URL for Referer header
        this.lastUrl = url;

        // Check for HTTP errors
        if (result.status && result.status >= 400) {
          const errorBody = safeJson(result.body || "");
          this.opts.logger.error(`HTTP ${result.status} for ${method} ${url}: ${result.body}`);
          throw new HttpError(result.status, `HTTP ${result.status}`, errorBody);
        }

        // Parse response body
        const contentType = result.headers?.["content-type"] || result.headers?.["Content-Type"] || "";
        if (contentType.includes("application/json")) {
          return JSON.parse(result.body || "{}");
        } else {
          return result.body;
        }
      } catch (e: any) {
        if (e instanceof HttpError) {
          throw e; // Don't fallback on HTTP errors (4xx, 5xx)
        }
        
        lastError = e;
        this.opts.logger.info(`Cloudscraper failed: ${e.message}`);
        
        // Mark cloudscraper as failed if we're in dual mode
        if (this.bypassMethod === "both") {
          this.cloudscraperFailed = true;
          this.opts.logger.info("Marking cloudscraper as failed, will use curl_cffi for future requests");
        }
        
        // If we're in cloudscraper-only mode, throw the error
        if (this.bypassMethod === "cloudscraper") {
          const errorMsg = `Cloudscraper request failed: ${e.message}`;
          this.opts.logger.error(errorMsg);
          throw new Error(errorMsg);
        }
        
        // Otherwise fall through to try curl_cffi
        this.opts.logger.info("Falling back to curl_cffi...");
      }
    }
    
    // Try curl_cffi if available
    if (this.curlCffiClient) {
      try {
        this.opts.logger.debug(`Using curl_cffi for ${method} ${url}`);
        const result = await this.curlCffiClient.request(requestData);

        if (!result.success) {
          throw new Error(`curl_cffi error: ${result.error} (${result.error_type})`);
        }

        this.opts.logger.debug(`curl_cffi ${method} ${url} -> ${result.status}`);

        // Store cookies from response
        if (result.cookies) {
          Object.entries(result.cookies).forEach(([key, value]) => {
            this.cookies.set(key, value);
            this.opts.logger.debug(`Stored cookie from curl_cffi: ${key}`);
          });
        }

        // Update last URL for Referer header
        this.lastUrl = url;

        // Check for HTTP errors
        if (result.status && result.status >= 400) {
          const errorBody = safeJson(result.body || "");
          this.opts.logger.error(`HTTP ${result.status} for ${method} ${url}: ${result.body}`);
          throw new HttpError(result.status, `HTTP ${result.status}`, errorBody);
        }

        // Parse response body
        const contentType = result.headers?.["content-type"] || result.headers?.["Content-Type"] || "";
        if (contentType.includes("application/json")) {
          return JSON.parse(result.body || "{}");
        } else {
          return result.body;
        }
      } catch (e: any) {
        if (e instanceof HttpError) {
          throw e; // Don't retry on HTTP errors
        }
        
        const errorMsg = `curl_cffi request failed: ${e.message}`;
        this.opts.logger.error(errorMsg);
        
        // If we had a previous cloudscraper error, mention both
        if (lastError) {
          this.opts.logger.error(`Both bypass methods failed. Cloudscraper: ${lastError.message}, curl_cffi: ${e.message}`);
          throw new Error(`Both bypass methods failed. Last error: ${e.message}`);
        }
        
        throw new Error(errorMsg);
      }
    }
    
    // This should never happen if configuration is correct
    throw new Error("No bypass method available");
  }
}

async function withRetries<T>(fn: () => Promise<T>, logger: Logger, url: string, method: string, retries = 3): Promise<T> {
  let attempt = 0;
  let delay = 250;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (e: any) {
      const status = e?.status as number | undefined;
      if (attempt < retries - 1 && (status === 429 || (status && status >= 500))) {
        attempt++;
        logger.info(`Retrying ${method} ${url} (attempt ${attempt}/${retries - 1}) after ${delay}ms due to ${status || 'error'}`);
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      // Log final failure
      if (attempt > 0) {
        logger.error(`Request failed after ${attempt + 1} attempts: ${method} ${url}`);
      }
      throw e;
    }
  }
}

function mergeSignals(signals: Array<AbortSignal | undefined>): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
