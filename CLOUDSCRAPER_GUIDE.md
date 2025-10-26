# Cloudscraper Integration Guide

This project can optionally use [cloudscraper](https://github.com/VeNoMouS/cloudscraper) (a Python library) to bypass Cloudflare protection automatically.

## Prerequisites

1. **Python 3.7 or higher** installed on your system
2. **pip** (Python package manager)

## Installation

### Step 1: Install Python Dependencies

```bash
pip3 install -r requirements.txt
```

Or install cloudscraper directly:

```bash
pip3 install cloudscraper
```

### Step 2: Verify Installation

Test that cloudscraper is installed correctly:

```bash
python3 -c "import cloudscraper; print('Cloudscraper installed successfully')"
```

## Usage

### Enable Cloudscraper

Add `use_cloudscraper: true` to your profile or use the `--use_cloudscraper` flag:

**Using a profile file:**

```json
{
  "use_cloudscraper": true,
  "python_path": "python3",
  "auth_pairs": [
    {
      "site": "https://www.uscardforum.com/"
    }
  ]
}
```

**Using command line:**

```bash
node dist/index.js --use_cloudscraper=true --site=https://www.uscardforum.com/
```

### Custom Python Path

If your Python executable is not `python3`, specify the path:

```json
{
  "use_cloudscraper": true,
  "python_path": "/usr/local/bin/python3.11"
}
```

Or via command line:

```bash
node dist/index.js --use_cloudscraper=true --python_path=/usr/local/bin/python3.11
```

## How It Works

When `use_cloudscraper` is enabled:

1. Instead of using Node.js's native `fetch`, the HTTP client spawns a Python subprocess
2. The Python script uses cloudscraper to make the request, which automatically:
   - Solves Cloudflare JavaScript challenges
   - Handles Cloudflare cookies and tokens
   - Mimics a real browser behavior
3. The response is passed back to Node.js and processed normally
4. Cookies are maintained across requests

## Advantages

- **Automatic Cloudflare bypass**: No need to manually manage `cf_clearance` cookies
- **Handles JavaScript challenges**: Solves Cloudflare's browser check automatically
- **Persistent sessions**: Cookies are maintained across all requests
- **No browser required**: Works in headless environments

## Disadvantages

- **Slower than native fetch**: Spawning Python processes adds overhead (~100-500ms per request)
- **Python dependency**: Requires Python to be installed
- **Less stable**: Cloudflare may update their protection, requiring cloudscraper updates

## Troubleshooting

### "Python not found" error

Make sure Python 3 is installed and accessible:

```bash
python3 --version
```

If you get "command not found", install Python 3 from [python.org](https://www.python.org/downloads/)

### "ModuleNotFoundError: No module named 'cloudscraper'"

Install cloudscraper:

```bash
pip3 install cloudscraper
```

### Still getting 403 errors

- Verify cloudscraper is working: `python3 src/http/cloudscraper_wrapper.py`
- Try updating cloudscraper: `pip3 install --upgrade cloudscraper`
- Check the debug logs: `--log_level=debug`
- Some sites may use advanced protection that even cloudscraper can't bypass

### Performance issues

Cloudscraper spawns a Python process for each request, which can be slow. For better performance:

1. Use cloudscraper only for sites with Cloudflare protection
2. Consider using the manual cookie method for sites you access frequently
3. Cache responses when possible

## Comparison: Cloudscraper vs Manual Cookies

| Feature | Cloudscraper | Manual Cookies |
|---------|-------------|----------------|
| Setup complexity | Medium (requires Python) | Low (just copy cookies) |
| Maintenance | Low (automatic updates) | High (cookies expire) |
| Performance | Slower (~100-500ms overhead) | Fast (native fetch) |
| Reliability | High (automatic JS solving) | Medium (cookies expire) |
| Works with | Most Cloudflare sites | Sites with stable cookies |

## Recommended Setup

For best results, combine both methods:

```json
{
  "use_cloudscraper": true,
  "auth_pairs": [
    {
      "site": "https://cloudflare-protected-site.com"
    }
  ]
}
```

Cloudscraper will handle Cloudflare challenges automatically, and cookies will be maintained for subsequent requests.
