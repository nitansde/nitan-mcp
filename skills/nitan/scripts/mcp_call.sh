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

python3 - "$TOOL_NAME" "$ARGS_JSON" <<'PY'
import json
import subprocess
import sys


def send_msg(proc, obj):
    payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    header = f"Content-Length: {len(payload)}\r\n\r\n".encode("ascii")
    proc.stdin.write(header + payload)
    proc.stdin.flush()


def read_msg(proc):
    # Read headers
    headers = {}
    line = proc.stdout.readline()
    if not line:
        raise EOFError("MCP server closed stdout")
    while line not in (b"\r\n", b"\n"):
        if b":" in line:
            k, v = line.decode("utf-8", errors="replace").split(":", 1)
            headers[k.strip().lower()] = v.strip()
        line = proc.stdout.readline()
        if not line:
            raise EOFError("Unexpected EOF while reading MCP headers")

    length = int(headers.get("content-length", "0"))
    if length <= 0:
        raise RuntimeError("Missing/invalid Content-Length in MCP message")

    body = proc.stdout.read(length)
    if not body or len(body) < length:
        raise EOFError("Unexpected EOF while reading MCP body")
    return json.loads(body.decode("utf-8", errors="replace"))


def wait_for_response(proc, req_id, limit=200):
    for _ in range(limit):
        msg = read_msg(proc)
        if isinstance(msg, dict) and msg.get("id") == req_id:
            return msg
    raise TimeoutError(f"No MCP response for id={req_id}")


tool_name = sys.argv[1]
args_text = sys.argv[2]

try:
    tool_args = json.loads(args_text)
except json.JSONDecodeError as e:
    print(f"Invalid json_args: {e}", file=sys.stderr)
    sys.exit(2)

server_cmd = ["npx", "--no-install", "nitan-mcp"]

try:
    proc = subprocess.Popen(
        server_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=sys.stderr,
    )
except FileNotFoundError:
    print("Failed to find npx in PATH.", file=sys.stderr)
    print("Install Node.js and npm first, then install nitan-mcp globally:", file=sys.stderr)
    print("  npm install -g @nitansde/mcp@latest", file=sys.stderr)
    sys.exit(5)

try:
    try:
        send_msg(proc, {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "nitan-skill-shell", "version": "1.0.0"}
            }
        })
        init_res = wait_for_response(proc, 1)
        if "error" in init_res:
            print(json.dumps(init_res["error"], ensure_ascii=False, indent=2), file=sys.stderr)
            sys.exit(3)

        send_msg(proc, {"jsonrpc": "2.0", "method": "notifications/initialized"})

        send_msg(proc, {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": tool_args}
        })
        call_res = wait_for_response(proc, 2)

        if "error" in call_res:
            print(json.dumps(call_res["error"], ensure_ascii=False, indent=2), file=sys.stderr)
            sys.exit(4)

        print(json.dumps(call_res.get("result", {}), ensure_ascii=False, indent=2))
    except (EOFError, RuntimeError, TimeoutError) as exc:
        print(f"Failed to communicate with local MCP server: {exc}", file=sys.stderr)
        if proc.poll() not in (None, 0):
            print("Make sure nitan-mcp is installed globally and available to npx without install:", file=sys.stderr)
            print("  npm install -g @nitansde/mcp@latest", file=sys.stderr)
            print("Then retry this command.", file=sys.stderr)
        sys.exit(6)
finally:
    try:
        proc.terminate()
    except Exception:
        pass
PY
