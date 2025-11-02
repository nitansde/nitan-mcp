# Cloudflare Bypass: Dual Method Strategy

This project uses an intelligent dual-method approach to bypass Cloudflare protection, providing maximum reliability and automatic fallback.

## Overview

The MCP server now supports **two Cloudflare bypass methods** with automatic fallback:

1. **Cloudscraper** - Mature Python library for Cloudflare bypass
2. **curl_cffi** - Modern curl-based solution with better browser impersonation

When both are enabled (default), the system will:
1. Try cloudscraper first
2. If cloudscraper fails (authentication error, CSRF token issues, etc.), automatically fall back to curl_cffi
3. Remember the failure and use curl_cffi for all subsequent requests

## Quick Start

### Prerequisites

**Required:**
- **Node.js 18 or higher**
- **Python 3.7+**
- **pip3** (Python package manager)

### Installation

Install both Python dependencies:

```bash
pip3 install -r requirements.txt
```

Or install individually:

```bash
pip3 install cloudscraper curl-cffi
```

### Verify Installation

Test that both libraries are installed:

```bash
python3 -c "import cloudscraper; import curl_cffi; print('Both libraries installed successfully')"
```

## Configuration

### Default Behavior (Recommended)

By default, the system uses **both methods with automatic fallback**:

```json
{
  "site": "https://www.uscardforum.com/",
  "auth_pairs": [
    {
      "site": "https://www.uscardforum.com/",
      "api_key": "your_api_key",
      "api_username": "your_username"
    }
  ]
}
```

The `bypassMethod` defaults to `"both"` which enables the dual strategy.

### Explicit Configuration

You can explicitly control the bypass method:

**Use both methods with fallback (recommended):**
```json
{
  "bypass_method": "both",
  "site": "https://www.uscardforum.com/"
}
```

**Use only cloudscraper:**
```json
{
  "bypass_method": "cloudscraper",
  "site": "https://www.uscardforum.com/"
}
```

**Use only curl_cffi:**
```json
{
  "bypass_method": "curl_cffi",
  "site": "https://www.uscardforum.com/"
}
```

### Custom Python Path

If your Python executable is not `python3`:

```json
{
  "bypass_method": "both",
  "python_path": "/usr/local/bin/python3.11",
  "site": "https://www.uscardforum.com/"
}
```

Or via command line:

```bash
node dist/index.js --python_path=/usr/local/bin/python3.11
```

## How the Dual Strategy Works

```
┌─────────────────────────────────────────────┐
│          HTTP Request Initiated             │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │ Try Cloudscraper │
         └────────┬─────────┘
                  │
         ┌────────┴────────┐
         │                 │
    ┌────▼────┐      ┌────▼────┐
    │ Success │      │  Failed │
    └────┬────┘      └────┬────┘
         │                 │
         │           ┌─────▼──────┐
         │           │ Mark Failed │
         │           │ Try curl_cffi│
         │           └─────┬──────┘
         │                 │
         │        ┌────────┴────────┐
         │        │                 │
         │   ┌────▼────┐      ┌────▼────┐
         │   │ Success │      │  Failed │
         │   └────┬────┘      └────┬────┘
         │        │                 │
         └────────┼─────────────────┤
                  │                 │
         ┌────────▼─────────────────▼────┐
         │     Return Response or Error   │
         └────────────────────────────────┘
```

### Fallback Logic

1. **Initial Request**: Tries cloudscraper first
2. **On Cloudscraper Failure**: 
   - Logs the failure
   - Marks cloudscraper as failed
   - Immediately tries curl_cffi
3. **Subsequent Requests**: Uses curl_cffi directly (skips cloudscraper)
4. **HTTP Errors (4xx/5xx)**: Does NOT trigger fallback (these are real server errors)

## Method Comparison

| Feature | Cloudscraper | curl_cffi |
|---------|-------------|-----------|
| **Maturity** | High (established library) | Medium-High (newer) |
| **Browser Impersonation** | Good | Excellent (uses real curl) |
| **CSRF Token Handling** | Sometimes fails | More reliable |
| **Memory Usage** | Higher | Lower |
| **Speed** | ~200-500ms | ~100-300ms |
| **Dependencies** | cloudscraper, brotli | curl-cffi |
| **Cloudflare Bypass** | Good | Excellent |
| **Best For** | General Cloudflare sites | Aggressive protection |

## When to Use Each Method

### Use "both" (Default - Recommended)
- ✅ You want maximum reliability
- ✅ Automatic fallback is desired
- ✅ You're okay with a small performance cost on first failure
- ✅ Site has intermittent Cloudflare protection

### Use "cloudscraper" Only
- ✅ Site works consistently with cloudscraper
- ✅ You want to avoid additional dependencies
- ✅ curl_cffi is not available on your system

### Use "curl_cffi" Only
- ✅ Site has very aggressive Cloudflare protection
- ✅ Cloudscraper consistently fails with CSRF errors
- ✅ You want the fastest bypass method
- ✅ You need better browser impersonation

## Troubleshooting

### "Cloudscraper error: Failed to obtain CSRF token"

This is the error that prompted the dual-method approach. Solution:

1. **Automatic**: The system will automatically fall back to curl_cffi
2. **Manual**: Set `"bypass_method": "curl_cffi"` to skip cloudscraper entirely

### "Both bypass methods failed"

