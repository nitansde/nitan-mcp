import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { getCategoryName } from "../categories.js";
import { formatTimestamp } from "../../util/timestamp.js";

export const registerListHotTopics: RegisterFn = (server, ctx) => {
  const schema = z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of hot topics to return (default: 10, max: 50)"),
    })
    .strict();

  server.registerTool(
    "discourse_list_hot_topics",
    {
      title: "List Hot Topics",
      description: "Get the current hot/trending topics from the forum. Hot topics are based on recent activity, views, and engagement.",
      inputSchema: schema.shape,
    },
    async ({ limit = 10 }, _extra: any) => {
      try {
        const { base, client } = ctx.siteState.ensureSelectedSite();
        
        // Fetch hot topics from /hot.json endpoint
        const data = (await client.get("/hot.json")) as any;
        
        const list = data?.topic_list ?? data;
        const topics: any[] = Array.isArray(list?.topics) ? list.topics : [];
        
        // Limit the results
        const limitedTopics = topics.slice(0, limit);
        
        if (limitedTopics.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No hot topics found.",
              },
            ],
          };
        }
        
        // Format human-readable output
        const lines: string[] = [];
        lines.push(`Hot Topics (showing ${limitedTopics.length} of ${topics.length} total):`);
        lines.push("");
        
        let i = 1;
        for (const topic of limitedTopics) {
          const title = topic.title || topic.fancy_title || `Topic ${topic.id}`;
          const slug = topic.slug || String(topic.id);
          const url = `${base}/t/${slug}/${topic.id}`;
          const views = topic.views ?? 0;
          const posts = topic.posts_count ?? 0;
          const likes = topic.like_count ?? 0;
          
          lines.push(`${i}. ${title}`);
          lines.push(`   URL: ${url}`);
          lines.push(`   Stats: ${views} views, ${posts} posts, ${likes} likes`);
          
          // Add category if available
          if (topic.category_id) {
            const categoryName = topic.category_name || getCategoryName(topic.category_id);
            lines.push(`   Category: ${categoryName}`);
          }
          
          // Add tags if available
          if (topic.tags && topic.tags.length > 0) {
            lines.push(`   Tags: ${topic.tags.join(", ")}`);
          }
          
          lines.push("");
          i++;
        }
        
        // Build a compact JSON output
        const jsonOutput = limitedTopics.map((topic) => ({
          id: topic.id,
          title: topic.title || topic.fancy_title || `Topic ${topic.id}`,
          url: `${base}/t/${topic.slug || topic.id}/${topic.id}`,
          views: topic.views ?? 0,
          posts_count: topic.posts_count ?? 0,
          like_count: topic.like_count ?? 0,
          category: topic.category_id ? (topic.category_name || getCategoryName(topic.category_id)) : undefined,
          tags: topic.tags || [],
          created_at: formatTimestamp(topic.created_at || ""),
        }));
        
        const text = JSON.stringify(jsonOutput, null, 2);
        
        return { content: [{ type: "text", text }] };
      } catch (e: any) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch hot topics: ${e?.message || String(e)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
};
