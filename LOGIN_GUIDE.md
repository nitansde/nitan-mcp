# Login Support with Cloudscraper

The cloudscraper integration now supports automatic login to Discourse forums, allowing you to access private content and authenticated features.

## Features

- ✅ **Automatic login** - Logs in automatically on first request
- ✅ **Session persistence** - Maintains login across all requests
- ✅ **CSRF token handling** - Automatically manages CSRF tokens
- ✅ **2FA support** - Works with two-factor authentication
- ✅ **Cookie management** - Stores and reuses session cookies
- ✅ **Access private content** - View private topics, categories, and user information

## Usage

### Basic Login

Add `username` and `password` to your `auth_pairs` configuration:

```json
{
  "use_cloudscraper": true,
  "site": "https://www.uscardforum.com/",
  "auth_pairs": [
    {
      "site": "https://www.uscardforum.com/",
      "username": "your-username",
      "password": "your-password"
    }
  ]
}
```

### With Two-Factor Authentication

If your account has 2FA enabled, add the `second_factor_token`:

```json
{
  "use_cloudscraper": true,
  "site": "https://www.uscardforum.com/",
  "auth_pairs": [
    {
      "site": "https://www.uscardforum.com/",
      "username": "your-username",
      "password": "your-password",
      "second_factor_token": "123456"
    }
  ]
}
```

**Note**: The 2FA token expires quickly, so you may need to update it frequently.

### Multiple Sites with Different Credentials

You can configure different credentials for different sites:

```json
{
  "use_cloudscraper": true,
  "auth_pairs": [
    {
      "site": "https://forum1.com",
      "username": "user1",
      "password": "pass1"
    },
    {
      "site": "https://forum2.com",
      "username": "user2",
      "password": "pass2"
    }
  ]
}
```

### Combining Login with Cookies

You can provide both login credentials and cookies. Login will be attempted first:

```json
{
  "use_cloudscraper": true,
  "site": "https://www.uscardforum.com/",
  "auth_pairs": [
    {
      "site": "https://www.uscardforum.com/",
      "username": "your-username",
      "password": "your-password",
      "cookies": "cf_clearance=..."
    }
  ]
}
```

## How It Works

1. **First Request**: When the first HTTP request is made, cloudscraper checks if login credentials are provided
2. **CSRF Token**: Fetches CSRF token from `/session/csrf.json`
3. **Login**: Posts credentials to `/session.json` with the CSRF token
4. **Session Storage**: Stores session cookies automatically
5. **Subsequent Requests**: All following requests use the authenticated session

## What You Can Access

With login, you can:

- ✅ View private topics and categories
- ✅ Access user-specific content (bookmarks, notifications)
- ✅ See full user profiles and activity
- ✅ Read content restricted to logged-in users
- ✅ View categories with specific permission requirements

## Security Notes

1. **Store credentials securely**: Use a profile file (not command line) and don't commit it to version control
2. **Use `.gitignore`**: Add your profile file to `.gitignore`:
   ```bash
   echo "cloudscraper-login.json" >> .gitignore
   echo "*-login.json" >> .gitignore
   ```
3. **File permissions**: Restrict access to your profile file:
   ```bash
   chmod 600 cloudscraper-login.json
   ```
4. **Environment variables**: Consider using environment variables for sensitive data

## Troubleshooting

### Login Failed

**Symptoms**: "Login failed" or "Authentication required" errors

**Solutions**:
1. Verify username and password are correct
2. Check if the account is locked or suspended
3. Ensure the site allows programmatic login
4. Enable debug logging to see detailed error messages:
   ```json
   {
     "log_level": "debug"
   }
   ```

### 2FA Token Invalid

**Symptoms**: "Invalid second factor" error

**Solutions**:
1. Generate a new 2FA token from your authenticator app
2. Update the `second_factor_token` in your profile
3. Note that 2FA tokens expire after 30-60 seconds

### Session Expired

**Symptoms**: Getting 403/401 errors after successful login

**Solutions**:
1. The session may have expired - restart the MCP server to login again
2. The site may have logged you out (e.g., password changed)
3. Check if cookies are being stored properly (look for "Stored cookie" in debug logs)

### CSRF Token Error

**Symptoms**: "Failed to obtain CSRF token" error

**Solutions**:
1. The site may be blocking programmatic access
2. Try with Cloudflare cookie (`cf_clearance`) first
3. Check if the site is accessible at all

## Example: Accessing Private Content

```bash
# Create profile with login
cat > my-login.json <<EOF
{
  "use_cloudscraper": true,
  "site": "https://www.uscardforum.com/",
  "log_level": "info",
  "auth_pairs": [
    {
      "site": "https://www.uscardforum.com/",
      "username": "myusername",
      "password": "mypassword"
    }
  ]
}
EOF

# Restrict permissions
chmod 600 my-login.json

# Run MCP server
node dist/index.js --profile my-login.json
```

You'll see in the logs:
```
[INFO] Cloudscraper enabled for bypassing Cloudflare
[DEBUG] Including login credentials for myusername
[DEBUG] Cloudscraper GET https://www.uscardforum.com//about.json -> 200
[INFO] Tethered to site: https://www.uscardforum.com/
```

## Comparison: Login vs Cookies vs API Keys

| Method | Setup | Access Level | Maintenance |
|--------|-------|--------------|-------------|
| **Login (username/password)** | Medium (credentials needed) | Full user access | Low (automatic session) |
| **Cookies (manual)** | Low (copy from browser) | Same as browser session | High (cookies expire) |
| **API Keys** | High (admin/user key needed) | Variable (depends on key type) | Low (keys don't expire often) |

## Best Practices

1. **Use login for development/testing**: Easy to set up and test
2. **Use API keys for production**: More secure and reliable
3. **Combine with Cloudflare bypass**: Login works with cloudscraper to bypass both Cloudflare and access restrictions
4. **Monitor for errors**: Check logs regularly for authentication issues
5. **Rotate credentials**: Change passwords periodically for security

## Advanced: Programmatic Login Flow

If you're curious about the technical details:

```python
# 1. Warm up session
GET https://site.com/

# 2. Get CSRF token
GET https://site.com/session/csrf.json
Response: {"csrf": "abc123..."}

# 3. Login
POST https://site.com/session.json
Headers:
  X-CSRF-Token: abc123...
  Content-Type: application/json
Body:
  {
    "login": "username",
    "password": "password",
    "remember": true
  }

# 4. Session cookies are stored automatically
# 5. All subsequent requests include session cookies
```

## Related Documentation

- [CLOUDSCRAPER_QUICKSTART.md](CLOUDSCRAPER_QUICKSTART.md) - Quick start guide
- [CLOUDSCRAPER_GUIDE.md](CLOUDSCRAPER_GUIDE.md) - Comprehensive setup guide
- [COOKIE_USAGE.md](COOKIE_USAGE.md) - Manual cookie management (alternative to login)
