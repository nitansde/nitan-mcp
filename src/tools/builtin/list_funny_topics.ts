import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { formatTimestamp } from "../../util/timestamp.js";

export const registerListFunnyTopics: RegisterFn = (server, ctx, _opts) => {
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
    "discourse_list_funny_topics",
    {
      title: "List Funny Topics",
      description:
        "Get recent funny topics from the forum. A funny topic is a topic that earned the '难绷的话题' (Funny Topic) badge.",
      inputSchema: schema.shape,
    },
    async ({ limit = 20 }, _extra: any) => {
      try {
        const { base, client } = ctx.siteState.ensureSelectedSite();

        // Badge ID 115 is for "难绷的话题" (Funny Topic)
        const data = (await client.get(
          `/user_badges.json?badge_id=115`
        )) as any;

        if (!data || !data.user_badge_info || !data.user_badge_info.user_badges) {
          return {
            content: [
              {
                type: "text",
                text: "No funny topics found.",
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
          `Failed to fetch funny topics: ${e?.message || String(e)}`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error fetching funny topics: ${e?.message || String(e)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
};
