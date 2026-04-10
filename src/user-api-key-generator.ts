#!/usr/bin/env node
import { generateKeyPairSync, privateDecrypt, constants, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

interface KeyPair {
  publicKey: string;
  privateKey: string;
}

interface GenerateOptions {
  site: string;
  scopes?: string;
  applicationName?: string;
  clientId?: string;
  nonce?: string;
  authRedirect?: string;
  authMode?: AuthLaunchMode;
  stateFile?: string;
  payload?: string;
  saveTo?: string;
}

export type AuthLaunchMode = "url" | "browser";

export interface ParsedGenerateUserApiKeyArgs {
  options: GenerateOptions;
  showHelp: boolean;
}

export interface PendingUserApiKeyState {
  version: 1;
  createdAt: string;
  site: string;
  scopes: string;
  applicationName: string;
  clientId: string;
  nonce: string;
  publicKey: string;
  privateKey: string;
  saveTo?: string;
}

export interface PreparedUserApiKeyGeneration {
  authUrl: string;
  state: PendingUserApiKeyState;
}

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  return { publicKey, privateKey };
}

export function generateClientId(prefix = "nitan-mcp"): string {
  return `${prefix}-${randomUUID()}`;
}

export function resolveAuthLaunchMode(mode?: string): AuthLaunchMode {
  if (!mode || mode === "url") return "url";
  if (mode === "browser") return "browser";
  throw new Error(`Invalid --auth-mode value: ${mode}. Expected 'url' or 'browser'.`);
}

export function parseGenerateUserApiKeyArgs(args: string[]): ParsedGenerateUserApiKeyArgs {
  const options: GenerateOptions = { site: "" };
  let showHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--site":
        options.site = next;
        i++;
        break;
      case "--scopes":
        options.scopes = next;
        i++;
        break;
      case "--application-name":
        options.applicationName = next;
        i++;
        break;
      case "--client-id":
        options.clientId = next;
        i++;
        break;
      case "--nonce":
        options.nonce = next;
        i++;
        break;
      case "--auth-mode":
        options.authMode = next as AuthLaunchMode;
        i++;
        break;
      case "--state-file":
        options.stateFile = next;
        i++;
        break;
      case "--payload":
        options.payload = next;
        i++;
        break;
      case "--save-to":
        options.saveTo = next;
        i++;
        break;
      case "--help":
      case "-h":
        showHelp = true;
        break;
    }
  }

  return { options, showHelp };
}

export function getBrowserOpenCommand(url: string, platform = process.platform): { command: string; args: string[] } {
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }
  return { command: "xdg-open", args: [url] };
}

export async function openAuthorizationUrl(url: string, platform = process.platform): Promise<void> {
  const { command, args } = getBrowserOpenCommand(url, platform);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", reject);
    child.unref();
    resolve();
  });
}

export function buildAuthorizationUrl(options: GenerateOptions, publicKey: string): string {
  const url = new URL(`${options.site}/user-api-key/new`);

  const params = new URLSearchParams({
    application_name: options.applicationName || "Discourse MCP",
    client_id: options.clientId || generateClientId(),
    scopes: options.scopes || "read",
    public_key: publicKey,
    nonce: options.nonce || Date.now().toString(),
  });

  if (options.authRedirect) {
    params.set("auth_redirect", options.authRedirect);
  }

  url.search = params.toString();
  return url.toString();
}

export function createPendingUserApiKeyState(options: GenerateOptions): PendingUserApiKeyState {
  const clientId = options.clientId || generateClientId();
  const nonce = options.nonce || Date.now().toString();
  const { publicKey, privateKey } = generateKeyPair();

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    site: options.site,
    scopes: options.scopes || "read",
    applicationName: options.applicationName || "Discourse MCP",
    clientId,
    nonce,
    publicKey,
    privateKey,
    saveTo: options.saveTo,
  };
}

