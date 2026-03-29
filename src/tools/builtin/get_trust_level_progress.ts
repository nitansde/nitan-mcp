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
    time_read: 0,
  },
};

const METRIC_LABELS: Record<string, string> = {
  days_visited: "Days Visited (访问天数)",
  likes_given: "Likes Given (已送出获赞)",
  likes_received: "Likes Received (已收到获赞)",
  posts_count: "Posts Created (创建的帖子)",
  topics_entered: "Topics Entered (浏览的话题)",
  posts_read_count: "Posts Read (已读帖子)",
  time_read: "Reading Time (阅读时间)",
  bookmarks: "Bookmarks (书签)",
  topic_count: "Topics Created (创建的话题)",
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

        // Parse summary stats (mostly All-time)
        const summaryStats: Record<string, any> = summaryData?.user_summary || {};
        const summaryTrustLevel: number = summaryData?.users?.[0]?.trust_level ?? 0;

        // Parse directory stats (Quarterly/Recent)
        const dirItems: any[] = dirData?.directory_items || [];
        const dirItem = dirItems.find(
          (i: any) => i.user?.username?.toLowerCase() === username.toLowerCase()
        );

        let dirTrustLevel = 0;
        const recentStats: Record<string, any> = {};
        if (dirItem) {
          recentStats.days_visited = dirItem.days_visited;
          recentStats.likes_given = dirItem.likes_given;
          recentStats.likes_received = dirItem.likes_received;
          recentStats.posts_count = dirItem.post_count;
          recentStats.topics_entered = dirItem.topics_entered;
          recentStats.posts_read_count = dirItem.posts_read;
          recentStats.time_read = dirItem.time_read;
          dirTrustLevel = dirItem.user?.trust_level ?? 0;
        }

        const trustLevel: number = dirTrustLevel || summaryTrustLevel || 0;
        const isMaintain = trustLevel >= 3;
        const tierIndex = isMaintain ? 2 : trustLevel;

        // Dynamic TL2→3 thresholds from site stats
        const requirements = { ...TL_REQUIREMENTS[tierIndex] };
        if (tierIndex === 2) {
          const siteStats = siteData?.about?.stats || {};
          // Discourse TL3 requirements are based on last 100 days.
          // siteStats.posts_30_days * 3.33 approximates 100 days.
          const posts_100_days = Math.floor((siteStats.posts_30_days || 0) * 3.333);
          const topics_100_days = Math.floor((siteStats.topics_30_days || 0) * 3.333);

          requirements.posts_read_count = Math.min(Math.floor(posts_100_days / 4), 20000);
          requirements.topics_entered = Math.min(Math.floor(topics_100_days / 4), 500);
        }

        const formatTime = (seconds: number) => {
          if (seconds < 60) return `${seconds}s`;
          const m = Math.floor(seconds / 60);
          if (m < 60) return `${m}m`;
          const h = Math.floor(m / 60);
          if (h < 24) return `${h}h ${m % 60}m`;
          const d = Math.floor(h / 24);
          return `${d}d ${h % 24}h`;
        };

        // Format output
        const nextTL = isMaintain ? "TL3 (Retention)" : `TL${tierIndex + 1}`;
        const lines: string[] = [
          `User: @${username}`,
          `Current Trust Level: ${trustLevel}${isMaintain ? " (Regular)" : ""}`,
          `Progress toward ${nextTL} (Last 100 days approx.):`,
          "",
        ];

        // 1. Core Requirements
        let allMet = true;
        for (const [k, target] of Object.entries(requirements)) {
          const currentRecent = recentStats[k];
          const currentTotal = summaryStats[k];
          
          // CRITICAL: For TL3 (tierIndex 2), we MUST NOT fallback to historical total for likes/posts/visits
          // because it gives a false sense of progress. 
          // If currentRecent is missing, it means the user hasn't appeared in the directory for that period.
          const isTL3Check = tierIndex === 2;
          const valueToUse = (isTL3Check && currentRecent != null) ? currentRecent : (currentRecent ?? currentTotal);
          const isFallback = (currentRecent == null && currentTotal != null);
          
          const met = valueToUse != null && Number(valueToUse) >= Number(target);
          if (!met && k !== "time_read") allMet = false;
          
          const label = METRIC_LABELS[k] || k;
          const status = met ? "✓" : "✗";
          
          let displayValue = valueToUse != null ? String(valueToUse) : "0";
          let displayTarget = String(target);
          
          if (k === "time_read") {
            displayValue = formatTime(Number(valueToUse ?? 0));
            displayTarget = formatTime(Number(target));
          }

          const fallbackNote = (isTL3Check && isFallback) ? " (⚠️ All-time total! Quarterly data missing)" : "";
          lines.push(`  ${status} ${label}: ${displayValue} / ${displayTarget}${fallbackNote}`);
        }

        // 2. Additional Info from user list
        lines.push("");
        lines.push("Additional Stats:");
        if (summaryStats.time_read) lines.push(`  • Total Reading Time: ${formatTime(summaryStats.time_read)}`);
        if (summaryStats.bookmarks) lines.push(`  • Bookmarks: ${summaryStats.bookmarks}`);
        if (summaryStats.topic_count) lines.push(`  • Topics Created (All-time): ${summaryStats.topic_count}`);
        if (summaryStats.post_count) lines.push(`  • Posts Created (All-time): ${summaryStats.post_count}`);

        lines.push("");
        if (!dirItem) {
          lines.push("⚠️ Warning: User not found in quarterly directory. Recent stats are unavailable.");
        }
        lines.push(allMet ? "🎉 All requirements met!" : "⏳ Some requirements not yet met.");

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
