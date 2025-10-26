# Cloudscraper Integration Summary

## What Was Added

This project now includes optional integration with [cloudscraper](https://github.com/VeNoMouS/cloudscraper), a Python library that automatically bypasses Cloudflare protection.

## Files Created/Modified

### New Files:
1. **`src/http/cloudscraper_wrapper.py`** - Python script that uses cloudscraper to make HTTP requests
2. **`src/http/cloudscraper.ts`** - TypeScript wrapper that spawns the Python script
3. **`requirements.txt`** - Python dependencies (cloudscraper)
4. **`CLOUDSCRAPER_GUIDE.md`** - Comprehensive guide with troubleshooting
5. **`CLOUDSCRAPER_QUICKSTART.md`** - Quick start instructions
6. **`cloudscraper-example.json`** - Example profile configuration

### Modified Files:
1. **`src/http/client.ts`** - Added cloudscraper support to HTTP client
2. **`src/site/state.ts`** - Pass cloudscraper options to HTTP clients
3. **`src/index.ts`** - Added CLI flags `--use_cloudscraper` and `--python_path`
4. **`README.md`** - Added documentation for cloudscraper option

## How It Works

```
┌─────────────┐
│  Node.js    │
│  HTTP Client│
└──────┬──────┘
       │
       │ (spawn subprocess)
       │
       ▼
┌─────────────┐
│  Python     │
│  cloudscraper│
└──────┬──────┘
       │
       │ (make request)
       │
       ▼
┌─────────────┐
│  Cloudflare │
│  Protected  │
│  Website    │
└─────────────┘
```

1. When `use_cloudscraper: true`, the HTTP client spawns a Python subprocess
2. Request details (URL, method, headers, cookies, body) are sent to Python via stdin as JSON
3. Python uses cloudscraper to make the request, which automatically:
   - Detects Cloudflare challenges
   - Executes JavaScript to solve them
   - Handles Cloudflare cookies (`cf_clearance`, etc.)
   - Returns the response
4. Response (status, headers, body, cookies) is sent back to Node.js via stdout as JSON
5. Node.js parses the response and continues as normal
6. Cookies are stored and sent with subsequent requests

## Quick Setup

```bash
# 1. Install Python dependencies
pip3 install cloudscraper

# 2. Build the project
pnpm build

# 3. Create a profile
cat > cloudscraper.json <<EOF
{
  "use_cloudscraper": true,
  "site": "https://www.uscardforum.com/",
  "log_level": "debug"
}
EOF

# 4. Run
node dist/index.js --profile cloudscraper.json
```

## Configuration Options

### CLI Flags:
- `--use_cloudscraper` (boolean, default: false)
- `--python_path <path>` (string, default: "python3")

### Profile File:
```json
{
  "use_cloudscraper": true,
  "python_path": "/usr/local/bin/python3.11"
}
```

## When to Use Cloudscraper

### Use Cloudscraper When:
- ✅ Site has aggressive Cloudflare protection
- ✅ JavaScript challenges are common
- ✅ Cookies expire frequently
- ✅ You want automatic, hands-off operation
- ✅ You're okay with slightly slower performance

### Use Manual Cookies When:
- ✅ Site has stable cookies that last hours/days
- ✅ You need maximum performance
- ✅ You don't want to install Python
- ✅ Site doesn't use JavaScript challenges

### Use Both When:
- ✅ You want cloudscraper as fallback
- ✅ Initial requests need Cloudflare bypass
- ✅ Subsequent requests should be fast

## Performance Impact

| Method | Speed | Maintenance | Reliability |
|--------|-------|-------------|-------------|
| Native fetch | ~50ms | Manual | Medium |
| Native fetch + cookies | ~50ms | Manual | Medium-High |
| Cloudscraper | ~100-500ms | Automatic | High |

## Architecture Decisions

### Why Python Subprocess?
- Cloudscraper is a mature Python library with no Node.js equivalent
- Subprocess approach is simple and doesn't require Node.js bindings
- Isolated process = no version conflicts

### Why JSON via stdin/stdout?
- Simple, language-agnostic IPC
- No network overhead
- Easy to debug (can test Python script manually)
- Standard approach for cross-language integration

### Why Not Use puppeteer/playwright?
- Those are heavier (full browser automation)
- Cloudscraper is lighter and specifically designed for Cloudflare
- No need for browser installation
- Faster execution

## Testing the Integration

Test the Python script directly:

```bash
echo '{"url":"https://www.uscardforum.com/","method":"GET","headers":{},"timeout":30}' | python3 src/http/cloudscraper_wrapper.py
```

Expected output:
```json
{
  "success": true,
  "status": 200,
  "headers": {...},
  "body": "...",
  "cookies": {...}
}
```

## Troubleshooting

See [CLOUDSCRAPER_GUIDE.md](CLOUDSCRAPER_GUIDE.md) for detailed troubleshooting steps.

Common issues:
1. **"Python not found"** - Install Python 3.7+
2. **"No module named 'cloudscraper'"** - Run `pip3 install cloudscraper`
3. **Still getting 403** - Cloudflare may have updated, try `pip3 install --upgrade cloudscraper`
4. **Slow performance** - This is expected; cloudscraper adds overhead for automatic bypass

## Future Improvements

Possible enhancements:
1. Connection pooling (reuse Python process across requests)
2. Async Python subprocess management
3. Fallback to native fetch if cloudscraper fails
4. Auto-detect Cloudflare and enable cloudscraper only when needed
5. Cache cloudscraper sessions for better performance

## Credits

- [cloudscraper](https://github.com/VeNoMouS/cloudscraper) by VeNoMouS
- Integration implemented for Discourse MCP
