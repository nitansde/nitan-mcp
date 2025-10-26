import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { getCategoryName } from "../categories.js";
import { formatTimestamp } from "../../util/timestamp.js";

export const registerListTopTopics: RegisterFn = (server, ctx) => {
  const schema = z
    .object({
      period: z
        .enum(["daily", "weekly", "monthly", "quarterly", "yearly", "all"])
        .optional()
        .describe("Time period for top topics: daily (today), weekly (this week), monthly (this month), quarterly (this quarter), yearly (this year), all (all time). Default: daily"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of top topics to return (default: 10, max: 50)"),
    })
    .strict();

  server.registerTool(
    "discourse_list_top_topics",
    {
      title: "List Top Topics",
      description: "Get the top topics from the forum for a specific time period (daily, weekly, monthly, quarterly, yearly, or all time). Top topics are ranked by activity, views, and engagement.",
      inputSchema: schema.shape,
    },
    async ({ period = "daily", limit = 10 }, _extra: any) => {
      try {
        const { base, client } = ctx.siteState.ensureSelectedSite();
        
        // Construct the endpoint URL based on period
        let endpoint: string;
        if (period === "daily") {
          endpoint = `/hot.json?period=daily`;
        } else {
          endpoint = `/top.json?period=${period}`;
        }
        
        // Fetch top topics from the appropriate endpoint
        const data = (await client.get(endpoint)) as any;
        
        const list = data?.topic_list ?? data;
        const topics: any[] = Array.isArray(list?.topics) ? list.topics : [];
        
        // Limit the results
        const limitedTopics = topics.slice(0, limit);
        
        if (limitedTopics.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No top topics found for period: ${period}`,
              },
            ],
          };
        }
        
        // Map period to readable label
        const periodLabels: Record<string, string> = {
          daily: "Today",
          weekly: "This Week",
          monthly: "This Month",
          quarterly: "This Quarter",
          yearly: "This Year",
          all: "All Time",
        };
        
        // Format human-readable output
        const lines: string[] = [];
        lines.push(`Top Topics - ${periodLabels[period] || period} (showing ${limitedTopics.length} of ${topics.length} total):`);
        lines.push("");
        
        let i = 1;
        for (const topic of limitedTopics) {
          const title = topic.title || topic.fancy_title || `Topic ${topic.id}`;
          const slug = topic.slug || String(topic.id);
          const url = `${base}/t/${slug}/${topic.id}`;
          const views = topic.views ?? 0;
          const posts = topic.posts_count ?? 0;
          const likes = topic.like_count ?? 0;
          const score = topic.score ?? 0;
          
          lines.push(`${i}. ${title}`);
          lines.push(`   URL: ${url}`);
          lines.push(`   Stats: ${views} views, ${posts} posts, ${likes} likes, score: ${score}`);
          
          // Add category if available
          if (topic.category_id) {
            const categoryName = topic.category_name || getCategoryName(topic.category_id);
            lines.push(`   Category: ${categoryName}`);
          }
          
          // Add tags if available
          if (topic.tags && topic.tags.length > 0) {
            lines.push(`   Tags: ${topic.tags.join(", ")}`);
          }
          
          // Add created date
          if (topic.created_at) {
            const createdDate = new Date(topic.created_at).toLocaleDateString();
            lines.push(`   Created: ${createdDate}`);
          }
          
          lines.push("");
          i++;
        }
        
        // Build a compact JSON output for structured extraction
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
              text: `Failed to fetch top topics: ${e?.message || String(e)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
};
