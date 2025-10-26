# Publishing Guide for @nitan/mcp

## Pre-Publishing Checklist

### 1. Build and Test
```bash
# Clean and rebuild
pnpm run clean
pnpm run build

# Verify Python file is in dist/
ls -la dist/http/cloudscraper_wrapper.py
ls -la dist/requirements.txt

# Run tests
pnpm test

# Test locally with npx
node dist/index.js --help
```

### 2. Version Bump
```bash
# For patch release (0.1.9 -> 0.1.10)
pnpm run release

# For minor release (0.1.9 -> 0.2.0)
pnpm version minor

# For major release (0.1.9 -> 1.0.0)
pnpm version major
```

### 3. Package Verification
```bash
# See what will be published
npm pack --dry-run

# Check package contents
npm pack
tar -tzf nitan-mcp-*.tgz
rm nitan-mcp-*.tgz
```

## Publishing to npm

### First-time Setup
```bash
# Login to npm (you'll need an npm account)
npm login

# Verify you're logged in
npm whoami
```

### Publish
```bash
# Build first
pnpm run build

# Publish to npm
npm publish --access public

# Or for beta/alpha releases
npm publish --tag beta --access public
npm publish --tag alpha --access public
```

## Post-Publishing Verification

### Test Installation
```bash
# Test with npx
npx -y @nitan/mcp@latest --help

# Test in a fresh directory
mkdir test-install && cd test-install
npm install @nitan/mcp
node node_modules/@nitan/mcp/dist/index.js --help
cd .. && rm -rf test-install
```

### Test with Claude Desktop
Update `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "nitan": {
      "command": "npx",
      "args": [
        "-y",
        "@nitan/mcp@latest",
        "--site",
        "https://www.uscardforum.com/",
        "--use_cloudscraper",
        "--username",
        "YOUR_USERNAME",
        "--password",
        "YOUR_PASSWORD",
        "--log_level",
        "info"
      ]
    }
  }
}
```

Restart Claude Desktop and check that:
1. Python dependencies are installed automatically
2. The MCP server connects successfully
3. Tools are available and working

## Package Structure

After build, the package should contain:
```
dist/
  index.js (main entry point, binary: nitan-mcp)
  http/
    cloudscraper_wrapper.py
    client.js
    cloudscraper.js
    cache.js
  requirements.txt
  site/
  tools/
  util/
  test/
scripts/
  check-python-deps.mjs (runs on postinstall)
README.md
LICENSE
package.json
```

## Key Files

- **dist/index.js**: Main entry point, registered as `nitan-mcp` binary
- **dist/http/cloudscraper_wrapper.py**: Python script for Cloudflare bypass
- **dist/requirements.txt**: Python dependencies (cloudscraper)
- **scripts/check-python-deps.mjs**: Auto-installs Python deps on `npm install`

## Important Notes

1. **Python Requirements**: The package requires Python 3.7+ for Cloudflare bypass features
2. **Postinstall Script**: Automatically runs `pip3 install -r requirements.txt` after npm install
3. **Build Process**: The build script copies Python files to dist/ using `copy:python`
4. **Access Level**: Package is public (`"access": "public"` in publishConfig)
5. **Package Scope**: Package is scoped to @nitan namespace

## Troubleshooting

### Python Dependencies Not Installing
If users report that Python dependencies aren't installing:
```bash
# Manual installation
pip3 install -r requirements.txt

# Or with virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Binary Not Found
If `nitan-mcp` command isn't found after npx:
```bash
# Use full npx command
npx @nitan/mcp --help

# Or install globally
npm install -g @nitan/mcp
nitan-mcp --help
```

### Cloudflare Bypass Not Working
Check Python setup:
```bash
python3 --version  # Should be 3.7+
pip3 list | grep cloudscraper  # Should show cloudscraper package
```

## Rolling Back a Release

If you need to unpublish or deprecate:
```bash
# Deprecate a version (preferred over unpublish)
npm deprecate @nitan/mcp@0.1.9 "This version has known issues. Please upgrade."

# Unpublish (only within 72 hours, not recommended)
npm unpublish @nitan/mcp@0.1.9

# Unpublish entire package (use with extreme caution)
npm unpublish @nitan/mcp --force
```