export function prepareUserApiKeyGeneration(options: GenerateOptions): PreparedUserApiKeyGeneration {
  const state = createPendingUserApiKeyState(options);
  const authUrl = buildAuthorizationUrl({
    site: state.site,
    scopes: state.scopes,
    applicationName: state.applicationName,
    clientId: state.clientId,
    nonce: state.nonce,
    authRedirect: options.authRedirect,
  }, state.publicKey);
  return { authUrl, state };
}

export function resolvePendingStateFilePath(stateFile?: string): string {
  return stateFile || join(tmpdir(), `nitan-user-api-key-${randomUUID()}.json`);
}

export async function savePendingUserApiKeyState(filePath: string, state: PendingUserApiKeyState): Promise<void> {
  await writeFile(filePath, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
}

export async function loadPendingUserApiKeyState(filePath: string): Promise<PendingUserApiKeyState> {
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  if (
    raw?.version !== 1 ||
    typeof raw?.site !== "string" ||
    typeof raw?.clientId !== "string" ||
    typeof raw?.nonce !== "string" ||
    typeof raw?.publicKey !== "string" ||
    typeof raw?.privateKey !== "string"
  ) {
    throw new Error(`Invalid pending state file: ${filePath}`);
  }
  return raw as PendingUserApiKeyState;
}

export function extractUserApiKeyFromPayload(state: PendingUserApiKeyState, payload: string): { key: string; clientId: string; site: string } {
  const decrypted = decryptPayload(payload, state.privateKey);
  const result = JSON.parse(decrypted);

  if (!result.key) {
    throw new Error("Invalid response: missing 'key' field");
  }

  return {
    key: result.key,
    clientId: state.clientId,
    site: state.site,
  };
}

export async function completeUserApiKeyFromState(options: { stateFile: string; payload: string; saveTo?: string }): Promise<void> {
  const state = await loadPendingUserApiKeyState(options.stateFile);
  const result = extractUserApiKeyFromPayload(state, options.payload);
  const saveTo = options.saveTo || state.saveTo;

  if (saveTo) {
    await saveToProfile(saveTo, result.site, result.key, result.clientId);
    console.error(`✓ Saved to profile: ${saveTo}\n`);
    console.log(JSON.stringify({ success: true, profile: saveTo }, null, 2));
  } else {
    console.error("Add this to your auth_pairs configuration:\n");
    console.log(JSON.stringify({
      site: result.site,
      user_api_key: result.key,
      user_api_client_id: result.clientId,
    }, null, 2));
  }

  await unlink(options.stateFile).catch(() => undefined);
}

export function decryptPayload(encryptedPayload: string, privateKey: string): string {
  try {
    const buffer = Buffer.from(encryptedPayload, "base64");
    const decrypted = privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_PADDING,
      },
      buffer
    );
    return decrypted.toString("utf8");
  } catch (error: any) {
    throw new Error(`Failed to decrypt payload: ${error?.message || String(error)}`);
  }
}

