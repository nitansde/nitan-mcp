import { z } from "zod";
export async function tryRegisterRemoteTools(server, siteState, logger) {
    try {
        const { client } = siteState.ensureSelectedSite();
        const tools = (await client.get(`/ai/tools`));
        const list = Array.isArray(tools) ? tools : tools?.tools || [];
        if (!Array.isArray(list) || list.length === 0)
            return;
        const usedNames = new Set();
        const makeSafeName = (rawName) => {
            const base = (rawName && typeof rawName === 'string' ? rawName : 'tool').trim();
            // Replace any disallowed chars (including dots/spaces) with underscore
            let safe = base.replace(/[^a-zA-Z0-9_-]/g, "_");
            // Prefix with remote_ to avoid collisions and make origin clear
            if (!safe.startsWith("remote_"))
                safe = `remote_${safe}`;
            // Collapse consecutive underscores
            safe = safe.replace(/_+/g, "_");
            // Enforce max length 128
            if (safe.length > 128)
                safe = safe.slice(0, 128);
            if (!safe)
                safe = "remote_tool";
            // Ensure uniqueness
            let candidate = safe;
            let suffix = 2;
            while (usedNames.has(candidate)) {
                const extra = `_${suffix}`;
                candidate = safe.slice(0, Math.max(1, 128 - extra.length)) + extra;
                suffix++;
            }
            usedNames.add(candidate);
            return candidate;
        };
        for (const t of list) {
            const safeName = makeSafeName(t.name);
            const schema = jsonSchemaToZod(t.inputSchema) ?? z.object({}).strict();
            server.registerTool(safeName, {
                title: t.name,
                description: t.description || "",
                inputSchema: schema.shape ?? {},
            }, async (args, _extra) => {
                try {
                    const { client } = siteState.ensureSelectedSite();
                    const res = (await client.post(`/ai/tools/${encodeURIComponent(t.name)}/call`, {
                        arguments: args,
                        context: {},
                    }));
                    const result = res?.result ?? res;
                    const details = res?.details;
                    const links = extractLinks(details);
                    const lines = [String(result || "")];
                    if (links.length) {
                        lines.push("\nArtifacts:");
                        for (const l of links)
                            lines.push(`- [${l.name || l.url}](${l.url})`);
                    }
                    return { content: [{ type: "text", text: lines.join("\n") }] };
                }
                catch (e) {
                    return { content: [{ type: "text", text: `Remote tool ${t.name} failed: ${e?.message || String(e)}` }], isError: true };
                }
            });
        }
        logger.info(`Registered ${list.length} remote tool(s) from Tool Execution API.`);
    }
    catch (e) {
        logger.debug(`No Tool Execution API detected: ${e?.message || String(e)}`);
    }
}
function extractLinks(details) {
    const items = [];
    if (!details)
        return items;
    const push = (x) => {
        if (x && typeof x.url === "string")
            items.push({ url: x.url, name: x.name });
    };
    if (Array.isArray(details?.artifacts))
        details.artifacts.forEach(push);
    return items;
}
function jsonSchemaToZod(schema) {
    if (!schema || typeof schema !== "object")
        return undefined;
    if (schema.type === "object" && schema.properties) {
        const shape = {};
        const req = Array.isArray(schema.required) ? schema.required : [];
        for (const [k, v] of Object.entries(schema.properties)) {
            let zt;
            if (v.type === "string")
                zt = z.string();
            else if (v.type === "number")
                zt = z.number();
            else if (v.type === "integer")
                zt = z.number().int();
            else if (v.type === "boolean")
                zt = z.boolean();
            else if (v.type === "object" && v.properties)
                zt = jsonSchemaToZod(v);
            else if (v.type === "array" && v.items) {
                const inner = jsonSchemaToZod(v.items) || z.any();
                zt = z.array(inner);
            }
            else {
                zt = z.any();
            }
            if (v.description && zt && zt.describe) {
                zt = zt.describe(v.description);
            }
            if (!req.includes(k))
                zt = zt.optional();
            shape[k] = zt;
        }
        return z.object(shape);
    }
    // primitives
    if (schema.type === "string")
        return z.string();
    if (schema.type === "number")
        return z.number();
    if (schema.type === "integer")
        return z.number().int();
    if (schema.type === "boolean")
        return z.boolean();
    return undefined;
}
//# sourceMappingURL=tool_exec_api.js.map