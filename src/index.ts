#!/usr/bin/env node

// Check Node.js version before anything else
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split('.')[0], 10);

if (majorVersion < 18) {
  console.error(`Error: Node.js 18 or higher is required. You are using Node.js ${nodeVersion}.`);
  console.error(`Please upgrade Node.js:`);
  console.error(`  - Download from https://nodejs.org/`);
  console.error(`  - Or use nvm: nvm install 18 && nvm use 18`);
  process.exit(1);
}

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { generateUserApiKey, completeUserApiKeyFromState, parseGenerateUserApiKeyArgs, generateKeyPair, generateClientId, buildAuthorizationUrl, decryptPayload, saveToProfile } from "./user-api-key-generator.js";
import { getDefaultProfilePath } from "./util/paths.js";

// Read package version at runtime to avoid import-attributes incompatibility
async function getPackageVersion(): Promise<string> {
  try {
    const pkgPath = new URL("../package.json", import.meta.url);
    const raw = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}
import { Logger, type LogLevel } from "./util/logger.js";
import { redactObject } from "./util/redact.js";
import { type AuthMode } from "./http/client.js";
import {
  getDefaultBrowserFallbackEnabled,
  getDefaultBrowserFallbackProvider,
  resolveBrowserFallbackEnabled,
  resolveBrowserFallbackProvider,
} from "./http/browser_fallback_defaults.js";
import { registerAllTools } from "./tools/registry.js";
import { SiteState, type AuthOverride } from "./site/state.js";

const DEFAULT_TIMEOUT_MS = 15000;

// CLI config schema
const ProfileSchema = z
  .object({
    auth_pairs: z
      .array(
        z
          .object({
            site: z.string().url(),
            api_key: z.string().optional(),
            api_username: z.string().optional(),
            user_api_key: z.string().optional(),
            user_api_client_id: z.string().optional(),
            username: z.string().optional().describe("Username for login (used with cloudscraper)"),
            password: z.string().optional().describe("Password for login (used with cloudscraper)"),
            second_factor_token: z.string().optional().describe("2FA token (used with cloudscraper)"),
          })
          .strict()
      )
      .optional(),
    timeout_ms: z.number().int().positive().optional().default(DEFAULT_TIMEOUT_MS),
    concurrency: z.number().int().positive().optional().default(4),
    cache_dir: z.string().optional(),
    log_level: z.enum(["silent", "error", "info", "debug"]).optional().default("info"),
    site: z.string().url().optional().default("https://www.uscardforum.com/").describe("Tether MCP to a single Discourse site; defaults to uscardforum.com"),
    default_search: z.string().optional().describe("Optional search prefix added to every search query (set via --default-search)"),
    max_read_length: z
      .number()
      .int()
      .positive()
      .optional()
      .default(50000)
      .describe("Maximum number of characters to include when returning post content (set via --max-read-length)"),
    transport: z.enum(["stdio", "http"]).optional().default("stdio").describe("Transport type: stdio (default) or http"),
    port: z.number().int().positive().optional().default(3000).describe("Port to listen on when using HTTP transport"),
    use_cloudscraper: z.boolean().optional().describe("(Deprecated: use bypass_method instead) Use Python cloudscraper to bypass Cloudflare"),
    bypass_method: z.enum(["cloudscraper", "curl_cffi", "both"]).optional().default("both").describe("Cloudflare bypass method: 'cloudscraper', 'curl_cffi', or 'both' (default - tries cloudscraper with curl_cffi fallback)"),
    python_path: z.string().optional().default(getDefaultPythonPath()).describe("Path to Python executable for bypass methods (defaults to local .venv python when available)"),
    browser_fallback_enabled: z.boolean().optional().default(getDefaultBrowserFallbackEnabled()),
    browser_fallback_provider: z.enum(["playwright", "openclaw_proxy"]).optional().default(getDefaultBrowserFallbackProvider()),
    browser_fallback_timeout_ms: z.number().int().positive().optional().default(45000),
    interactive_login_enabled: z.boolean().optional().default(true),
    login_profile_name: z.string().optional(),
    login_wait_timeout_ms: z.number().int().positive().optional().default(180000),
    login_check_url: z.string().url().optional(),
    skip_site_validation: z.boolean().optional().default(false).describe("Skip --site pre-validation (useful for tests)"),
  })
  .strict();

type Profile = z.infer<typeof ProfileSchema>;

function parseArgs(argv: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      const key = arg.slice(2, eq);
      const val = arg.slice(eq + 1);
      out[key] = coerceValue(val);
    } else {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = coerceValue(next);
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function coerceValue(val: string): unknown {
  if (val === "true") return true;
  if (val === "false") return false;
  const num = Number(val);
  if (!Number.isNaN(num) && val.trim() !== "") return num;
  // Try to parse as JSON for arrays and objects
  if (val.startsWith("[") || val.startsWith("{")) {
    try {
      const parsed = JSON.parse(val);
      return parsed;
    } catch (e) {
      // If JSON parsing fails, return as string
      console.error(`Failed to parse JSON value: ${val}`, e);
    }
  }
  return val;
}

async function loadProfile(path?: string): Promise<Partial<Profile>> {
  if (!path) return {};
  if (!existsSync(path)) return {};
  const txt = await readFile(path, "utf8");
  const raw = JSON.parse(txt);
  const parsed = ProfileSchema.partial().safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid profile JSON: ${parsed.error.message}`);
  return parsed.data;
}

function getDefaultPythonPath(): string {
  const cwdVenvPython = process.platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python";
  if (existsSync(cwdVenvPython)) return cwdVenvPython;

  const packageVenvPythonUrl =
    process.platform === "win32"
      ? new URL("../.venv/Scripts/python.exe", import.meta.url)
      : new URL("../.venv/bin/python", import.meta.url);

  if (existsSync(packageVenvPythonUrl)) {
    return fileURLToPath(packageVenvPythonUrl);
  }

  return process.platform === "win32" ? "python" : "python3";
}

function mergeConfig(profile: Partial<Profile>, flags: Record<string, unknown>): Profile {
  // Handle simple username/password flags by creating auth_pairs entry
  let authPairs = (flags.auth_pairs as any) ?? profile.auth_pairs;
  
  // If username/password are provided via flags or environment variables, create an auth_pairs entry
  const username = (flags.username as string | undefined) ?? process.env.NITAN_USERNAME;
  const password = (flags.password as string | undefined) ?? process.env.NITAN_PASSWORD;
  const site = (flags.site as string | undefined) ?? profile.site ?? "https://www.uscardforum.com/";
  
  if (username && password && site) {
    const authEntry: AuthOverride = {
      site,
      username,
      password,
    }
    
    // Add second_factor_token if provided
    const secondFactor = (flags.second_factor_token ?? flags["second-factor-token"]) as string | undefined ?? process.env.DISCOURSE_2FA_TOKEN;
    if (secondFactor) {
      authEntry.second_factor_token = secondFactor;
    }
    
    // If auth_pairs doesn't exist, create it; otherwise append to it
    if (!authPairs) {
      authPairs = [authEntry];
    } else if (Array.isArray(authPairs)) {
      // Check if there's already an entry for this site
      const existingIndex = authPairs.findIndex((entry: any) => entry.site === site);
      if (existingIndex >= 0) {
        // Replace existing entry
        authPairs[existingIndex] = { ...authPairs[existingIndex], ...authEntry };
      } else {
        // Add new entry
        authPairs.push(authEntry);
      }
    }
  }
  
  const merged = {
    auth_pairs: authPairs,
    timeout_ms: ((flags.timeout_ms ?? flags["timeout-ms"]) as number | undefined) ?? profile.timeout_ms ?? DEFAULT_TIMEOUT_MS,
    concurrency: (flags.concurrency as number | undefined) ?? profile.concurrency ?? 4,
    cache_dir: ((flags.cache_dir ?? flags["cache-dir"]) as string | undefined) ?? profile.cache_dir,
    log_level: (((flags.log_level ?? flags["log-level"]) as LogLevel | undefined) ?? (profile.log_level as LogLevel | undefined) ?? "info") as LogLevel,
    site: site ?? "https://www.uscardforum.com/",
    default_search: (((flags.default_search ?? flags["default-search"]) as string | undefined) ?? profile.default_search) as string | undefined,
    max_read_length: (((flags.max_read_length ?? flags["max-read-length"]) as number | undefined) ?? profile.max_read_length ?? 50000) as number,
    transport: ((flags.transport as "stdio" | "http" | undefined) ?? profile.transport ?? "stdio") as "stdio" | "http",
    port: ((flags.port as number | undefined) ?? profile.port ?? 3000) as number,
    use_cloudscraper: (((flags.use_cloudscraper ?? flags["use-cloudscraper"]) as boolean | undefined) ?? profile.use_cloudscraper) as boolean | undefined,
    bypass_method: (((flags.bypass_method ?? flags["bypass-method"]) as "cloudscraper" | "curl_cffi" | "both" | undefined) ?? profile.bypass_method ?? "both") as "cloudscraper" | "curl_cffi" | "both",
    python_path: (((flags.python_path ?? flags["python-path"]) as string | undefined) ?? profile.python_path ?? getDefaultPythonPath()) as string,
    browser_fallback_enabled: (((flags.browser_fallback_enabled ?? flags["browser-fallback-enabled"]) as boolean | undefined) ?? profile.browser_fallback_enabled ?? getDefaultBrowserFallbackEnabled()) as boolean,
    browser_fallback_provider: resolveBrowserFallbackProvider(
      (((flags.browser_fallback_provider ?? flags["browser-fallback-provider"]) as "playwright" | "openclaw_proxy" | undefined) ?? profile.browser_fallback_provider) as "playwright" | "openclaw_proxy" | undefined
    ) as "playwright" | "openclaw_proxy",
    browser_fallback_timeout_ms: (((flags.browser_fallback_timeout_ms ?? flags["browser-fallback-timeout-ms"]) as number | undefined) ?? profile.browser_fallback_timeout_ms ?? 45000) as number,
    interactive_login_enabled: (((flags.interactive_login_enabled ?? flags["interactive-login-enabled"]) as boolean | undefined) ?? profile.interactive_login_enabled ?? true) as boolean,
    login_profile_name: (((flags.login_profile_name ?? flags["login-profile-name"]) as string | undefined) ?? profile.login_profile_name) as string | undefined,
    login_wait_timeout_ms: (((flags.login_wait_timeout_ms ?? flags["login-wait-timeout-ms"]) as number | undefined) ?? profile.login_wait_timeout_ms ?? 180000) as number,
    login_check_url: (((flags.login_check_url ?? flags["login-check-url"]) as string | undefined) ?? profile.login_check_url) as string | undefined,
    skip_site_validation: (((flags.skip_site_validation ?? flags["skip-site-validation"]) as boolean | undefined) ?? profile.skip_site_validation ?? false) as boolean,
  } satisfies Profile;
  
  const result = ProfileSchema.safeParse(merged);
  if (!result.success) throw new Error(`Invalid configuration: ${JSON.stringify(result.error.issues, null, 2)}`);
  return result.data;
}

function buildAuth(_config: Profile): AuthMode {
  // Global default is no auth; use per-site overrides via auth_pairs when provided
  return { type: "none" };
}

/**
 * Check Python dependencies at runtime
 * Provides a warning if Python or required libraries are missing
 */
async function checkPythonDepsRuntime(logger: Logger, pythonPath: string): Promise<void> {
  return new Promise((resolve) => {
    // Quick check if Python and libraries are available
    const checkScript = `
import sys
try:
    import cloudscraper
    import curl_cffi
    print("OK")
except ImportError as e:
    print(f"MISSING:{e.name}")
    sys.exit(1)
`;
    
    const python = spawn(pythonPath, ["-c", checkScript]);
    let output = "";
    let errorOutput = "";
    
    python.stdout.on("data", (data) => {
      output += data.toString();
    });
    
    python.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    python.on("close", (code) => {
      if (code === 0 && output.includes("OK")) {
        logger.debug("Python dependencies check: All required packages are installed");
        resolve();
      } else {
        // Dependencies are missing, show warning
        logger.info("⚠️  Warning: Python dependencies are not fully installed");
        logger.info("⚠️  警告：Python 依赖包未完全安装");
        logger.info("   Server will start, but Cloudflare bypass features will not work.");
        logger.info("   服务器将启动，但 Cloudflare 绕过功能将无法使用。");
        logger.info("");
        logger.info("   Missing packages: cloudscraper and/or curl-cffi");
        logger.info("   缺少的包：cloudscraper 和/或 curl-cffi");
        logger.info("   To fix this, run one of these commands:");
        logger.info("   要修复此问题，请运行以下命令之一：");
        logger.info("");
        logger.info(`   "${pythonPath}" -m pip install cloudscraper curl-cffi`);
        logger.info("");
        logger.info("   Or install all dependencies from requirements.txt:");
        logger.info("   或从 requirements.txt 安装所有依赖：");
        logger.info(`   "${pythonPath}" -m pip install -r requirements.txt`);
        logger.info("");
        resolve(); // Don't block server startup
      }
    });
    
    python.on("error", (err) => {
      // Python not found
      logger.info(`⚠️  Warning: Python executable not found (tried: ${pythonPath})`);
      logger.info(`⚠️  警告：找不到 Python 可执行文件（尝试了：${pythonPath}）`);
      logger.info("   Server will start, but Cloudflare bypass features will not work.");
      logger.info("   服务器将启动，但 Cloudflare 绕过功能将无法使用。");
      logger.info("");
      logger.info("   To enable Cloudflare bypass:");
      logger.info("   要启用 Cloudflare 绕过功能：");
      logger.info("   1. Install Python 3.7+ from https://python.org");
      logger.info("   1. 从 https://python.org 安装 Python 3.7+");
      logger.info(`   2. Make sure '${pythonPath}' is in your PATH`);
      logger.info(`   2. 确保 '${pythonPath}' 在您的 PATH 环境变量中`);
      logger.info("   3. Create local venv: python3 -m venv .venv");
      logger.info("   3. 创建本地 venv：python3 -m venv .venv");
      logger.info("   4. Install required packages: .venv/bin/python -m pip install -r requirements.txt");
      logger.info("   4. 安装所需的包：.venv/bin/python -m pip install -r requirements.txt");
      logger.info("");
      logger.info(`   If Python is installed with a different name, use:`);
      logger.info(`   如果 Python 以不同的名称安装，请使用：`);
      logger.info(`   --python-path=/path/to/python`);
      logger.info("");
      resolve(); // Don't block server startup
    });
  });
}

async function probePythonDeps(pythonPath: string): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const checkScript = `
import sys
try:
    import cloudscraper
    import curl_cffi
    print("OK")
except Exception as e:
    print(f"ERR:{type(e).__name__}:{e}")
    sys.exit(1)
`;
    const proc = spawn(pythonPath, ["-c", checkScript]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", (e) => resolve({ ok: false, reason: `python_spawn_failed: ${String(e)}` }));
    proc.on("close", (code) => {
      if (code === 0 && out.includes("OK")) return resolve({ ok: true });
      return resolve({ ok: false, reason: (out || err || `exit_${code}`).trim() });
    });
  });
}

async function probePlaywright(): Promise<{
  installed: boolean;
  runtimeInstalled: boolean;
  reason?: string;
  executablePath?: string;
}> {
  let playwright: any;
  try {
    const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;
    playwright = await dynamicImport("playwright");
  } catch (e: any) {
    return {
      installed: false,
      runtimeInstalled: false,
      reason: e?.message || String(e),
    };
  }

  try {
    const executablePath = playwright?.chromium?.executablePath?.() as string | undefined;
    const runtimeInstalled = Boolean(executablePath && existsSync(executablePath));
    return {
      installed: true,
      runtimeInstalled,
      executablePath,
      reason: runtimeInstalled ? undefined : `chromium_executable_not_found:${executablePath || "unknown"}`,
    };
  } catch (e: any) {
    return {
      installed: true,
      runtimeInstalled: false,
      reason: e?.message || String(e),
    };
  }
}

function platformInstallGuide(opts?: { includePlaywrightFix?: boolean }): string[] {
  if (process.platform === "darwin") {
    const lines = [
      "python3 -m venv .venv",
      ". .venv/bin/activate",
      "pip install -r requirements.txt",
    ];
    if (opts?.includePlaywrightFix) {
      lines.push("npm install --no-save playwright");
      lines.push("npx playwright install chromium");
    }
    return lines;
  }
  if (process.platform === "linux") {
    return [
      "python3 -m venv .venv",
      "source .venv/bin/activate",
      "pip install -r requirements.txt",
    ];
  }
  return [
    "py -3 -m venv .venv",
    ".\\.venv\\Scripts\\Activate.ps1",
    "pip install -r requirements.txt",
  ];
}

async function runDoctor() {
  const pythonPath = getDefaultPythonPath();
  const pyProbe = await probePythonDeps(pythonPath);
  const isMac = process.platform === "darwin";
  const chromeExists = isMac ? existsSync("/Applications/Google Chrome.app") : undefined;
  const playwrightProbe = isMac ? await probePlaywright() : undefined;

  console.log("nitan-mcp doctor");
  console.log(`- platform: ${process.platform}`);
  console.log(`- node: ${process.versions.node}`);
  console.log(`- default python_path: ${pythonPath}`);
  console.log(`- python deps (cloudscraper/curl_cffi): ${pyProbe.ok ? "OK" : "MISSING"}`);
  if (!pyProbe.ok) console.log(`  reason: ${pyProbe.reason}`);

  if (isMac) {
    console.log(`- chrome app: ${chromeExists ? "FOUND" : "MISSING"}`);
    console.log(`- playwright package: ${playwrightProbe?.installed ? "INSTALLED" : "MISSING"}`);
    console.log(`- playwright runtime (chromium): ${playwrightProbe?.runtimeInstalled ? "INSTALLED" : "MISSING"}`);
    if (playwrightProbe?.reason && (!playwrightProbe.installed || !playwrightProbe.runtimeInstalled)) {
      console.log(`  reason: ${playwrightProbe.reason}`);
    }
    console.log("- browser fallback availability (macOS only): enabled by default");
    console.log(`- browser fallback provider default: ${getDefaultBrowserFallbackProvider()} (openclaw_proxy is opt-in)`);
    console.log("- profile priority: OpenClaw selected profile (if present) -> NitanMCP dedicated profile (auto-created)");
  } else {
    console.log("- browser fallback: DISABLED on non-macOS (by design)");
    console.log("- playwright install: SKIPPED on non-macOS (by design)");
  }

  const needsPlaywrightFix = Boolean(isMac && (!playwrightProbe?.installed || !playwrightProbe?.runtimeInstalled));
  if (!pyProbe.ok || (isMac && (!chromeExists || needsPlaywrightFix))) {
    console.log("\nSuggested setup commands:");
    for (const line of platformInstallGuide({ includePlaywrightFix: needsPlaywrightFix })) console.log(`  ${line}`);
  }
}

async function main() {
  // Check if user wants to generate a User API Key
  const args = process.argv.slice(2);
  if (args[0] === "doctor") {
    await runDoctor();
    return;
  }
  if (args[0] === "generate-user-api-key") {
    const { options, showHelp } = parseGenerateUserApiKeyArgs(args.slice(1));
    if (showHelp) {
      await generateUserApiKey({ site: "" }); // Will show help and exit
      return;
    }
    await generateUserApiKey(options);
    return;
  }
  if (args[0] === "complete-user-api-key") {
    const { options, showHelp } = parseGenerateUserApiKeyArgs(args.slice(1));
    if (showHelp || !options.stateFile || !options.payload) {
      console.error(`
Usage: nitan-mcp complete-user-api-key --state-file <file> --payload <payload>

Options:
  --state-file <file>       Pending auth state file created by generate-user-api-key
  --payload <payload>       Encrypted payload copied from Discourse
  --help, -h                Show this help message
`);
      if (showHelp) return;
      process.exit(1);
    }
    await completeUserApiKeyFromState({
      stateFile: options.stateFile,
      payload: options.payload,
    });
    return;
  }
  if (args[0] === "delete-user-api-key") {
    const profilePath = getDefaultProfilePath();
    if (!existsSync(profilePath)) {
      console.log(JSON.stringify({ success: true, deleted: false, profile: profilePath }, null, 2));
      return;
    }
    await import("node:fs/promises").then(({ unlink }) => unlink(profilePath));
    console.log(JSON.stringify({ success: true, deleted: true, profile: profilePath }, null, 2));
    return;
  }

  const argv = parseArgs(process.argv.slice(2));
  if (argv.profile !== undefined) {
    throw new Error("--profile is no longer supported. The server now always loads the default internal profile location automatically.");
  }
  const resolvedProfilePath = getDefaultProfilePath();
  const profile = await loadProfile(resolvedProfilePath).catch((e) => {
    throw new Error(`Failed to load profile: ${e?.message || String(e)}`);
  });
  const config = mergeConfig(profile, argv);

  const logger = new Logger(config.log_level);
  
  // Check Python dependencies at runtime (in case postinstall didn't run)
  await checkPythonDepsRuntime(logger, config.python_path);
  
  const auth = buildAuth(config);

  // Meta log (stderr) without leaking secrets
  const version = await getPackageVersion();
  logger.info(`Starting Discourse MCP v${version}`);
  logger.debug(`Config: ${JSON.stringify(redactObject({ ...config }))}`);

  // Initialize dynamic site state
  let authOverrides: AuthOverride[] | undefined = undefined;
  if (Array.isArray(config.auth_pairs)) {
    authOverrides = config.auth_pairs as unknown as AuthOverride[];
  } else if (typeof (config as any).auth_pairs === "string") {
    try {
      const parsed = JSON.parse((config as any).auth_pairs);
      if (Array.isArray(parsed)) authOverrides = parsed as AuthOverride[];
    } catch {
      // ignore
    }
  }
  const browserFallbackEnabled = resolveBrowserFallbackEnabled(config.browser_fallback_enabled);
  if (config.browser_fallback_enabled && process.platform !== "darwin") {
    logger.info("Browser fallback is disabled on non-macOS platforms; using direct bypass only.");
  }

  const siteState = new SiteState({
    logger,
    timeoutMs: config.timeout_ms,
    defaultAuth: auth,
    authOverrides,
    bypassMethod: config.use_cloudscraper ? "both" : config.bypass_method, // Legacy support: use_cloudscraper=true => "both"
    pythonPath: config.python_path,
    browserFallback: {
      enabled: browserFallbackEnabled,
      provider: config.browser_fallback_provider,
      timeoutMs: config.browser_fallback_timeout_ms,
      interactiveLoginEnabled: process.platform === "darwin" ? config.interactive_login_enabled : false,
      loginProfileName: config.login_profile_name,
      loginWaitTimeoutMs: config.login_wait_timeout_ms,
      loginCheckUrl: config.login_check_url,
    },
  });

  const server = new McpServer(
    {
      name: "@discourse/mcp",
      version,
    },
    {
      capabilities: {
        tools: { listChanged: false },
      },
    }
  );

  let hideSelectSite = false;
  if (config.site) {
    try {
      const { base } = siteState.selectSite(config.site);
      hideSelectSite = true;
      logger.info(`Tethered to site: ${base}`);
    } catch (e: any) {
      throw new Error(`Failed to initialize --site ${config.site}: ${e?.message || String(e)}`);
    }
  }

  await registerAllTools(server as any, siteState, logger, {
    hideSelectSite,
    defaultSearchPrefix: config.default_search,
    maxReadLength: config.max_read_length,
  });

  // Create transport based on configuration
  if (config.transport === "http") {
    // HTTP transport using Streamable HTTP
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);

    const startedAt = new Date().toISOString();

    // Auth state for unauthenticated servers — generate keypair at startup,
    // auth URL is built per-request using the Host header so the callback
    // automatically matches however the client reached us (Funnel, Tailscale DNS, localhost).
    const hasAuth = Boolean(config.site && siteState.hasAuthForSite(config.site));
    let pendingAuthKeys: {
      publicKey: string;
      privateKey: string;
      nonce: string;
      clientId: string;
    } | null = null;

    if (!hasAuth && config.site) {
      const keyPair = generateKeyPair();
      const nonce = Date.now().toString();
      const clientId = generateClientId();
      pendingAuthKeys = {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        nonce,
        clientId,
      };
      logger.info(`No auth configured — visit /health to get the authorization URL.`);
    }

    /** Derive the external base URL from the incoming request's Host header. */
    function getCallbackBaseUrl(req: import("node:http").IncomingMessage): string {
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      if (host) {
        const proto = (req.headers["x-forwarded-proto"] as string) || (host.toString().match(/\.ts\.net/) ? "https" : "http");
        return `${proto}://${host}`;
      }
      return `http://localhost:${config.port}`;
    }

    function buildPendingAuthUrl(): string | null {
      if (!pendingAuthKeys || !config.site) return null;
      return buildAuthorizationUrl(
        {
          site: config.site,
          applicationName: "Nitan MCP",
          clientId: pendingAuthKeys.clientId,
          nonce: pendingAuthKeys.nonce,
          scopes: "read",
        },
        pendingAuthKeys.publicKey
      );
    }

    const httpServer = createServer(async (req, res) => {
      const parsedUrl = new URL(req.url || "/", `http://localhost:${config.port}`);

      // Health check endpoint
      if (req.method === "GET" && parsedUrl.pathname === "/health") {
        const health: Record<string, unknown> = {
          status: "ok",
          started_at: startedAt,
          uptime_seconds: Math.floor(process.uptime()),
          authenticated: !pendingAuthKeys,
          auth_page: `${getCallbackBaseUrl(req)}/auth`,
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(health));
        return;
      }

      // Auth page endpoint
      if (req.method === "GET" && parsedUrl.pathname === "/auth") {
        const authUrl = buildPendingAuthUrl();
        const isAuthenticated = !pendingAuthKeys;
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Nitan MCP Auth</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #121212; color: #eee; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1e1e1e; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); max-width: 500px; width: 100%; margin: 1rem; }
    h1 { margin-top: 0; font-size: 1.5rem; }
    .status { margin-bottom: 1.5rem; padding: 0.5rem 0.75rem; border-radius: 4px; font-weight: bold; }
    .status.auth { background: #2e7d32; color: #fff; }
    .status.no-auth { background: #c62828; color: #fff; }
    .btn { display: inline-block; background: #3f51b5; color: white; padding: 0.5rem 1rem; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; font-size: 1rem; width: 100%; box-sizing: border-box; text-align: center; }
    .btn:hover { background: #303f9f; }
    .btn-red { background: #d32f2f; }
    .btn-red:hover { background: #b71c1c; }
    form { margin-top: 1.5rem; }
    textarea { width: 100%; height: 100px; background: #2c2c2c; border: 1px solid #444; color: #eee; padding: 0.5rem; border-radius: 4px; margin-bottom: 1rem; box-sizing: border-box; font-family: monospace; }
    label { display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #aaa; }
    code { background: #2c2c2c; padding: 0.2rem 0.4rem; border-radius: 4px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Nitan MCP Auth</h1>
    <div class="status ${isAuthenticated ? "auth" : "no-auth"}">
      ${isAuthenticated ? "\\u2713 Authenticated" : "\\u2717 Not Authenticated"}
    </div>

    ${
      !isAuthenticated
        ? `
      <p>Target site: <code>${config.site}</code></p>
      <p>Authorize in the new tab, then copy the encrypted payload shown by Discourse and paste it below.</p>
      <a href="${authUrl}" target="_blank" class="btn">Authorize on Discourse</a>
      <form id="callbackForm">
        <label for="payload">Paste authorization payload here:</label>
        <textarea id="payload" placeholder="Copy the full payload from the Discourse page and paste here..." required></textarea>
        <button type="submit" class="btn">Connect</button>
      </form>
    `
        : `
      <p>You are authenticated to <code>${config.site}</code></p>
      <button id="logoutBtn" class="btn btn-red">Logout</button>
    `
    }

    <script>
      const callbackForm = document.getElementById("callbackForm");
      if (callbackForm) {
        callbackForm.onsubmit = async (e) => {
          e.preventDefault();
          const payload = document.getElementById("payload").value.trim();
          if (!payload) return;
          const res = await fetch("/auth/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payload })
          });
          const data = await res.json();
          alert(data.message || (data.status === "ok" ? "Success!" : "Error"));
          if (data.status === "ok") location.reload();
        };
      }

      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn) {
        logoutBtn.onclick = async () => {
          if (!confirm("Logout from ${config.site}?")) return;
          const res = await fetch("/auth/callback", { method: "DELETE" });
          const data = await res.json();
          alert(data.message);
          location.reload();
        };
      }
    </script>
  </div>
</body>
</html>
        `;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        return;
      }

      // Auth callback endpoint — handles GET (from Discourse) or POST (from auth page)
      if (parsedUrl.pathname === "/auth/callback" && (req.method === "GET" || req.method === "POST")) {
        const handlePayload = async (payload: string | null) => {
          if (!payload) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "error", message: "Missing payload parameter" }));
            return;
          }
          if (!pendingAuthKeys) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "error", message: "No pending authorization or already authorized" }));
            return;
          }
          try {
            const decrypted = decryptPayload(payload, pendingAuthKeys.privateKey);
            const result = JSON.parse(decrypted);
            if (!result.key) {
              throw new Error("Invalid response: missing 'key' field");
            }
            await saveToProfile(resolvedProfilePath, config.site, result.key, pendingAuthKeys.clientId);
            // 热更新内存中的 auth，无需重启
            siteState.updateAuthOverride({
              site: config.site,
              user_api_key: result.key,
              user_api_client_id: pendingAuthKeys.clientId,
            });
            siteState.selectSite(config.site);
            logger.info(`Authorization successful — saved to ${resolvedProfilePath}`);
            pendingAuthKeys = null;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", message: "Authorization successful. Auth is now active." }));
          } catch (error: any) {
            logger.error(`Auth callback error: ${error?.message || String(error)}`);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "error", message: error?.message || "Failed to process authorization" }));
          }
        };

        if (req.method === "GET") {
          await handlePayload(parsedUrl.searchParams.get("payload"));
        } else {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const parsed = JSON.parse(body);
              await handlePayload(parsed.payload);
            } catch {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ status: "error", message: "Invalid JSON body" }));
            }
          });
        }
        return;
      }

      // Logout endpoint — removes auth for the current site from profile
      if (req.method === "DELETE" && parsedUrl.pathname === "/auth/callback") {
        try {
          const profileTxt = await readFile(resolvedProfilePath, "utf8").catch(() => "{}");
          const profile = JSON.parse(profileTxt);
          if (profile.auth_pairs && Array.isArray(profile.auth_pairs)) {
            profile.auth_pairs = profile.auth_pairs.filter((p: any) => p.site !== config.site);
            await writeFile(resolvedProfilePath, JSON.stringify(profile, null, 2), "utf8");
          }
          const keyPair = generateKeyPair();
          const nonce = Date.now().toString();
          const clientId = generateClientId();
          // 清除内存中的 auth
          if (config.site) siteState.removeAuthOverride(config.site);
          pendingAuthKeys = { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey, nonce, clientId };
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", message: "Logged out" }));
        } catch (error: any) {
          logger.error(`Logout error: ${error?.message || String(error)}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "error", message: "Logout failed" }));
        }
        return;
      }

      // MCP endpoint - handle via StreamableHTTPServerTransport
      if (parsedUrl.pathname === "/mcp" || parsedUrl.pathname === "/") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", async () => {
          try {
            const parsedBody = body ? JSON.parse(body) : undefined;
            await transport.handleRequest(req, res, parsedBody);
          } catch (error) {
            logger.error(`Request handling error: ${error}`);
            if (!res.headersSent) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Internal server error" }));
            }
          }
        });
        return;
      }

      // Unknown endpoint
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    });

    httpServer.listen(config.port, () => {
      logger.info(`HTTP transport listening on port ${config.port}`);
      logger.info(`Health check available at http://localhost:${config.port}/health`);
      logger.info(`MCP endpoint available at http://localhost:${config.port}/mcp`);
      if (pendingAuthKeys) {
        logger.info(`Auth page at http://localhost:${config.port}/auth`);
      }
    });

    // Exit cleanly on SIGTERM/SIGINT
    let exiting = false;
    const onExit = () => {
      if (exiting) return;
      exiting = true;
      void (async () => {
        await siteState.dispose();
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
        await transport.close();
        logger.info("HTTP server closed");
        process.exit(0);
      })().catch((e) => {
        logger.error(`HTTP shutdown error: ${e?.message || String(e)}`);
        process.exit(1);
      });
    };
    process.on("SIGTERM", onExit);
    process.on("SIGINT", onExit);
  } else {
    // Default stdio transport
    const transport = new StdioServerTransport();

    // Exit cleanly on stdin close or SIGTERM
    let exiting = false;
    const onExit = () => {
      if (exiting) return;
      exiting = true;
      void siteState.dispose().finally(() => {
        process.exit(0);
      });
    };
    process.on("SIGTERM", onExit);
    process.on("SIGINT", onExit);
    process.stdin.on("close", onExit);

    await server.connect(transport);
  }
}

main().catch((err) => {
  const msg = err?.message || String(err);
  process.stderr.write(`[${new Date().toISOString()}] ERROR ${msg}\n`);
  process.exit(1);
});
