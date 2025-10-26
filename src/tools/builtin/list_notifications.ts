import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { formatTimestamp } from "../../util/timestamp.js";

export const registerListNotifications: RegisterFn = (server, ctx) => {
  const schema = z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(60)
        .optional()
        .describe("Maximum number of notifications to return (default: 30, max: 60)"),
      unread_only: z
        .boolean()
        .optional()
        .describe("If true, only return unread notifications (default: true)"),
    })
    .strict();

  server.registerTool(
    "discourse_list_notifications",
    {
      title: "List Notifications",
      description: "Get user notifications from the forum. Requires authentication with user credentials.",
      inputSchema: schema.shape,
    },
    async ({ limit = 30, unread_only = true }, _extra: any) => {
      try {
        const { base, client } = ctx.siteState.ensureSelectedSite();
        const maxReadLength = Number.isFinite(ctx.maxReadLength) ? ctx.maxReadLength : 50000;
        
        // Fetch notifications from the API
        const url = `/notifications.json?limit=${limit}&recent=true&bump_last_seen_reviewable=true`;
        const data = (await client.get(url)) as any;
        
        let notifications: any[] = Array.isArray(data?.notifications) ? data.notifications : [];
        
        // Filter for unread only if requested
        if (unread_only) {
          notifications = notifications.filter((n) => n.read === false);
        }
        
        if (notifications.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: unread_only ? "No unread notifications." : "No notifications found.",
              },
            ],
          };
        }
        
        // Fetch content for "replied" notifications (type 2)
        const contentMap = new Map<string, string>();
        for (const notif of notifications) {
          if (notif.notification_type === 2 && notif.topic_id && notif.post_number) {
            try {
              const rawContent = (await client.get(`/raw/${notif.topic_id}/${notif.post_number}`)) as string;
              const key = `${notif.topic_id}/${notif.post_number}`;
              contentMap.set(key, rawContent.slice(0, maxReadLength));
            } catch (e) {
              // If fetching content fails, just skip it
            }
          }
        }
        
        // Map notification types to readable labels
        const notificationTypeLabels: Record<number, string> = {
          1: "mentioned",
          2: "replied",
          3: "quoted",
          4: "edited",
          5: "liked",
          6: "private_message",
          9: "replied_to_topic",
          11: "linked",
          12: "granted_badge",
          15: "topic_reminder",
          17: "watching_category_or_tag",
        };
        
        // Format human-readable output
        const lines: string[] = [];
        const filterText = unread_only ? "Unread Notifications" : "Notifications";
        lines.push(`${filterText} (showing ${notifications.length}${unread_only ? "" : ` of ${data?.notifications?.length || notifications.length} total`}):`);
        lines.push("");
        
        let i = 1;
        for (const notif of notifications) {
          const type = notificationTypeLabels[notif.notification_type] || `type_${notif.notification_type}`;
          const title = notif.fancy_title || notif.data?.topic_title || "Notification";
          const username = notif.data?.display_username || notif.data?.original_username || "Unknown";
          const readStatus = notif.read ? "✓ Read" : "✉ Unread";
          const isHighPriority = notif.high_priority ? " [HIGH PRIORITY]" : "";
          
          // Format timestamp
          const timeStr = formatTimestamp(notif.created_at);
          
          lines.push(`${i}. [${type}] ${title}${isHighPriority}`);
          lines.push(`   From: ${username}`);
          lines.push(`   Status: ${readStatus}`);
          lines.push(`   Time: ${timeStr}`);
          
          // Add URL if topic exists
          if (notif.topic_id && notif.slug) {
            const url = `${base}/t/${notif.slug}/${notif.topic_id}${notif.post_number ? `/${notif.post_number}` : ""}`;
            lines.push(`   URL: ${url}`);
          }
          
          // Add badge info if it's a badge notification
          if (notif.notification_type === 12 && notif.data?.badge_name) {
            lines.push(`   Badge: ${notif.data.badge_name}`);
          }
          
          // Add content for "replied" notifications
          if (notif.notification_type === 2 && notif.topic_id && notif.post_number) {
            const key = `${notif.topic_id}/${notif.post_number}`;
            const content = contentMap.get(key);
            if (content) {
              lines.push(`   Content: ${content}`);
            }
          }
          
          lines.push("");
          i++;
        }
        
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e: any) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch notifications: ${e?.message || String(e)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
};
