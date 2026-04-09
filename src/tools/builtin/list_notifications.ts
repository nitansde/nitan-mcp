import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { formatTimestamp } from "../../util/timestamp.js";

function collectErrorText(error: any): string {
  const parts: string[] = [];
  if (typeof error?.message === "string") parts.push(error.message);

  const body = error?.body;
  if (typeof body === "string") {
    parts.push(body);
  } else if (body && typeof body === "object") {
    for (const value of Object.values(body)) {
      if (typeof value === "string") parts.push(value);
    }
  }

  return parts.join("\n").toLowerCase();
}

function isCloudflareChallengeError(error: any): boolean {
  const text = collectErrorText(error);
  return (
    text.includes("just a moment") ||
    text.includes("attention required") ||
    text.includes("/cdn-cgi/challenge-platform/") ||
    text.includes("cf-challenge") ||
    text.includes("cf-mitigated") ||
    text.includes("cloudflare")
  );
}

function isExplicitNotLoggedInError(error: any): boolean {
  const text = collectErrorText(error);
  return (
    text.includes("not_logged_in") ||
    text.includes("you are not permitted to view the requested resource") ||
    text.includes("您需要登录")
  );
}

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
        
        // Build JSON output
        const jsonOutput = notifications.map((notif) => {
          const type = notificationTypeLabels[notif.notification_type] || `type_${notif.notification_type}`;
          const title = notif.fancy_title || notif.data?.topic_title || "Notification";
          const username = notif.data?.display_username || notif.data?.original_username || "Unknown";
          const timeStr = formatTimestamp(notif.created_at);
          
          const result: any = {
            type: type,
            title: title,
            from: username,
            unread: !notif.read,
            time: timeStr,
          };
          
          // Add URL if topic exists
          if (notif.topic_id && notif.slug) {
            const url = `${base}/t/${notif.slug}/${notif.topic_id}${notif.post_number ? `/${notif.post_number}` : ""}`;
            result.url = url;
          }
          
          // Add high priority flag if applicable
          if (notif.high_priority) {
            result.high_priority = true;
          }
          
          // Add badge info if it's a badge notification
          if (notif.notification_type === 12 && notif.data?.badge_name) {
            result.badge = notif.data.badge_name;
          }
          
          // Add content for "replied" notifications
          if (notif.notification_type === 2 && notif.topic_id && notif.post_number) {
            const key = `${notif.topic_id}/${notif.post_number}`;
            const content = contentMap.get(key);
            if (content) {
              result.content = content;
            }
          }
          
          return result;
        });
        
        const text = JSON.stringify(jsonOutput, null, 2);
        return { content: [{ type: "text", text }] };
      } catch (e: any) {
        if (isCloudflareChallengeError(e)) {
          return {
            content: [
              {
                type: "text",
                text: "Unable to fetch notifications: Cloudflare challenge blocked the request. Retry with browser fallback enabled and an active browser session.",
              },
            ],
            isError: true,
          };
        }

        if (isExplicitNotLoggedInError(e)) {
          return {
            content: [
              {
                type: "text",
                text: "Unable to fetch notifications: User is not logged in. Notifications require authentication with username and password.",
              },
            ],
            isError: true,
          };
        }
        
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
