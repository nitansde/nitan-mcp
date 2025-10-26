import { z } from "zod";
import type { RegisterFn } from "../types.js";

export const registerSearch: RegisterFn = (server, ctx) => {
  const schema = z.object({
    query: z.string().min(1).describe("Search query"),
    max_results: z.number().int().min(1).max(50).optional(),
  });

  server.registerTool(
    "discourse_search",
    {
      title: "Discourse Search",
      description: "Search site content.",
      inputSchema: schema.shape,
    },
    async (args, _extra: any) => {
      const { query, max_results = 10 } = args;
      const { base, client } = ctx.siteState.ensureSelectedSite();
      const q = new URLSearchParams();
      q.set("expanded", "true");
      const fullQuery = ctx.defaultSearchPrefix ? `${ctx.defaultSearchPrefix} ${query}` : query;
      q.set("q", fullQuery);
      try {
        const data = (await client.get(`/search.json?${q.toString()}`)) as any;
        const topics: any[] = data?.topics || [];
        const posts: any[] = data?.posts || [];

        // Create a map of topic_id to blurb from posts
        const topicBlurbMap = new Map<number, string>();
        for (const post of posts) {
          if (post.topic_id && post.blurb && !topicBlurbMap.has(post.topic_id)) {
            topicBlurbMap.set(post.topic_id, post.blurb);
          }
        }

        const items = (topics.map((t) => ({
          type: "topic" as const,
          id: t.id,
          title: t.title,
          slug: t.slug,
          blurb: topicBlurbMap.get(t.id),
        })) as Array<{ type: "topic"; id: number; title: string; slug: string; blurb?: string }>).slice(0, max_results);

        const jsonOutput = items.map((it) => {
          const result: any = { 
            id: it.id, 
            url: `${base}/t/${it.slug}/${it.id}`, 
            title: it.title 
          };
          if (it.blurb) {
            result.blurb = it.blurb;
          }
          return result;
        });
        const text = "```json\n" + JSON.stringify(jsonOutput, null, 2) + "\n```\n";
        return { content: [{ type: "text", text }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Search failed: ${e?.message || String(e)}` }], isError: true };
      }
    }
  );
};

