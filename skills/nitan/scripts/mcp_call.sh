#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <tool_name> [json_args]" >&2
  exit 1
fi

TOOL_NAME="$1"
ARGS_JSON='{}'
if [[ $# -ge 2 ]]; then
  ARGS_JSON="$2"
fi
MCP_PACKAGE="${NITAN_MCP_PACKAGE:-nitan-mcp}"
MCP_ALLOW_INSTALL="${NITAN_MCP_ALLOW_INSTALL:-0}"

python3 - "$TOOL_NAME" "$ARGS_JSON" "$MCP_PACKAGE" "$MCP_ALLOW_INSTALL" <<'PY'
import json
import os
import select
import subprocess
import sys
import time

tool_name = sys.argv[1]
args_text = sys.argv[2]
mcp_package = sys.argv[3]
allow_install = sys.argv[4] == "1"
response_timeout = int(os.getenv("NITAN_MCP_RESPONSE_TIMEOUT", "120"))

try:
    tool_args = json.loads(args_text)
except json.JSONDecodeError as e:
    print(f"Invalid json_args: {e}", file=sys.stderr)
    sys.exit(2)


def send_line(proc, obj):
    proc.stdin.write((json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8"))
    proc.stdin.flush()


def read_json_line(proc, timeout_s):
    fd = proc.stdout.fileno()
    deadline = time.time() + timeout_s
    while True:
        remaining = deadline - time.time()
        if remaining <= 0:
            raise TimeoutError("Timed out waiting for MCP output")
        ready, _, _ = select.select([fd], [], [], remaining)
        if not ready:
            continue
        line = proc.stdout.readline()
        if not line:
            raise EOFError("MCP server closed stdout")
        text = line.decode("utf-8", errors="replace").strip()
        if not text:
            continue
        try:
            return json.loads(text)
        except Exception:
            # ignore non-JSON chatter on stdout just in case
            continue


def wait_for_id(proc, req_id, timeout_s):
    deadline = time.time() + timeout_s
    while True:
        remaining = deadline - time.time()
        if remaining <= 0:
            raise TimeoutError(f"No MCP response for id={req_id} within {timeout_s}s")
        msg = read_json_line(proc, max(1, int(remaining)))
        if isinstance(msg, dict) and msg.get("id") == req_id:
            return msg


cmd = ["npx"]
if allow_install:
    cmd += ["-y", mcp_package]
else:
    cmd += ["--no-install", mcp_package]

proc = subprocess.Popen(
    cmd,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=sys.stderr,
)

try:
    send_line(proc, {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "nitan-skill-shell", "version": "1.0.0"}
        }
    })
    init_res = wait_for_id(proc, 1, response_timeout)
    if "error" in init_res:
        print(json.dumps(init_res["error"], ensure_ascii=False, indent=2), file=sys.stderr)
        sys.exit(3)

    send_line(proc, {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

    send_line(proc, {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": tool_args},
    })
    call_res = wait_for_id(proc, 2, response_timeout)

    if "error" in call_res:
        print(json.dumps(call_res["error"], ensure_ascii=False, indent=2), file=sys.stderr)
        sys.exit(4)

    print(json.dumps(call_res.get("result", {}), ensure_ascii=False, indent=2))
except (TimeoutError, EOFError) as exc:
    print(f"Failed to communicate with local MCP server: {exc}", file=sys.stderr)
    if proc.poll() not in (None, 0):
        print(f"Failed MCP package: {mcp_package}", file=sys.stderr)
    sys.exit(6)
finally:
    try:
        proc.terminate()
    except Exception:
        pass
PY
