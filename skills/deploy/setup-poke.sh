#!/usr/bin/env bash
set -euo pipefail

# Register nitan-mcp as an MCP connection on poke.com
#
# Required env vars:
#   POKE_SESSION_TOKEN - poke.com session cookie value
#   MCP_ENDPOINT       - MCP server URL (e.g., https://host.ts.net/mcp)
#
# Optional env vars:
#   CONNECTION_NAME    - Display name (default: USCardForum MCP)

CONNECTION_NAME="${CONNECTION_NAME:-USCardForum MCP}"

if [[ -z "${POKE_SESSION_TOKEN:-}" || -z "${MCP_ENDPOINT:-}" ]]; then
  echo "Usage: POKE_SESSION_TOKEN=<token> MCP_ENDPOINT=<url> $0"
  echo ""
  echo "Required:"
  echo "  POKE_SESSION_TOKEN - poke.com session cookie (_poke_session value)"
  echo "  MCP_ENDPOINT       - MCP server URL (e.g., https://host.ts.net/mcp)"
  echo ""
  echo "Optional:"
  echo "  CONNECTION_NAME    - Display name (default: USCardForum MCP)"
  exit 1
fi

echo "==> Creating MCP connection on poke.com..."
RESPONSE=$(curl -sf -X POST "https://poke.com/api/v1/mcp/connections" \
  -H "Content-Type: application/json" \
  -H "Cookie: _poke_session=${POKE_SESSION_TOKEN}" \
  -d "{
    \"name\": \"${CONNECTION_NAME}\",
    \"url\": \"${MCP_ENDPOINT}\",
    \"transport\": \"streamable-http\"
  }")

if echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null | grep -q .; then
  CONNECTION_ID=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['id'])")
  echo "==> Connection created! ID: ${CONNECTION_ID}"
  echo ""
  echo "==> Syncing tools..."
  SYNC_RESPONSE=$(curl -sf -X POST "https://poke.com/api/v1/mcp/connections/${CONNECTION_ID}/sync" \
    -H "Cookie: _poke_session=${POKE_SESSION_TOKEN}" || echo '{}')
  TOOL_COUNT=$(echo "$SYNC_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('tools',[])))" 2>/dev/null || echo "?")
  echo "==> Synced ${TOOL_COUNT} tools."
  echo ""
  echo "Done! Connection '${CONNECTION_NAME}' is live on poke.com."
else
  echo "==> Error creating connection:"
  echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
  exit 1
fi
