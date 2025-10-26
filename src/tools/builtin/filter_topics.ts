import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { getCategoryByName, getCategoryById } from "../categories.js";

export const registerFilterTopics: RegisterFn = (server, ctx) => {
  const schema = z
    .object({
      categories: z
        .array(z.string())
        .optional()
        .describe("Category names in natural language (e.g., ['信用卡', '银行账户']). Multiple categories are combined with OR logic."),
      filter: z
        .string()
        .optional()
        .describe(
          "Additional filter query (optional), e.g. 'status:open created-after:30 order:activity'. If categories are provided, they will be added to this filter.",
        ),
      page: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Page number (0-based, default: 0)"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Items per page (max 50)"),
    })
    .strict();

  const description =
    "Filter topics by categories and other criteria. You can specify categories by their natural language names (e.g., '信用卡', '旅行', '败家'). " +
    "Additional filters support: status:(open|closed|archived|listed|unlisted|public), personal in:(bookmarked|watching|tracking|muted|pinned), " +
    "dates: created/activity/latest-post-(before|after) with YYYY-MM-DD or N (days), " +
    "numeric: likes[-op]-(min|max), posts-(min|max), posters-(min|max), views-(min|max), " +
    "order: activity|created|latest-post|likes|likes-op|posters|title|views|category with optional -asc. " +
    "Results are permission-aware.";

  server.registerTool(
    "discourse_filter_topics",
    {
      title: "Filter Topics",
      description,
      inputSchema: schema.shape,
    },
    async ({ categories, filter = "", page = 0, per_page }, _extra: any) => {
      try {
        const { base, client } = ctx.siteState.ensureSelectedSite();
        
        // Build the filter query
        let finalFilter = filter.trim();
        
        // Convert category names to category slugs and add to filter
        if (categories && categories.length > 0) {
          const categorySlugs: string[] = [];
          const notFoundCategories: string[] = [];
          
          for (const catName of categories) {
            const category = getCategoryByName(catName);
            if (category) {
              // Use slug if available and not empty, otherwise use category ID
              const identifier = category.slug && category.slug.trim() !== "" 
                ? category.slug 
                : String(category.id);
              categorySlugs.push(`#${identifier}`);
            } else {
              notFoundCategories.push(catName);
            }
          }
          
          if (notFoundCategories.length > 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `Categories not found: ${notFoundCategories.join(", ")}. Please use valid category names like: 信用卡, 银行账户, 旅行, 航空常旅客, 酒店常旅客, 理财, 股市投资, 败家, 电子产品, 生活, 吃货, 法律, 签证与身份（美国）, 搬砖, etc.`,
                },
              ],
              isError: true,
            };
          }
          
          if (categorySlugs.length > 0) {
            // Multiple categories separated by space (OR logic in search)
            const categoryFilter = categorySlugs.join(" ");
            finalFilter = finalFilter ? `${categoryFilter} ${finalFilter}` : categoryFilter;
          }
        }
        
        // If no filter provided at all, return error
        if (!finalFilter) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide either categories or filter criteria.",
              },
            ],
            isError: true,
          };
        }
        
        const params = new URLSearchParams();
        params.set("q", finalFilter);
        params.set("page", String(page));
        if (per_page) params.set("per_page", String(per_page));

        const data = (await client.get(
          `/search.json?${params.toString()}`,
        )) as any;
        
        // Search endpoint returns posts, we need to extract unique topics
        const posts: any[] = Array.isArray(data?.posts) ? data.posts : [];
        const topics: any[] = Array.isArray(data?.topics) ? data.topics : [];
        
        // Create a map of topic_id to topic info
        const topicMap = new Map();
        topics.forEach((t: any) => {
          topicMap.set(t.id, t);
        });
        
        // Get unique topics from posts
        const uniqueTopicIds = new Set<number>();
        posts.forEach((p: any) => {
          if (p.topic_id) {
            uniqueTopicIds.add(p.topic_id);
          }
        });
        
        // Build items list from unique topics
        const items = Array.from(uniqueTopicIds)
          .map((topicId) => {
            const topic = topicMap.get(topicId);
            if (topic) {
              return {
                id: topic.id,
                title: topic.title || topic.fancy_title || `Topic ${topic.id}`,
                slug: topic.slug || String(topic.id),
              };
            }
            return null;
          })
          .filter((item) => item !== null);

        const perPage = per_page;
        const moreUrl: string | undefined = undefined; // Search API doesn't provide this

        const lines: string[] = [];
        lines.push(`Filter: "${finalFilter}" — Page ${page}`);
        if (items.length === 0) {
          lines.push("No topics matched.");
        } else {
          let i = 1;
          for (const it of items) {
            const url = `${base}/t/${it.slug}/${it.id}`;
            lines.push(`${i}. ${it.title} – ${url}`);
            i++;
          }
        }

        // Build a compact JSON footer for structured extraction
        const jsonFooter: any = {
          page,
          per_page: perPage,
          filter: finalFilter,
          results: items.map((it: any) => ({
            id: it.id,
            title: it.title,
            url: `${base}/t/${it.slug}/${it.id}`,
          })),
        };

        const text =
          lines.join("\n") +
          "\n\n```json\n" +
          JSON.stringify(jsonFooter) +
          "\n```\n";
        return { content: [{ type: "text", text }] };
      } catch (e: any) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to filter topics: ${e?.message || String(e)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
};
