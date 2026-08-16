Changelog

### [3.0.0] — MCP SDK v2 / 2026-07-28 Stateless Protocol

#### Breaking Changes

* Upgrade `@modelcontextprotocol/sdk` v1 to the v2 split packages:
  `@modelcontextprotocol/server` and `@modelcontextprotocol/node`.
* Upgrade `zod` from v3 to v4 (`^4.2.0`), as required by the v2 SDK.
* Minimum Node.js version raised from 18 to **20** (v2 SDK requirement).

#### Features

* HTTP transport now speaks the **2026-07-28 stateless** Streamable HTTP protocol
  via `createMcpHandler` — no `initialize` handshake, no `Mcp-Session-Id`, fresh
  server per request. Legacy 2025-era clients are still served transparently.
* stdio transport upgraded to `serveStdio`, supporting both 2025-era and 2026-07-28
  protocol negotiation on a single connection.
* Tool registration updated from deprecated `.shape` raw schemas to Standard Schema
  (`z.object(...)`) objects, as recommended by the v2 SDK.

#### Unchanged

* All Nitan-specific behavior: Cloudflare bypass, browser fallback,
  Discourse/uscardforum tools, `/health`, `/auth` + OAuth/User API Key flow,
  `doctor` CLI.
* stdio remains the default transport for `npx` / Claude Desktop usage.

### [0.1.9](https://github.com/discourse/discourse-mcp/compare/v0.1.8...v0.1.9) (2025-10-20)

#### Features

* add discourse_list_user_posts tool to fetch user posts and replies
* support pagination with page parameter (30 posts per page)
* include formatted output with topic titles, dates, excerpts, and URLs

### [0.1.8](https://github.com/SamSaffron/discourse-mcp/compare/v0.1.7...v0.1.8) (2025-10-20)

#### Features

* add User API Key support and generator
* implement User-Api-Key and User-Api-Client-Id headers for non-admin authentication
* add generate-user-api-key command with RSA keypair generation and interactive setup
* add enhanced HTTP error logging with detailed diagnostics for troubleshooting

#### Bug Fixes

* enable logger output to stderr (uncommented process.stderr.write())
* support kebab-case CLI arguments in mergeConfig (--allow-writes, --read-only, etc.)
* ensure CLI flags override profile settings regardless of case style (kebab-case or snake_case)

### [0.1.7](https://github.com/SamSaffron/discourse-mcp/compare/v0.1.6...v0.1.7) (2025-10-17)

#### Features

* add optional HTTP transport support via --transport flag
* implement Streamable HTTP transport (stateless mode) as alternative to stdio
* add --port flag for configuring HTTP server port (default: 3000)
* include health check endpoint at /health for HTTP mode

### [0.1.6](https://github.com/SamSaffron/discourse-mcp/compare/v0.1.5...v0.1.6) (2025-10-16)

#### Bug Fixes

* fix broken 0.1.5 release

### [0.1.5](https://github.com/SamSaffron/discourse-mcp/compare/v0.1.4...v0.1.5) (2025-10-16)

#### Bug Fixes

* correct filter_topics pagination to be 0-based ([2f0eb17](https://github.com/SamSaffron/discourse-mcp/commit/2f0eb17))

### [0.1.4](https://github.com/SamSaffron/discourse-mcp/compare/v0.1.3...v0.1.4) (2025-09-02)

### [0.1.3](https://github.com/SamSaffron/discourse-mcp/compare/v0.1.2...v0.1.3) (2025-08-20)

### [0.1.2](https://github.com/SamSaffron/discourse-mcp/compare/v0.1.1...v0.1.2) (2025-08-20)

### 0.1.1 (2025-08-20)