async function promptForInput(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function saveToProfile(
  profilePath: string,
  site: string,
  userApiKey: string,
  clientId: string
): Promise<void> {
  let profile: any = {};

  try {
    const content = await readFile(profilePath, "utf8");
    profile = JSON.parse(content);
  } catch {
    // File doesn't exist or is invalid, start fresh
  }

  if (!profile.auth_pairs) {
    profile.auth_pairs = [];
  }

  // Remove any existing entry for this site
  profile.auth_pairs = profile.auth_pairs.filter((p: any) => p.site !== site);

  // Add new entry
  profile.auth_pairs.push({
    site,
    user_api_key: userApiKey,
    user_api_client_id: clientId,
  });

  await writeFile(profilePath, JSON.stringify(profile, null, 2), "utf8");
}

export async function generateUserApiKey(options: GenerateOptions): Promise<void> {
  if (!options.site) {
  console.error(`
Usage: nitan-mcp generate-user-api-key [options]

Options:
  --site <url>              Discourse site URL (required)
  --scopes <scopes>         Comma-separated scopes (default: read)
  --application-name <name> Application name (default: Nitan MCP)
  --client-id <id>          Client ID (default: generated UUID)
  --nonce <nonce>           Nonce for request (default: timestamp)
  --auth-mode <mode>        How to start authorization: url or browser (default: url)
  --state-file <file>       Persist pending auth state and exit so another process can complete later
  --payload <payload>       Encrypted payload (skip interactive prompt)
  --save-to <file>          Save to profile file instead of printing
  --help, -h                Show this help message

Examples:
  # Interactive mode
  nitan-mcp generate-user-api-key --site https://discourse.example.com

  # Save to profile
  nitan-mcp generate-user-api-key --site https://discourse.example.com --save-to profile.json

  # Start a resumable flow
  nitan-mcp generate-user-api-key --site https://discourse.example.com --state-file /tmp/nitan-user-api-key.json

  # Non-interactive with payload
  nitan-mcp generate-user-api-key --site https://discourse.example.com --payload "base64..."

  # Complete later in a new process
  nitan-mcp complete-user-api-key --state-file /tmp/nitan-user-api-key.json --payload "base64..."
`);
    process.exit(1);
  }

  console.error("\n🔑 Discourse User API Key Generator\n");
  console.error(`Site: ${options.site}`);
  console.error(`Scopes: ${options.scopes || "read"}\n`);

  const authMode = resolveAuthLaunchMode(options.authMode);
  const prepared = prepareUserApiKeyGeneration({
    ...options,
    authMode,
  });
  const { authUrl, state } = prepared;

  console.error(`Client ID: ${state.clientId}`);
  console.error(`Nonce: ${state.nonce}\n`);
  console.error("Please visit this URL to authorize the application:\n");
  console.error(authUrl);
  console.error("");

  if (options.stateFile) {
    const stateFile = resolvePendingStateFilePath(options.stateFile);
    await savePendingUserApiKeyState(stateFile, state);
    console.error(`Pending auth state saved to: ${stateFile}\n`);
  }

  if (authMode === "browser") {
    console.error("Opening the authorization URL in your default browser...\n");
    try {
      await openAuthorizationUrl(authUrl);
    } catch (error: any) {
      console.error(`⚠ Failed to open browser automatically: ${error?.message || String(error)}`);
      console.error("Please copy the URL above into your browser manually.\n");
    }
  } else {
    console.error("Copy the URL above into your browser to continue.\n");
  }

  // Step 3: Get encrypted payload
  let encryptedPayload: string;
  if (options.payload) {
    encryptedPayload = options.payload;
  } else if (options.stateFile) {
    console.error("Resumable flow created. Run complete-user-api-key later with --state-file and --payload.\n");
    console.log(JSON.stringify({
      success: true,
      mode: "pending",
      state_file: resolvePendingStateFilePath(options.stateFile),
      auth_url: authUrl,
      user_api_client_id: state.clientId,
    }, null, 2));
    return;
  } else {
    console.error("After authorizing, copy the encrypted payload shown by Discourse and paste it below.\n");

    encryptedPayload = await promptForInput("Paste the encrypted payload here: ");

    if (!encryptedPayload) {
      throw new Error("No payload provided");
    }
  }

  // Step 4: Decrypt payload
  console.error("\nDecrypting payload...");
  const result = extractUserApiKeyFromPayload(state, encryptedPayload);

  console.error("✓ User API Key retrieved successfully\n");

  // Step 5: Output or save
  if (options.saveTo) {
    await saveToProfile(options.saveTo, options.site, result.key, result.clientId);
    console.error(`✓ Saved to profile: ${options.saveTo}\n`);
    console.log(JSON.stringify({ success: true, profile: options.saveTo }, null, 2));
  } else {
    console.error("Add this to your auth_pairs configuration:\n");
    console.log(JSON.stringify({
      site: options.site,
      user_api_key: result.key,
      user_api_client_id: result.clientId,
    }, null, 2));
    console.error("\nOr use --save-to <profile.json> to save automatically.");
  }
}

async function main() {
  const { options } = parseGenerateUserApiKeyArgs(process.argv.slice(2));

  try {
    await generateUserApiKey(options);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error?.message || String(error)}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`Fatal error: ${err}`);
    process.exit(1);
  });
}
