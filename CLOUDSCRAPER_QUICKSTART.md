# Quick Start: Cloudscraper Integration

## Installation

1. **Install Python dependencies:**
   ```bash
   pip3 install cloudscraper
   ```

2. **Build the project:**
   ```bash
   pnpm build
   ```

## Usage

### Method 1: Using a profile file (Recommended)

Create `cloudscraper.json`:
```json
{
  "use_cloudscraper": true,
  "site": "https://www.uscartool.com",
  "log_level": "debug"
}
```

Run:
```bash
node dist/index.js --profile cloudscraper.json
```

### Method 2: Command line

```bash
node dist/index.js --use_cloudscraper=true --site=https://www.uscartool.com --log_level=debug
```

## What Happens

- ✅ Automatically bypasses Cloudflare protection
- ✅ Solves JavaScript challenges
- ✅ Maintains cookies across requests
- ✅ No manual cookie management needed

## Testing

To test if cloudscraper is working, look for this in the logs:
```
[INFO] Cloudscraper enabled for bypassing Cloudflare
[DEBUG] Using cloudscraper for GET https://...
```

## Troubleshooting

**Error: "Python not found"**
```bash
# Check Python installation
python3 --version

# If not installed, install Python 3
# macOS: brew install python3
# Ubuntu: sudo apt install python3
# Windows: Download from python.org
```

**Error: "No module named 'cloudscraper'"**
```bash
pip3 install cloudscraper
```

**Custom Python path:**
```json
{
  "use_cloudscraper": true,
  "python_path": "/usr/local/bin/python3.11"
}
```

## Performance Note

Cloudscraper is slightly slower than native fetch (adds ~100-500ms per request) but provides automatic Cloudflare bypass without manual cookie management.
