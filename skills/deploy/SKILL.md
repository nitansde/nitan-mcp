# Deploy nitan-mcp

Deployment automation for nitan-mcp to GCP + poke.com.

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
| DISCOURSE_SITE | No | uscardforum.com | Discourse site URL |
| NITAN_PORT | No | 3001 | HTTP server port |
| NITAN_BRANCH | No | main | Git branch to deploy |
| POKE_SESSION_TOKEN | Yes* | - | poke.com session cookie |
| MCP_ENDPOINT | Yes* | - | MCP server URL |
| CONNECTION_NAME | No | USCardForum MCP | poke.com display name |

*Required for setup-poke.sh only.
