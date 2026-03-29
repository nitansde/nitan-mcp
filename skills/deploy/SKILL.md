# Deploy nitan-mcp

Deployment automation for nitan-mcp to GCP + poke.com.

## Authentication: URL authorization flow (required before first deploy)

**Never ask the user for their username or password.** Use the URL-based Discourse OAuth flow — works on any server (GCP, Docker, Oracle Cloud) without a local browser, and exposes no credentials in chat.

**Step 1 — Generate keypair + authorization URL on the server:**

```bash
node --security-revert=CVE-2023-46809 -e "
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const nonce = Date.now().toString();
const clientId = 'nitan-mcp-' + nonce;
const url = new URL('https://www.uscardforum.com/user-api-key/new');
url.search = new URLSearchParams({ application_name: 'Nitan MCP', client_id: clientId, scopes: 'read,write', public_key: publicKey, nonce }).toString();
writeFileSync('/tmp/nitan_private.pem', privateKey);
writeFileSync('/tmp/nitan_meta.json', JSON.stringify({ nonce, clientId }));
console.log(url.toString());
" 2>/dev/null
```

**Step 2 — Send the URL to the user via the current chat channel (Discord, Claude Code, etc.):**

The user opens the URL in their browser, logs in to uscardforum.com, and clicks "Authorize". The browser redirects to `discourse://auth_redirect?payload=XXXX` — since no desktop app handles that scheme, the redirect fails visibly. The user copies the `payload=` value from the address bar and pastes it back in chat.

**Step 3 — Decrypt payload and save profile:**

```bash
PAYLOAD="<value pasted by user>"
node --security-revert=CVE-2023-46809 -e "
import { privateDecrypt, constants } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const key = readFileSync('/tmp/nitan_private.pem', 'utf8');
const meta = JSON.parse(readFileSync('/tmp/nitan_meta.json', 'utf8'));
const buf = Buffer.from(process.env.PAYLOAD.replace(/\s/g,''), 'base64');
const result = JSON.parse(privateDecrypt({ key, padding: constants.RSA_PKCS1_PADDING }, buf).toString());
const profilePath = process.env.NITAN_PROFILE_PATH || 'profile.json';
let profile = {};
try { profile = JSON.parse(readFileSync(profilePath, 'utf8')); } catch {}
if (!profile.auth_pairs) profile.auth_pairs = [];
profile.auth_pairs = profile.auth_pairs.filter(p => p.site !== 'https://www.uscardforum.com/');
profile.auth_pairs.push({ site: 'https://www.uscardforum.com/', user_api_key: result.key, user_api_client_id: meta.clientId });
writeFileSync(profilePath, JSON.stringify(profile, null, 2));
console.log('Saved to', profilePath);
" 2>/dev/null
rm /tmp/nitan_private.pem /tmp/nitan_meta.json
```

The saved `profile.json` is what `NITAN_PROFILE` points to in deploy-gcp.sh. Run this once before deploying, or re-run when a token expires (server returns 403).

## Scripts

### deploy-gcp.sh
Deploys nitan-mcp to a GCP VM with Tailscale Funnel exposure.

```bash
GCP_PROJECT=my-project GCP_INSTANCE=my-vm ./deploy-gcp.sh
```

### setup-poke.sh
Registers the MCP endpoint as a connection on poke.com.

```bash
POKE_SESSION_TOKEN=xxx MCP_ENDPOINT=https://host.ts.net/mcp ./setup-poke.sh
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| GCP_PROJECT | Yes | - | GCP project ID |
| GCP_INSTANCE | Yes | - | VM instance name |
| GCP_ZONE | No | us-west1-c | VM zone |
| DISCOURSE_SITE | No | https://www.uscardforum.com | Discourse site URL (must include protocol) |
| NITAN_PORT | No | 3001 | HTTP server port |
| NITAN_BRANCH | No | main | Git branch to deploy |
| NITAN_PROFILE | No | profile.json | Profile file with auth_pairs |
| POKE_SESSION_TOKEN | Yes* | - | poke.com session cookie |
| MCP_ENDPOINT | Yes* | - | MCP server URL |
| CONNECTION_NAME | No | USCardForum MCP | poke.com display name |

*Required for setup-poke.sh only.
