## Nitan MCP

This is a modified version of Discourse MCP. It will be a dedicated MCP client for https://www.uscardforum.com/

## Original README

A Model Context Protocol (MCP) stdio server that exposes Discourse forum capabilities as tools for AI agents.

- **Entry point**: `src/index.ts` → compiled to `dist/index.js` (binary name: `discourse-mcp`)
- **SDK**: `@modelcontextprotocol/sdk`
- **Node**: >= 18

### Quick start (release)

- **Run (read‑only, recommended to start)**
```bash
npx -y @discourse/mcp@latest
```
Then, in your MCP client, either:
- Call the `discourse_select_site` tool with `{ "site": "https://try.discourse.org" }` to choose a site, or
- Start the server tethered to a site using `--site https://try.discourse.org` (in which case `discourse_select_site` is hidden).

- **Enable writes (opt‑in, safe‑guarded)**
```bash
npx -y @discourse/mcp@latest --allow_writes --read_only=false --auth_pairs '[{"site":"https://try.discourse.org","api_key":"'$DISCOURSE_API_KEY'","api_username":"system"}]'
```

- **Use in an MCP client (example: Claude Desktop) — via npx**
```json
{
  "mcpServers": {
    "discourse": {
      "command": "npx",
      "args": ["-y", "@discourse/mcp@latest"],
      "env": {}
    }
  }
}
```

> Alternative: if you prefer a global binary after install, the package exposes `discourse-mcp`.
> ```json
> {
>   "mcpServers": {
>     "discourse": { "command": "discourse-mcp", "args": [] }
>   }
> }
> ```

## Configuration

The server registers tools under the MCP server name `@discourse/mcp`. Choose a target Discourse site either by:
- Using the `discourse_select_site` tool at runtime (validates via `/about.json`), or
- Supplying `--site <url>` to tether the server to a single site at startup (validates via `/about.json` and hides `discourse_select_site`).

- **Auth**
  - **None** by default.
  - **Admin API Keys** (require admin permissions): **`--auth_pairs '[{"site":"https://example.com","api_key":"...","api_username":"system"}]'`**
  - **User API Keys** (any user can generate): **`--auth_pairs '[{"site":"https://example.com","user_api_key":"...","user_api_client_id":"..."}]'`**
  - You can include multiple entries in `auth_pairs`; the matching entry is used for the selected site. If both `user_api_key` and `api_key` are provided for the same site, `user_api_key` takes precedence.

- **Write safety**
  - Writes are disabled by default.
  - The tools `discourse_create_post`, `discourse_create_topic`, `discourse_create_category`, and `discourse_create_user` are only registered when all are true:
    - `--allow_writes` AND not `--read_only` AND some auth is configured (either default flags or a matching `auth_pairs` entry).
  - A ~1 req/sec rate limit is enforced for write actions.

- **Flags & defaults**
  - `--read_only` (default: true)
  - `--allow_writes` (default: false)
  - `--timeout_ms <number>` (default: 15000)
  - `--concurrency <number>` (default: 4)
  - `--log_level <silent|error|info|debug>` (default: info)
    - `debug`: Shows all HTTP requests, responses, and detailed error information
    - `info`: Shows retry attempts and general operational messages
    - `error`: Shows only errors
    - `silent`: No logging output
  - `--tools_mode <auto|discourse_api_only|tool_exec_api>` (default: auto)
  - `--site <url>`: Tether MCP to a single site and hide `discourse_select_site`.
  - `--default-search <prefix>`: Unconditionally prefix every search query (e.g., `tag:ai order:latest-post`).
  - `--max-read-length <number>`: Maximum characters returned for post content (default 50000). Applies to `discourse_read_post` and per-post content in `discourse_read_topic`. The tools prefer `raw` content by requesting `include_raw=true`.
  - `--transport <stdio|http>` (default: stdio): Transport type. Use `stdio` for standard input/output (default), or `http` for Streamable HTTP transport (stateless mode with JSON responses).
  - `--port <number>` (default: 3000): Port to listen on when using HTTP transport.
  - `--cache_dir <path>` (reserved)
  - `--profile <path.json>` (see below)

- **Profile file** (keep secrets off the command line)
```json
{
  "auth_pairs": [
    { "site": "https://try.discourse.org", "api_key": "<redacted>", "api_username": "system" },
    { "site": "https://example.com", "user_api_key": "<user_api_key>", "user_api_client_id": "<client_id>" }
  ],
  "read_only": false,
  "allow_writes": true,
  "log_level": "info",
  "tools_mode": "auto",
  "site": "https://try.discourse.org",
  "default_search": "tag:ai order:latest-post",
  "max_read_length": 50000,
  "transport": "stdio",
  "port": 3000
}
```
Run with:
```bash
node dist/index.js --profile /absolute/path/to/profile.json
```
Flags still override values from the profile.

