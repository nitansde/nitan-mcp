#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARGS='{}'
if [[ $# -ge 1 ]]; then
  ARGS="$1"
fi
"$DIR/mcp_call.sh" "discourse_list_top_topics" "$ARGS"
