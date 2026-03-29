import { z } from "zod";
export const registerListTags = (server, ctx) => {
    const schema = z.object({}).strict();
    server.registerTool("discourse_list_tags", {
        title: "List Tags",
        description: "List tags (if enabled).",
        inputSchema: schema.shape,
    }, async (_args, _extra) => {
        try {
            const { client } = ctx.siteState.ensureSelectedSite();
            const data = (await client.get(`/tags.json`));
            const tags = data?.tags || [];
            const lines = tags.map((t) => `- ${t.id} (${t.count ?? 0})`);
            const text = lines.length ? lines.join("\n") : "No tags found or tags disabled.";
            return { content: [{ type: "text", text }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: `Failed to list tags: ${e?.message || String(e)}` }], isError: true };
        }
    });
};
//# sourceMappingURL=list_tags.js.map