- **Remote Tool Execution API (optional)**
  - With `tools_mode=auto` (default) or `tool_exec_api`, the server discovers remote tools via GET `/ai/tools` after you select a site (or immediately at startup if `--site` is provided) and registers them dynamically. Set `--tools_mode=discourse_api_only` to disable remote tool discovery.

- **Networking & resilience**
  - Retries on 429/5xx with backoff (3 attempts).
  - Lightweight in‑memory GET cache for selected endpoints.

- **Privacy**
  - Secrets are redacted in logs. Errors are returned as human‑readable messages to MCP clients.

## Tools

Built‑in tools (always present unless noted):

- `discourse_search`
  - Input: `{ query: string; with_private?: boolean; max_results?: number (1–50, default 10) }`
  - Output: text summary plus a compact footer like:
    ```json
    { "results": [{ "id": 123, "url": "https://…", "title": "…" }] }
    ```
- `discourse_read_topic`
  - Input: `{ topic_id: number; post_limit?: number (1–20, default 5) }`
- `discourse_read_post`
  - Input: `{ post_id: number }`
- `discourse_list_categories`
  - Input: `{}`
- `discourse_list_tags`
  - Input: `{}`
- `discourse_get_user`
  - Input: `{ username: string }`
- `discourse_filter_topics`
  - Input: `{ filter: string; page?: number (default 1); per_page?: number (1–50) }`
  - Query language (succinct): key:value tokens separated by spaces; category/categories (comma = OR, `=category` = without subcats, `-` prefix = exclude); tag/tags (comma = OR, `+` = AND) and tag_group; status:(open|closed|archived|listed|unlisted|public); personal `in:` (bookmarked|watching|tracking|muted|pinned); dates: created/activity/latest-post-(before|after) with `YYYY-MM-DD` or relative days `N`; numeric: likes[-op]-(min|max), posts-(min|max), posters-(min|max), views-(min|max); order: activity|created|latest-post|likes|likes-op|posters|title|views|category with optional `-asc`; free text terms are matched.
- `discourse_create_post` (only when writes enabled; see Write safety)
  - Input: `{ topic_id: number; raw: string (≤ 30k chars) }`

- `discourse_create_topic` (only when writes enabled; see Write safety)
  - Input: `{ title: string; raw: string (≤ 30k chars); category_id?: number; tags?: string[] }`

 - `discourse_create_user` (only when writes enabled; see Write safety)
 - Input: `{ username: string (1-20 chars); email: string; name: string; password: string; active?: boolean; approved?: boolean }`

 - `discourse_create_category` (only when writes enabled; see Write safety)
 - Input: `{ name: string; color?: hex; text_color?: hex; parent_category_id?: number; description?: string }`


Notes:
- Outputs are human‑readable first. Where applicable, a compact JSON is embedded in fenced code blocks to ease structured extraction by agents.

## Development

- **Requirements**: Node >= 18, `pnpm`.

- **Install / Build / Typecheck / Test**
```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

- **Run locally (with source maps)**
```bash
pnpm build && pnpm dev
```

- **Project layout**
  - Server & CLI: `src/index.ts`
  - HTTP client: `src/http/client.ts`
  - Tool registry: `src/tools/registry.ts`
  - Built‑in tools: `src/tools/builtin/*`
  - Remote tools: `src/tools/remote/tool_exec_api.ts`
  - Logging/redaction: `src/util/logger.ts`, `src/util/redact.ts`

- **Testing notes**
  - Tests run with Node’s test runner against compiled artifacts (`dist/test/**/*.js`). Ensure `pnpm build` before `pnpm test` if invoking scripts individually.

- **Publishing (optional)**
  - The package is published as `@discourse/mcp` and exposes a `bin` named `discourse-mcp`. Prefer `npx @discourse/mcp@latest` for frictionless usage.

- **Conventions**
  - Focus on text‑oriented outputs; keep embedded JSON concise.
  - Be careful with write operations; keep them opt‑in and rate‑limited.

See `AGENTS.md` for additional guidance on using this server from agent frameworks.

## Examples

### Quick Start with User API Key (No Admin Required)

```bash
# Step 1: Generate a User API Key
npx @discourse/mcp@latest generate-user-api-key \
  --site https://discourse.example.com \
  --save-to profile.json

# Step 2: Visit the authorization URL shown, approve the request, and paste the payload

