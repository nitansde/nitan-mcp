#!/usr/bin/env bash
set -euo pipefail

# Deploy nitan-mcp to a GCP VM with Tailscale Funnel
#
# Required env vars:
#   GCP_PROJECT   - GCP project ID
#   GCP_INSTANCE  - VM instance name
#
# Optional env vars:
#   GCP_ZONE      - VM zone (default: us-west1-c)
#   DISCOURSE_SITE - Discourse site URL (default: uscardforum.com)
#   NITAN_PORT    - HTTP server port (default: 3001)
#   NITAN_BRANCH  - Git branch to deploy (default: main)

GCP_ZONE="${GCP_ZONE:-us-west1-c}"
DISCOURSE_SITE="${DISCOURSE_SITE:-uscardforum.com}"
NITAN_PORT="${NITAN_PORT:-3001}"
NITAN_BRANCH="${NITAN_BRANCH:-main}"

if [[ -z "${GCP_PROJECT:-}" || -z "${GCP_INSTANCE:-}" ]]; then
  echo "Usage: GCP_PROJECT=<project> GCP_INSTANCE=<instance> $0"
  echo ""
  echo "Required:"
  echo "  GCP_PROJECT   - GCP project ID"
  echo "  GCP_INSTANCE  - VM instance name"
  echo ""
  echo "Optional:"
  echo "  GCP_ZONE       - VM zone (default: us-west1-c)"
  echo "  DISCOURSE_SITE - Discourse site (default: uscardforum.com)"
  echo "  NITAN_PORT     - HTTP port (default: 3001)"
  echo "  NITAN_BRANCH   - Git branch (default: main)"
  exit 1
fi

SSH="gcloud compute ssh ${GCP_INSTANCE} --project=${GCP_PROJECT} --zone=${GCP_ZONE} --command"

echo "==> Checking Node.js on ${GCP_INSTANCE}..."
$SSH "command -v node || (curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs)"

echo "==> Installing/updating nitan-mcp..."
$SSH "cd ~ && if [ -d nitan-mcp ]; then cd nitan-mcp && git fetch origin && git checkout ${NITAN_BRANCH} && git pull origin ${NITAN_BRANCH} && npm install; else git clone -b ${NITAN_BRANCH} https://github.com/s546126/nitan-mcp.git && cd nitan-mcp && npm install; fi"

echo "==> Building..."
$SSH "cd ~/nitan-mcp && npm run build 2>/dev/null || npx tsc"

echo "==> Checking for profile.json (User API Key)..."
HAS_PROFILE=$($SSH "test -f ~/nitan-mcp/profile.json && echo yes || echo no")
if [[ "$HAS_PROFILE" == "no" ]]; then
  echo ""
  echo "*** No profile.json found. Generating User API Key... ***"
  echo "*** You will need to complete OAuth authorization in your browser. ***"
  echo ""
  gcloud compute ssh "${GCP_INSTANCE}" --project="${GCP_PROJECT}" --zone="${GCP_ZONE}" -- \
    "cd ~/nitan-mcp && node dist/user-api-key-generator.js --site=${DISCOURSE_SITE}"
  echo ""
  echo "*** After authorizing, profile.json should be created. ***"
fi

echo "==> Stopping existing nitan-mcp tmux session (if any)..."
$SSH "tmux kill-session -t nitan-mcp 2>/dev/null || true"

echo "==> Starting nitan-mcp HTTP server in tmux..."
$SSH "cd ~/nitan-mcp && tmux new-session -d -s nitan-mcp 'node dist/index.js --site=${DISCOURSE_SITE} --transport=http --port=${NITAN_PORT} --http-allow-reuse 2>&1 | tee /tmp/nitan-mcp.log'"

echo "==> Waiting for server to start..."
sleep 3
$SSH "curl -sf http://localhost:${NITAN_PORT}/ >/dev/null 2>&1 && echo 'Server is running!' || echo 'Warning: server may not be ready yet'"

echo "==> Configuring Tailscale Funnel on port ${NITAN_PORT}..."
$SSH "sudo tailscale funnel ${NITAN_PORT}"

echo ""
echo "==> Deployment complete!"
HOSTNAME=$($SSH "tailscale status --json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[\"Self\"][\"DNSName\"].rstrip(\".\"))'" 2>/dev/null || echo "<tailscale-hostname>")
echo "    MCP endpoint: https://${HOSTNAME}/mcp"
echo ""
echo "    To register with poke.com, run:"
echo "    POKE_SESSION_TOKEN=<token> MCP_ENDPOINT=https://${HOSTNAME}/mcp ./setup-poke.sh"
