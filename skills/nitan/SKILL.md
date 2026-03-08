---
name: nitan
description: Use the Nitan MCP server for uscardforum.com workflows. Trigger this skill when the user asks to search/read/create content on uscardforum through MCP tools, or when they need setup/configuration for the nitan-mcp server in Claude Desktop/OpenClaw-compatible MCP clients.
---

# nitan-mcp skill

Use this skill as a thin bridge to the existing MCP server. Do not reimplement forum logic in the skill.

## Setup checklist

1. Confirm Node.js >= 18.
2. Confirm Python 3.7+ is installed.
3. On macOS, `npm install` auto-installs `playwright` and Chromium runtime for browser fallback.
4. On non-macOS, Playwright is not auto-installed.
5. Use Python venv for dependencies (recommended on all platforms):
   - macOS/Linux: `python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt`
   - Windows (PowerShell): `py -3 -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt`
6. Install Python deps with venv Python if needed:
   - macOS/Linux: `.venv/bin/python -m pip install -r requirements.txt`
   - Windows: `.venv\Scripts\python.exe -m pip install -r requirements.txt`
7. Use one of these launch forms:
   - `npx -y @nitansde/mcp@latest`
   - `node dist/index.js` (inside this repo)
8. Run environment self-check:
   - `node dist/index.js doctor`

## MCP client config (Claude Desktop example)

Use this shape.

> `NITAN_USERNAME` and `NITAN_PASSWORD` are optional. Keep them unset for public/read-only access.

```json
{
  "mcpServers": {
    "nitan": {
      "command": "npx",
      "args": ["-y", "@nitansde/mcp@latest"],
      "env": {
        "NITAN_USERNAME": "YOUR_USERNAME",
        "NITAN_PASSWORD": "YOUR_PASSWORD"
      }
    }
  }
}
```

## Operating rules

- Keep MCP behavior as source of truth: all tool behavior comes from the server implementation in `src/`.
- For read-only usage, keep defaults (`read_only=true`, `allow_writes=false`).
- Enable writes only when explicitly requested and credentials are configured.
- If user asks for site switching, use `discourse_select_site` unless server is tethered with `--site`.

## Browser fallback (Cloudflare challenge)

- Default behavior stays the same: direct mode first.
- On macOS, browser fallback is enabled by default and should trigger only on Cloudflare challenge-like responses.
- On macOS, default fallback provider is `playwright` (persistent profile mode).
- On macOS, install flow auto-installs Playwright package + Chromium runtime.
- Playwright profile selection on macOS:
  - Prefer OpenClaw user-data-dir only when the selected profile directory exists.
  - Otherwise use/create `~/Library/Application Support/NitanMCP/ChromeProfile`.
  - If OpenClaw user-data-dir exists but selected profile directory is missing, auto-fallback to Nitan profile dir.
  - Never use system default Chrome profile directory.
- If fallback hits login/not_logged_in and `NITAN_USERNAME` + `NITAN_PASSWORD` are set, Playwright auto-login is attempted and request is retried once.
- On **macOS**, interactive login flow is allowed: bring up a visible Chrome profile and ask user to login.
- On non-macOS, browser fallback is disabled automatically. Do **not** attempt GUI bring-up, and Playwright is not auto-installed.

Useful flags:
- `--browser-fallback-enabled=true`
- `--browser-fallback-provider=playwright`
- `--interactive-login-enabled=true`
- `--login-profile-name="nitan"`

Note:
- If provider is switched to `openclaw_proxy` and relay tab is unavailable, attach OpenClaw Browser Relay tab first (badge should be `ON`).

## Troubleshooting

- If startup warns about missing Python deps, install from `requirements.txt`.
- If authentication fails, verify `NITAN_USERNAME` / `NITAN_PASSWORD` or `auth_pairs`.
- If no remote AI tools appear, check whether target Discourse has `/ai/tools`; uscardforum may not expose it.
- If provider is `openclaw_proxy` and browser fallback reports relay unavailable, attach OpenClaw Browser Relay tab and retry.
- If Playwright is missing on macOS, run `npm install --no-save playwright && npx playwright install chromium`.