# Step 3: Run the MCP server with your new key
npx @discourse/mcp@latest --profile profile.json --allow_writes --read_only=false
```

### Other Examples

- Read‑only session against `try.discourse.org`:
```bash
npx -y @discourse/mcp@latest --log_level debug
# In client: call discourse_select_site with {"site":"https://try.discourse.org"}
```

- Tether to a single site:
```bash
npx -y @discourse/mcp@latest --site https://try.discourse.org
```

- Create a post with Admin API Key (writes enabled):
```bash
npx -y @discourse/mcp@latest --allow_writes --read_only=false --auth_pairs '[{"site":"https://try.discourse.org","api_key":"'$DISCOURSE_API_KEY'","api_username":"system"}]'
```

- Create a post with User API Key (writes enabled, no admin required):
```bash
npx -y @discourse/mcp@latest --allow_writes --read_only=false --auth_pairs '[{"site":"https://try.discourse.org","user_api_key":"'$DISCOURSE_USER_API_KEY'"}]'
```

- Create a category (writes enabled):
```bash
npx -y @discourse/mcp@latest --allow_writes --read_only=false --auth_pairs '[{"site":"https://try.discourse.org","api_key":"'$DISCOURSE_API_KEY'","api_username":"system"}]'
# In your MCP client, call discourse_create_category with for example:
# { "name": "AI Research", "color": "0088CC", "text_color": "FFFFFF", "description": "Discussions about AI research" }
```

- Create a topic (writes enabled):
```bash
npx -y @discourse/mcp@latest --allow_writes --read_only=false --auth_pairs '[{"site":"https://try.discourse.org","api_key":"'$DISCOURSE_API_KEY'","api_username":"system"}]'
# In your MCP client, call discourse_create_topic, for example:
# { "title": "Agentic workflows", "raw": "Let's discuss agent workflows.", "category_id": 1, "tags": ["ai","agents"] }
```

- Run with HTTP transport (on port 3000):
```bash
npx -y @discourse/mcp@latest --transport http --port 3000 --site https://try.discourse.org
# Server will start on http://localhost:3000
# Health check: http://localhost:3000/health
# MCP endpoint: http://localhost:3000/mcp
```

## Authentication

### Admin API Keys vs User API Keys

This MCP server supports two types of Discourse API authentication:

1. **Admin API Keys** (`api_key` + `api_username`)
   - Require admin/moderator permissions to generate
   - Created via Admin Panel → API → New API Key
   - Can perform all operations including user/category creation
   - Use headers: `Api-Key` and `Api-Username`

2. **User API Keys** (`user_api_key` + optional `user_api_client_id`)
   - Can be generated by any user (no admin required)
   - User-specific permissions and rate limits
   - Ideal for personal use and non-admin operations
   - Use headers: `User-Api-Key` and `User-Api-Client-Id`
   - Auto-expire after 180 days of inactivity (configurable per site)
   - Learn more: https://meta.discourse.org/t/user-api-keys-specification/48536

### Obtaining a User API Key

#### Easy Method: Built-in Generator (Recommended)

This package includes a convenient command to generate User API Keys:

```bash
# Interactive mode - follow the prompts
npx @discourse/mcp@latest generate-user-api-key --site https://discourse.example.com

# Save directly to a profile file
npx @discourse/mcp@latest generate-user-api-key --site https://discourse.example.com --save-to profile.json

# Specify custom scopes
npx @discourse/mcp@latest generate-user-api-key --site https://discourse.example.com --scopes "read,write,notifications"

# Get help
npx @discourse/mcp@latest generate-user-api-key --help
```

The command will:
1. Generate an RSA key pair
2. Display an authorization URL for you to visit
3. Prompt you to paste the encrypted payload after authorization
4. Decrypt and display your User API Key
5. Optionally save it to a profile file

#### Manual Method

User API Keys require an OAuth-like flow documented at https://meta.discourse.org/t/user-api-keys-specification/48536. Key steps:

1. Generate a public/private key pair
2. Request authorization via `/user-api-key/new` with your public key, application name, client ID, and requested scopes
3. User approves the request (after login if needed)
4. Discourse returns an encrypted payload with the User API Key
5. Decrypt using your private key and use the key in your configuration

You can also manually create User API Keys via the Discourse UI (if enabled by the site):
- Visit your user preferences → Security → API
- Or use third-party tools that implement the User API Key flow

## FAQ

- **Why is `create_post` missing?** You're in read‑only mode. Enable writes as described above.
- **Can I disable remote tool discovery?** Yes, run with `--tools_mode=discourse_api_only`.
- **Can I avoid exposing `discourse_select_site`?** Yes, start with `--site <url>` to tether to a single site.
- **Time outs or rate limits?** Increase `--timeout_ms`, and note built‑in retry/backoff on 429/5xx.
- **Should I use Admin API Keys or User API Keys?** Use User API Keys for personal use (no admin required). Use Admin API Keys only when you need admin-level operations or are setting up a system-wide integration.
- **Getting "fetch failed" errors?** Run with `--log_level debug` to see detailed error information including:
  - The exact URL being requested
  - HTTP status codes and response bodies
  - Network-level errors (DNS, SSL/TLS, connectivity issues)
  - Retry attempts and timing
  - Timeout diagnostics
