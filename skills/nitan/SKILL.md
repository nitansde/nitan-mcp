---
name: nitan
description: Use the Nitan MCP server for uscardforum.com workflows. Trigger this skill when the user asks to search/read/create content on uscardforum through MCP tools, or when they need setup/configuration for the nitan-mcp server in Claude Desktop/OpenClaw-compatible MCP clients.
---

# nitan-mcp skill

Use this skill as a thin bridge to the existing MCP server. Do not reimplement forum logic in the skill.

## Setup checklist

1. Confirm Node.js >= 18.
2. Confirm Python 3.7+ is installed.
3. Install Python deps if Cloudflare bypass is needed:
   - `pip3 install cloudscraper curl-cffi`
4. Use one of these launch forms:
   - `npx -y @nitansde/mcp@latest`
   - `node dist/index.js` (inside this repo)

## MCP client config (Claude Desktop example)

Use this shape.

> `NITAN_USERNAME` and `NITAN_PASSWORD` are optional. Keep them unset for public/read-only access.

```json
{
  "mcpServers": {
    "nitan": {
      "command": "npx",
      "args": ["-y", "@nitansde/mcp@latest"],
      "env": {
        "NITAN_USERNAME": "YOUR_USERNAME",
        "NITAN_PASSWORD": "YOUR_PASSWORD"
      }
    }
  }
}
```

## Operating rules

- Keep MCP behavior as source of truth: all tool behavior comes from the server implementation in `src/`.
- For read-only usage, keep defaults (`read_only=true`, `allow_writes=false`).
- Enable writes only when explicitly requested and credentials are configured.
- If user asks for site switching, use `discourse_select_site` unless server is tethered with `--site`.

## Troubleshooting

- If startup warns about missing Python deps, install from `requirements.txt`.
- If authentication fails, verify `NITAN_USERNAME` / `NITAN_PASSWORD` or `auth_pairs`.
- If no remote AI tools appear, check whether target Discourse has `/ai/tools`; uscardforum may not expose it.
