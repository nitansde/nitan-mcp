import { z } from "zod";
import type { RegisterFn } from "../types.js";

const TL_REQUIREMENTS: Record<number, Record<string, number>> = {
  0: { topics_entered: 5, posts_read_count: 30, time_read: 600 },
  1: {
    days_visited: 15,
    likes_given: 1,
    likes_received: 1,
    posts_count: 3,
    topics_entered: 20,
    posts_read_count: 100,
    time_read: 3600,
  },
  2: {
    days_visited: 50,
    posts_read_count: 0,
    topics_entered: 0,
    likes_given: 30,
    likes_received: 20,
    posts_count: 10,
  },
};

const METRIC_LABELS: Record<string, string> = {
  days_visited: "Days Visited",
  likes_given: "Likes Given",
  likes_received: "Likes Received",
  posts_count: "Posts Count",
  topics_entered: "Topics Entered",
  posts_read_count: "Posts Read",
  time_read: "Time Read (seconds)",
};

export const registerGetTrustLevelProgress: RegisterFn = (server, ctx) => {
  const schema = z.object({
    username: z.string().min(1),
  });

  server.registerTool(
    "discourse_get_trust_level_progress",
    {
      title: "Get Trust Level Progress",
      description:
        "Show a user's Discourse trust level progress toward the next level, with current stats vs requirements.",
      inputSchema: schema.shape,
    },
    async ({ username }) => {
      try {
        const { client } = ctx.siteState.ensureSelectedSite();

        // Fetch all three data sources in parallel
        const [siteData, summaryData, dirData] = await Promise.all([
          client.get("/about.json") as Promise<any>,
          client.get(`/u/${encodeURIComponent(username)}/summary.json`) as Promise<any>,
          client.get(
            `/directory_items?period=quarterly&order=days_visited&name=${encodeURIComponent(username)}`
          ) as Promise<any>,
        ]);

        // Parse summary stats
        const summaryStats: Record<string, any> = summaryData?.user_summary || {};
        const summaryTrustLevel: number = summaryData?.users?.[0]?.trust_level ?? 0;

        // Parse directory stats
        const dirItems: any[] = dirData?.directory_items || [];
        const dirItem = dirItems.find((i: any) => i.user?.username === username) || dirItems[0];

        let dirTrustLevel = 0;
        const dirStats: Record<string, number | null> = {
          days_visited: null,
          likes_given: null,
          likes_received: null,
          posts_count: null,
          topics_entered: null,
          posts_read_count: null,
          time_read: null,
        };

        if (dirItem) {
          dirStats.days_visited = dirItem.days_visited ?? null;
          dirStats.likes_given = dirItem.likes_given ?? null;
          dirStats.likes_received = dirItem.likes_received ?? null;
          dirStats.posts_count = dirItem.post_count ?? null;
          dirStats.topics_entered = dirItem.topics_entered ?? null;
          dirStats.posts_read_count = dirItem.posts_read ?? null;
          dirTrustLevel = dirItem.user?.trust_level ?? 0;
        }

        // Merge stats: directory takes priority over summary
        const stats: Record<string, any> = { ...summaryStats };
        Object.entries(dirStats).forEach(([k, v]) => {
          if (v != null) stats[k] = v;
        });

        const trustLevel: number = dirTrustLevel ?? summaryTrustLevel ?? 0;
        const isMaintain = trustLevel >= 3;
        const tierIndex = isMaintain ? 2 : trustLevel;

        // Dynamic TL2→3 thresholds from site stats
        const requirements = { ...TL_REQUIREMENTS[tierIndex] };
        if (tierIndex === 2) {
          const siteStats = siteData?.about?.stats || {};
          requirements.posts_read_count = Math.min(
            Math.floor((siteStats.posts_30_days || 0) / 4),
            20000
          );
          requirements.topics_entered = Math.min(
            Math.floor((siteStats.topics_30_days || 0) / 4),
            500
          );
        }

        // Format output
        const nextTL = isMaintain ? "TL3 (Retention)" : `TL${tierIndex + 1}`;
        const lines: string[] = [
          `User: @${username}`,
          `Current Trust Level: ${trustLevel}${isMaintain ? " (Regular)" : ""}`,
          `Progress toward ${nextTL}:`,
          "",
        ];

        let allMet = true;
        for (const [k, target] of Object.entries(requirements)) {
          const current = stats[k];
          if (current == null) continue;
          const met = Number(current) >= Number(target);
          if (!met) allMet = false;
          const label = METRIC_LABELS[k] || k;
          const status = met ? "✓" : "✗";
          lines.push(`  ${status} ${label}: ${current} / ${target}`);
        }

        lines.push("");
        lines.push(allMet ? "All requirements met!" : "Some requirements not yet met.");

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e: any) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to get trust level progress for ${username}: ${e?.message || String(e)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
};
