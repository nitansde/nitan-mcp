## Nitan MCP — Agent Guide

### What this project is
- **Purpose**: a dedicated MCP server/CLI for **https://www.uscardforum.com/** with Cloudflare-aware request handling.
- **Package / bin**: `@nitansde/mcp` → `nitan-mcp`
- **Entry point**: `src/index.ts` → `dist/index.js`
- **Runtime**: Node.js 18+, `@modelcontextprotocol/sdk`, Zod
- **Default site**: `https://www.uscardforum.com/`

This repo started from Discourse MCP, but the current project is opinionated for uscardforum.com and should be documented and operated as such.

### Current runtime model
- **Built-in tools only**. Remote `/ai/tools` discovery/execution has been removed.
- **Transport**:
  - `stdio` (default)
  - `http` (optional)
- **Site selection**:
  - `--site <url>` tethers the server to one site and hides `discourse_select_site`
  - `discourse_select_site` can select a site interactively when not tethered
  - site selection no longer pre-validates with `/about.json`
- **Chinese aliases** are registered automatically for the currently exposed built-in tools.

### Authentication model
Public read-only use is allowed, but some endpoints behave better or only work when authenticated.

Current preference order:
1. **API key first**
   - If a site has `user_api_key` / `user_api_client_id` in `auth_pairs`, that auth is used.
2. **Login credentials second**
   - If no API key exists but login credentials are configured, login-based bypass/browser recovery can use them.
3. **Neither configured**
   - Public tools may still work.
   - Auth-required tools should prompt the user to configure an API key or `NITAN_USERNAME` / `NITAN_PASSWORD`.

Important behavior:
- API auth and login creds can both be attached to the same site client.
- API headers remain primary on requests.
- Login credentials remain available for bypass/browser rescue paths.
- Browser fallback is a **rescue path**, not the primary auth mode.

### Auth setup flows
#### 1) API key setup (recommended)
- Start interactive/manual flow:
  - `nitan-mcp generate-user-api-key --site https://www.uscardforum.com --save-to /path/profile.json`
- Choose launch behavior:
  - `--auth-mode url` → print URL only
  - `--auth-mode browser` → print URL and open browser automatically
- Default client IDs are generated as `nitan-mcp-<uuid>`.

#### 2) Resumable API key setup
Useful for agent hosts that cannot keep the generator process open.

- Start and persist pending state:
  - `nitan-mcp generate-user-api-key --site https://www.uscardforum.com --state-file /tmp/nitan-user-api-key.json --save-to /path/profile.json`
- Complete later in another process:
  - `nitan-mcp complete-user-api-key --state-file /tmp/nitan-user-api-key.json --payload "..."`

Pending state stores the RSA private key, public key, site, nonce, client ID, and optional `saveTo`. On successful completion the CLI attempts to delete the state file.

#### 3) Login credentials (alternative to API key)
You can configure login credentials via:
- env vars: `NITAN_USERNAME`, `NITAN_PASSWORD`
- or per-site `auth_pairs` entries with `username` / `password`

### Browser fallback / Cloudflare strategy
- Direct request path prefers Python bypass helpers:
  - `cloudscraper`
  - `curl_cffi`
- When direct paths hit Cloudflare challenge pages, browser fallback can take over.
- On macOS, Playwright browser fallback is enabled by default.
- Browser fallback preserves auth headers on GET requests that need them.
- Native fetch challenge responses escalate into browser fallback.

Login behavior inside browser fallback:
- If a login page is reached and login credentials are configured, auto-login is attempted.
- If not, the user may need to complete login manually in the browser.

### HTTP transport endpoints
When `--transport http` is used:
- `GET /health`
  - returns status, uptime, auth state, and auth page URL
- `GET /auth`
  - local auth page for the manual payload flow
- `POST /auth/callback`
  - accepts `{ payload }` JSON body
- `GET /auth/callback?payload=...`
  - accepts payload as query param
- `DELETE /auth/callback`
  - clears saved auth for the current site and regenerates pending auth state

The `/auth` page currently uses the **manual copy/paste payload flow** (no `auth_redirect`) because that is the path proven to work on uscardforum.com.

### Currently registered built-in tools
The current runtime registers these built-in tools (plus Chinese aliases):

- `discourse_select_site`
- `discourse_search`
- `discourse_read_topic`
- `discourse_get_user_activity`
- `discourse_list_hot_topics`
- `discourse_list_notifications`
- `discourse_list_top_topics`
- `discourse_list_excellent_topics`
- `discourse_list_funny_topics`
- `discourse_get_trust_level_progress`

Notes:
- Write tools have been removed from this repo.
- Some older builtin source files may still exist in `src/tools/builtin`, but if they are not registered in `src/tools/registry.ts`, they are not part of the active runtime surface.

### Key CLI/config fields that matter now
Important runtime flags / profile fields:
- `--site <url>`
- `--profile <path.json>`
- `--auth_pairs <json>`
- `--transport stdio|http`
- `--port <number>`
- `--timeout_ms <number>`
- `--default-search <prefix>`
- `--max-read-length <number>`
- `--python_path <path>`
- `--bypass_method cloudscraper|curl_cffi|both`
- `--browser_fallback_enabled <bool>`
- `--browser_fallback_provider playwright|openclaw_proxy`
- `--browser_fallback_timeout_ms <number>`
- `--interactive_login_enabled <bool>`
- `--login_profile_name <name>`
- `--login_wait_timeout_ms <number>`
- `--login_check_url <url>`

### Source map
- CLI/server entrypoint: `src/index.ts`
- API key generator / resumable flow: `src/user-api-key-generator.ts`
- Site/auth selection: `src/site/state.ts`
- HTTP client: `src/http/client.ts`
- Browser fallback: `src/http/browser_fallback.ts`
- Built-in tool registry: `src/tools/registry.ts`
- Built-in tools: `src/tools/builtin/*`
- Tests:
  - `src/test/tools.test.ts`
  - `src/test/transport.test.ts`
  - `src/test/user_api_key_generator.test.ts`
  - browser fallback tests in `src/test/browser_fallback_*.test.ts`

### Operator quick start
- Build: `pnpm build`
- Test: `pnpm test`
- Doctor: `node dist/index.js doctor`
- Run stdio server: `node dist/index.js`
- Run HTTP server: `node dist/index.js --transport http --port 3000`

### Maintenance notes for future edits
- If you change the registered tool set, update this file and `README.md` together.
- If you change auth precedence, update:
  - `src/site/state.ts`
  - `src/http/client.ts`
  - auth setup sections in `README.md`
- If you reintroduce any remote tool execution feature, document it explicitly here; assume it is absent unless the current code says otherwise.