If both methods fail:

1. **Check Python installation**:
   ```bash
   python3 --version  # Should be 3.7+
   ```

2. **Verify dependencies**:
   ```bash
   pip3 list | grep -E "cloudscraper|curl-cffi"
   ```

3. **Test manually**:
   ```bash
   # Test cloudscraper
   echo '{"url":"https://www.uscardforum.com/","method":"GET","headers":{},"timeout":30}' | python3 src/http/cloudscraper_wrapper.py
   
   # Test curl_cffi
   echo '{"url":"https://www.uscardforum.com/","method":"GET","headers":{},"timeout":30}' | python3 src/http/curl_cffi_wrapper.py
   ```

4. **Update libraries**:
   ```bash
   pip3 install --upgrade cloudscraper curl-cffi
   ```

5. **Check site accessibility**: The site might be completely down or blocking all automated access

### Python Module Not Found

**Error**: `ModuleNotFoundError: No module named 'cloudscraper'` or `'curl_cffi'`

**Solution**:
```bash
pip3 install cloudscraper curl-cffi
# Or
pip3 install -r requirements.txt
```

### Wrong Python Executable

**Error**: `Failed to spawn Python: python3`

**Solution**: Specify the correct Python path:
```bash
node dist/index.js --python_path=/usr/bin/python3
# Or /usr/local/bin/python3.11, etc.
```

Find your Python path:
```bash
which python3
```

### Performance Issues

If requests are slow:

1. **First request is always slower** (warm-up + Cloudflare challenge)
2. **Subsequent requests are faster** (cookies + session maintained)
3. **Consider using curl_cffi only** if it consistently works (it's faster than cloudscraper)
4. **Cache responses** when possible (built into the HTTP client)

## Debugging

Enable debug logging to see which method is being used:

```bash
node dist/index.js --log_level=debug
```

You'll see logs like:
```
[INFO] Cloudscraper initialized for Cloudflare bypass
[INFO] curl_cffi initialized for Cloudflare bypass
[INFO] Using dual bypass strategy: cloudscraper with curl_cffi fallback
[DEBUG] Using cloudscraper for GET https://example.com/
[INFO] Cloudscraper failed: Failed to obtain CSRF token
[INFO] Marking cloudscraper as failed, will use curl_cffi for future requests
[INFO] Falling back to curl_cffi...
[DEBUG] Using curl_cffi for GET https://example.com/
```

## Architecture

### Why Two Methods?

Different sites and configurations work better with different bypass methods. By supporting both:
- **Increased reliability**: If one fails, the other might work
- **Automatic adaptation**: System learns which method works best
- **Future-proofing**: As Cloudflare evolves, having multiple strategies ensures continued operation

### Why Fallback Instead of Random Selection?

Cloudscraper is tried first because:
1. It's more mature and stable
2. Works for most cases
3. Only when it consistently fails (like CSRF errors) do we switch to curl_cffi

curl_cffi is the fallback because:
1. It's faster
2. Better browser impersonation
3. More effective against aggressive protection

### Session Persistence

Both methods maintain sessions:
- **Cookies** are stored in Node.js memory and passed to Python scripts
- **CSRF tokens** are extracted and reused
- **Cloudflare cookies** (cf_clearance) are maintained across requests

## Best Practices

1. **Use the default "both" method** unless you have a specific reason not to
2. **Enable debug logging** during initial setup to understand which method is being used
3. **Monitor logs** for consistent failures and adjust configuration if needed
4. **Keep Python libraries updated** to handle new Cloudflare challenges:
   ```bash
   pip3 install --upgrade cloudscraper curl-cffi
   ```
5. **Test both methods manually** if experiencing issues to isolate the problem

## Performance Benchmarks

Typical response times (including Cloudflare challenge):

| Scenario | Cloudscraper | curl_cffi | Fallback (both) |
|----------|-------------|-----------|-----------------|
| First request (cold) | 500-1000ms | 300-600ms | 500-1000ms |
| Subsequent requests | 200-500ms | 100-300ms | 100-300ms* |
| After fallback | N/A | 100-300ms | 100-300ms |

*After fallback, only curl_cffi is used, so performance matches curl_cffi

## Migration Guide

### From Manual Cookies

If you were using manual cookies:

```json
// Old
{
  "site": "https://example.com/",
  "initial_cookies": "cf_clearance=abc123; session=xyz"
}

// New (automatic bypass)
{
  "site": "https://example.com/",
  "bypass_method": "both"
}
```

### From Cloudscraper Only

If you had `use_cloudscraper: true`:

```json
// Old
{
  "use_cloudscraper": true,
  "site": "https://example.com/"
}

// New (with fallback - recommended)
{
  "bypass_method": "both",
  "site": "https://example.com/"
}

// Or keep cloudscraper only
{
  "bypass_method": "cloudscraper",
  "site": "https://example.com/"
}
```

Note: `use_cloudscraper: true` still works but is deprecated. It now defaults to `bypass_method: "both"` for better reliability.

## Credits

- [cloudscraper](https://github.com/VeNoMouS/cloudscraper) by VeNoMouS
- [curl_cffi](https://github.com/yifeikong/curl_cffi) by yifeikong
- Dual bypass strategy implemented for Discourse MCP / Nitan MCP

## See Also

- [README.md](README.md) - Main project documentation
