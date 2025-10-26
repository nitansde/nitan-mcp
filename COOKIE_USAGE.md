# Using Browser Cookies with Discourse MCP

If your target Discourse site is protected by Cloudflare or other bot detection systems, you can provide browser cookies to bypass these protections.

## How to Get Your Cookies

### Method 1: Chrome/Edge DevTools
1. Visit the Discourse site in your browser and log in (if required)
2. Open DevTools (F12 or Right-click → Inspect)
3. Go to **Application** tab (or **Storage** in Firefox)
4. Click **Cookies** in the left sidebar
5. Select your site's domain
6. Copy the cookies you need (typically `cf_clearance`, `__cfduid`, and any session cookies)

### Method 2: Browser Extensions
Use extensions like "EditThisCookie" or "Cookie-Editor" to export cookies in a readable format.

## Usage Examples

### Command Line

**Option 1: Using `--auth_pairs` flag** (Make sure to quote the JSON properly)
```bash
node dist/index.js --auth_pairs '[{"site":"https://example.com","cookies":"cf_clearance=6YWUaEjpxj0F9IuH8pEWJHMPwge4i2CTR014s..."}]'
```

**Option 2: Use a profile file** (Recommended - easier to manage)
```bash
node dist/index.js --profile cookies.json
```

### Profile File (Recommended)
Create a `cookies.json` file:
```json
{
  "auth_pairs": [
    {
      "site": "https://www.uscardforum.com/",
      "cookies": "cf_clearance=6YWUaEjpxj0F9IuH8pEWJHMPwge4i2CTR014s..."
    }
  ],
  "log_level": "debug"
}
```

Run with:
```bash
node dist/index.js --profile cookies.json
```

### Real Example with Actual Cookie Values
Here's how you'd format the `cf_clearance` cookie from your browser:
```json
{
  "auth_pairs": [
    {
      "site": "https://www.uscardforum.com/",
      "cookies": "cf_clearance=6YWUaEjpxj0F9IuH8pEWJHMPwge4i2CTR014s..."
    }
  ]
}
```

**Important**: Copy the full `cf_clearance` value from your browser - the `...` in examples above represents the truncated value.

**If you need to be logged in**: Add other cookies like `_forum_session` or `_t`, separated by semicolons:
```json
"cookies": "cf_clearance=...; _forum_session=...; _t=..."
```

### Combining Cookies with API Keys
You can use both cookies and API authentication together:
```json
{
  "auth_pairs": [
    {
      "site": "https://example.com",
      "cookies": "cf_clearance=6YWUaEjpxj0F9IuH8pEWJHMPwge4i2CTR014s...",
      "api_key": "your-api-key",
      "api_username": "system"
    }
  ]
}
```

## Important Notes

1. **Cookie Format**: Cookies must be in the format `name1=value1; name2=value2` (semicolon-separated)
2. **Cookie Expiry**: Cookies may expire after some time. If you start getting 403 errors again, refresh your cookies
3. **Security**: Keep your cookies private! They provide access to your account. Use a profile file and don't commit it to version control
4. **Site-Specific**: Cookies are automatically matched to the correct site from your `auth_pairs` configuration
5. **Persistence**: The client will also automatically store and reuse any cookies set by the server during the session

## Common Cloudflare Cookies

- `cf_clearance`: **Main Cloudflare challenge cookie** - This is typically the only one you need to bypass bot protection
- `_t`: Session/tracking token (only needed if you need to be logged in)
- `_forum_session`: Forum session cookie for Discourse sites (only needed if you need to be logged in)
- `__cfduid`: Cloudflare user identification (deprecated, not needed)
- `__cf_bm`: Bot management cookie (may be present on some sites)

**Tip**: Start with just `cf_clearance`. Only add other cookies if you need to access logged-in features or if you still get 403 errors.

## Troubleshooting

**Still getting 403 errors?**
- Make sure you copied ALL relevant cookies
- Verify your cookie format (check for extra spaces or missing semicolons)
- Try visiting the site in your browser again and re-copying the cookies
- Enable debug logging (`--log_level=debug`) to see what's happening

**Cookies expire quickly?**
- Some sites use short-lived cookies
- You may need to refresh cookies periodically
- Consider using User API Keys instead if available
