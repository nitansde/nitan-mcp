import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { formatTimestamp } from "../../util/timestamp.js";

export const registerListExcellentTopics: RegisterFn = (server, ctx, _opts) => {
  const schema = z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of topics to return (1-50, default 20)"),
    })
    .strict();

  server.registerTool(
    "discourse_list_excellent_topics",
    {
      title: "List Excellent Topics",
      description:
        "Get recent excellent topics from the forum. An excellent topic is a topic with over 50 likes. Returns the most recent topics that earned the '精彩的话题' (Excellent Topic) badge.",
      inputSchema: schema.shape,
    },
    async ({ limit = 20 }, _extra: any) => {
      try {
        const { base, client } = ctx.siteState.ensureSelectedSite();

        // Badge ID 20 is for "精彩的话题" (Excellent Topic - 50 likes)
        const data = (await client.get(
          `/user_badges.json?badge_id=20`
        )) as any;

        if (!data || !data.user_badge_info || !data.user_badge_info.user_badges) {
          return {
            content: [
              {
                type: "text",
                text: "No excellent topics found.",
              },
            ],
          };
        }

        // Get the most recent badges (already sorted by granted_at descending)
        const recentBadges = data.user_badge_info.user_badges.slice(0, limit);

        // Create a map of user IDs to usernames
        const userMap = new Map<number, string>();
        if (data.users) {
          for (const user of data.users) {
            userMap.set(user.id, user.username);
          }
        }

        // Create a map of topic IDs to topic info
        const topicMap = new Map<number, any>();
        if (data.topics) {
          for (const topic of data.topics) {
            topicMap.set(topic.id, topic);
          }
        }

        // Build the result array
        const results = recentBadges.map((badge: any) => {
          const topic = topicMap.get(badge.topic_id);
          const username = userMap.get(badge.user_id) || "unknown";

          return {
            id: badge.topic_id,
            username: username,
            title: topic ? topic.title : "Unknown Topic",
            posts_count: topic ? topic.posts_count : 0,
            granted_at: formatTimestamp(badge.granted_at),
          };
        });

        const text = JSON.stringify({ results }, null, 2);

        return { content: [{ type: "text", text }] };
      } catch (e: any) {
        ctx.logger.error(
          `Failed to fetch excellent topics: ${e?.message || String(e)}`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error fetching excellent topics: ${e?.message || String(e)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
};
