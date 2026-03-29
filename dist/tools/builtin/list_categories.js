import { z } from "zod";
export const registerListCategories = (server, ctx) => {
    const schema = z.object({}).strict();
    server.registerTool("discourse_list_categories", {
        title: "List Categories",
        description: "List categories visible to the current auth context.",
        inputSchema: schema.shape,
    }, async (_args, _extra) => {
        try {
            const { client } = ctx.siteState.ensureSelectedSite();
            const data = (await client.getCached(`/site.json`, 30000));
            const cats = data?.categories || [];
            const lines = cats.map((c) => `- ${c.name} (${c.topic_count ?? 0} topics)`);
            const text = lines.length ? lines.join("\n") : "No categories found.";
            return { content: [{ type: "text", text }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: `Failed to list categories: ${e?.message || String(e)}` }], isError: true };
        }
    });
};
//# sourceMappingURL=list_categories.js.map