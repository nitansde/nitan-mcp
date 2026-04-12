## Nitan MCP

> **Project Homepage:** [https://nitan.ai/mcp](https://nitan.ai/mcp)

[论坛开发讨论贴](https://www.uscardforum.com/t/topic/450599)

This is a heavy modified version of [Discourse MCP](https://github.com/discourse/discourse-mcp). It will be a dedicated MCP client for https://www.uscardforum.com/

### Quick Installation

**Prerequisites:**
- **Node.js 18 or higher** (required)
- Python 3.7+ (required for Cloudflare bypass)
- pip (used via local `.venv` Python)

## Simplified setup by platform

### macOS
```bash
npm install
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

`npm install` will also auto-install `playwright` and the Chromium runtime on macOS for browser fallback.

### Linux
```bash
npm install
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

On non-macOS platforms, Playwright is not auto-installed.

### Windows (PowerShell)
```powershell
npm install
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

On non-macOS platforms, Playwright is not auto-installed.

Run health check:
```bash
node dist/index.js doctor
```

**Check your Node.js version:**
```bash
node --version  # Should be v18.0.0 or higher
```

**If you need to upgrade Node.js:**
```bash
# Using nvm (recommended)
nvm install 18
nvm use 18

# Or download from https://nodejs.org/
```

**Using npx (recommended):**
```bash
npx -y @nitansde/mcp@latest
```

**What happens automatically:**
1. ✅ Downloads and caches the package
2. ✅ Installs Node.js dependencies
3. ✅ Runs `postinstall` script to check/install Python dependencies
4. ✅ On macOS, auto-installs `playwright` package and Chromium runtime for browser fallback
5. ✅ Checks Python dependencies at runtime and shows helpful warnings if missing

**If Python dependencies aren't installed automatically:**
```bash
.venv/bin/python -m pip install cloudscraper curl-cffi nodriver
# Or install from requirements.txt (recommended)
.venv/bin/python -m pip install -r requirements.txt
```

**If Python is installed in a virtual environment**
```bash
npx -y @nitansde/mcp@latest --python_path /path/to/python_executable
```

The server will start even if Python dependencies are missing, but Cloudflare bypass features won't work until you install them.

### Skill Distribution (OpenClaw AgentSkill)

This project also ships an **AgentSkill** (additive only, does **not** change MCP runtime behavior).

- Skill source: `skills/nitan/SKILL.md`
- Pack command:

```bash
pnpm skill:pack
# output: dist-skill/nitan.skill
```

#### Install Skill in OpenClaw

Option A (recommended): install the packaged file

1. Build the skill package:

```bash
pnpm skill:pack
```

2. Import `dist-skill/nitan.skill` into OpenClaw Skill manager (or your skill distribution channel).

Option B: install from source folder (local development)

1. Copy `skills/nitan/` to your OpenClaw skills directory.
2. Restart/reload OpenClaw so it re-indexes skills.

Release-ready checklist:

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm skill:pack
```

Publish flow:
- npm package publish remains unchanged.
- Attach `dist-skill/nitan.skill` as a release artifact (or upload to your skill channel).

### Cloudflare Bypass

This server uses an intelligent **multi-layer Cloudflare bypass strategy**:
1. Tries `cloudscraper` first (mature, established)
2. Automatically falls back to `curl_cffi` if cloudscraper fails (better browser impersonation)
3. On CF 403, launches `nodriver` (headless Chrome) to solve the challenge and harvest cookies, then retries via `curl_cffi`
4. Remembers failures and uses the working method for subsequent requests

This provides maximum reliability against Cloudflare protection. See [CLOUDFLARE_BYPASS.md](CLOUDFLARE_BYPASS.md) for details.

### Browser Fallback (new)

When direct bypass still hits Cloudflare challenge (403/challenge page), browser fallback is enabled by default on macOS.

- Keeps current direct mode as default
- Triggers browser path only on challenge-like responses
- **macOS only**: default provider is Playwright persistent profile mode (`playwright`)
- **macOS only**: `npm install` auto-installs Playwright + Chromium runtime
- Profile selection for Playwright fallback:
  - Reuse OpenClaw user-data-dir only when the selected profile directory exists
  - Otherwise use/create `~/Library/Application Support/NitanMCP/ChromeProfile`
  - If OpenClaw user-data-dir exists but the selected profile directory is missing, auto-fallback to Nitan profile dir
  - Never use the system default Chrome profile directory
- If fallback lands on login/not_logged_in and `NITAN_USERNAME` + `NITAN_PASSWORD` are set, Playwright auto-login is attempted and request is retried once
- Interactive login keeps working by opening a visible Chrome window with the selected profile
- Non-macOS: browser fallback is disabled automatically (direct bypass only), and Playwright is not auto-installed

CLI flags (or profile JSON fields):

- `--browser-fallback-enabled=true`
- `--browser-fallback-provider=playwright`
- `--browser-fallback-timeout-ms=45000`
- `--interactive-login-enabled=true`
- `--login-profile-name="nitan"`
- `--login-check-url="https://www.uscardforum.com/"`

Example:

```bash
npx -y @nitansde/mcp@latest \
  --browser-fallback-enabled=true \
  --browser-fallback-provider=playwright \
  --interactive-login-enabled=true \
  --login-profile-name="nitan"
```

If you switch provider to `openclaw_proxy` and relay is unavailable, attach a tab with OpenClaw Browser Relay (badge `ON`) and retry.

If Playwright is missing on macOS, run:

```bash
npm install --no-save playwright
npx playwright install chromium
```

### Python dependency recommendation (all platforms)

Use local venv to avoid system Python policy conflicts (PEP668 / externally managed environments):

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

`python_path` now defaults to `.venv/bin/python` when available.

During `npm install`, postinstall now prefers local `.venv` and installs requirements via `.venv` Python/pip.

### MCP Client Configuration
### API key setup (recommended)

If you want authenticated reads without storing forum login credentials in your MCP client config, generate a Discourse User API key once and save it to a profile file.

#### Generate and save the API key

Using the published package:

```bash
npx -y @nitansde/mcp@latest generate-user-api-key \
  --site https://www.uscardforum.com \
  --auth-mode url
```

Using a local checkout after `npm run build`:

```bash
node dist/index.js generate-user-api-key \
  --site https://www.uscardforum.com \
  --auth-mode url
```

Authorization launch modes:

- `--auth-mode url` (default): print the authorization URL in the terminal and let the user open it manually.
- `--auth-mode browser`: automatically open the authorization URL in the default browser, while still showing the URL in the terminal as a fallback.

### Resumable multi-step generation (recommended for agents)

If your MCP host launches a short-lived process that cannot wait for the user to paste the payload back immediately, use the resumable flow.

#### Step 1: start generation and persist pending state

```bash
npx -y @nitansde/mcp@latest generate-user-api-key \
  --site https://www.uscardforum.com \
  --auth-mode browser \
  --state-file /absolute/path/nitan-user-api-key.json
```

This command:

1. Generates the RSA key pair and a unique client ID.
2. Prints the authorization URL.
3. Optionally opens the browser if `--auth-mode browser` is used.
4. Saves the pending private/public key state to `--state-file`.
5. Exits without waiting for the payload.

#### Step 2: complete later with the payload

```bash
npx -y @nitansde/mcp@latest complete-user-api-key \
  --state-file /absolute/path/nitan-user-api-key.json \
  --payload "PASTE_THE_ENCRYPTED_PAYLOAD_HERE"
```

`complete-user-api-key` decrypts the payload using the saved pending state, writes the final `user_api_key` to the profile, and removes the state file on success.

#### Default profile location

The CLI saves the API profile to a platform default location automatically:

- macOS: `~/Library/Application Support/NitanMCP/profile.json`
- Linux / Docker: `${XDG_CONFIG_HOME:-~/.config}/nitan-mcp/profile.json`
- Windows: `%APPDATA%\NitanMCP\profile.json`

Browser-launch example:

```bash
npx -y @nitansde/mcp@latest generate-user-api-key \
  --site https://www.uscardforum.com \
  --auth-mode browser \
  --state-file /absolute/path/nitan-user-api-key.json
```

What happens:

1. The CLI generates a temporary RSA key pair.
2. It prints a Discourse authorization URL.
3. Open that URL, log into uscardforum, and authorize the application.
4. Discourse shows an encrypted payload on the page.
5. Copy that payload and paste it back into the terminal prompt.
6. The CLI decrypts it and saves `user_api_key` + `user_api_client_id` into the profile file.

The current flow uses the manual copy/paste payload path and requests `read` scope by default.

Example saved profile:

```json
{
  "auth_pairs": [
    {
      "site": "https://www.uscardforum.com",
      "user_api_key": "YOUR_USER_API_KEY",
      "user_api_client_id": "nitan-mcp-550e8400-e29b-41d4-a716-446655440000"
    }
  ]
}
```

If you do not pass `--client-id`, the generator creates a unique `nitan-mcp-<uuid>` client ID by default.

#### Use the saved API key in your MCP client

The server loads the default profile location automatically. No extra path flag is needed.

**For Claude Desktop (macOS/Windows):**
```json
{
  "mcpServers": {
    "nitan": {
      "command": "npx",
      "args": [
        "-y",
        "@nitansde/mcp@latest"
      ],
      "env": {
        "TIMEZONE": "America/New_York"
      }
    }
  }
}
```

If an API key exists for the selected site, the server uses that first.

#### Delete the current saved API key file

To remove the current default saved API profile file entirely:

```bash
npx -y @nitansde/mcp@latest delete-user-api-key
```

### Login via environment variables (alternative to API key)

If you do not want to use an API key, you can provide login credentials instead.

```json
{
  "mcpServers": {
    "nitan": {
      "command": "npx",
      "args": [
        "-y",
        "@nitansde/mcp@latest"
      ],
      "env": {
        "NITAN_USERNAME": "YOUR_USERNAME",
        "NITAN_PASSWORD": "YOUR_PASSWORD"
      }
    }
  }
}
```

Behavior summary:

- API key and login credentials are alternative auth setups.
- If an API key exists for the site, it is preferred.
- If no API key exists but `NITAN_USERNAME` / `NITAN_PASSWORD` are configured, login mode is used.
- If neither exists, public tools still work, but auth-required tools will ask you to set up an API key or provide `NITAN_USERNAME` / `NITAN_PASSWORD`.

Use optional env `"TIMEZONE": "America/New_York"` if you want a timezone different from your local clock.

**Configuration file location:**
```

**Configuration file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
```


## Original README
[Discourse MCP](https://github.com/discourse/discourse-mcp/blob/main/README.md)
