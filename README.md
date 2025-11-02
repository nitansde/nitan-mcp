## Nitan MCP

[论坛开发讨论贴](https://www.uscardforum.com/t/topic/450599)

This is a modified version of Discourse MCP. It will be a dedicated MCP client for https://www.uscardforum.com/

### Quick Installation

**Prerequisites:**
- **Node.js 18 or higher** (required)
- Python 3.7+ (required for Cloudflare bypass)
- pip3 (for Python dependency installation)

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
4. ✅ Checks Python dependencies at runtime and shows helpful warnings if missing

**If Python dependencies aren't installed automatically:**
```bash
pip3 install cloudscraper curl-cffi
# Or install from requirements.txt
pip3 install -r requirements.txt
```

**If Python is installed in a virtual environment**
```bash
npx -y @nitansde/mcp@latest --python_path /path/to/python_executable
```

The server will start even if Python dependencies are missing, but Cloudflare bypass features won't work until you install them.

### Cloudflare Bypass

This server uses an intelligent **dual-method Cloudflare bypass strategy**:
1. Tries `cloudscraper` first (mature, established)
2. Automatically falls back to `curl_cffi` if cloudscraper fails (better browser impersonation)
3. Remembers failures and uses the working method for subsequent requests

This provides maximum reliability against Cloudflare protection. See [CLOUDFLARE_BYPASS.md](CLOUDFLARE_BYPASS.md) for details.

### MCP Client Configuration
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
        "NITAN_USERNAME": "YOUR_USERNAME",
        "NITAN_PASSWORD": "YOUR_PASSWORD",
      }
    }
  }
}
```

Use optinal env `"TIME_ZONE": "America/New_York"` if you want to use a timezone different to your local clock.

**Configuration file location:**
```

**Configuration file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

## Original README
[Discourse MCP](https://github.com/discourse/discourse-mcp/blob/main/README.md)
