import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { formatTimestamp } from "../../util/timestamp.js";

export const registerReadTopic: RegisterFn = (server, ctx) => {
  const schema = z.object({
    topic_id: z.number().int().positive(),
    post_limit: z.number().int().min(1).max(500).optional().describe("Number of posts to fetch (default 90, max 500)"),
    start_post_number: z.number().int().min(1).optional().describe("Start from this post number (default 1, 1-based)"),
    username_filter: z.string().optional().describe("Filter posts by username (only show posts from this user)")
  });

  server.registerTool(
    "discourse_read_topic",
    {
      title: "Read Topic",
      description: "Read a topic metadata and posts. Can optionally filter to show only posts from a specific user.",
      inputSchema: schema.shape,
    },
    async ({ topic_id, post_limit = 90, start_post_number = 1, username_filter }, _extra: any) => {
      try {
        const { base, client } = ctx.siteState.ensureSelectedSite();
        const limit = Number.isFinite(ctx.maxReadLength) ? ctx.maxReadLength : 50000;

        const fetchedPosts: Array<{ number: number; username: string; created_at: string; content: string }> = [];
        let slug = "";
        let title = `Topic ${topic_id}`;
        let category = "";
        let tags: string[] = [];

        // If username_filter is provided, use the slower but filterable endpoint
        if (username_filter) {
          let current = start_post_number;
          let isFirstRequest = true;
          
          // Build URL with username filter
          const buildUrl = (postNumber: number) => {
            return `/t/${topic_id}/${postNumber}.json?include_raw=true&username_filters=${encodeURIComponent(username_filter)}`;
          };
          
          // Loop until we have enough posts or no more posts available
          while (fetchedPosts.length < post_limit) {
            const url = buildUrl(current);
            const data = (await client.get(url)) as any;
            
            // Get metadata from first response
            if (isFirstRequest) {
              title = data?.title || title;
              category = data?.category_id ? `Category ID ${data.category_id}` : "";
              tags = Array.isArray(data?.tags) ? data.tags : [];
              slug = data?.slug || String(topic_id);
              isFirstRequest = false;
            }
            
            // Extract posts from response
            const stream: any[] = Array.isArray(data?.post_stream?.posts) ? data.post_stream.posts : [];
            
            if (stream.length === 0) break; // No more posts
            
            // Sort posts by post_number to ensure correct order
            const sorted = stream.slice().sort((a, b) => (a.post_number || 0) - (b.post_number || 0));
            
            // Only take posts that are >= current post number
            const filtered = sorted.filter((p) => (p.post_number || 0) >= current);
            
            if (filtered.length === 0) break; // No progress
            
            // Add posts to our result
            for (const p of filtered) {
              if (fetchedPosts.length >= post_limit) break;
              fetchedPosts.push({
                number: p.post_number,
                username: p.username,
                created_at: formatTimestamp(p.created_at || ""),
                content: (p.raw || p.cooked || p.excerpt || "").toString().slice(0, limit),
              });
            }
            
            // If we've collected enough posts, stop
            if (fetchedPosts.length >= post_limit) break;
            
            // Move to next batch
            const lastPostNumber = filtered[filtered.length - 1]?.post_number || current;
            current = lastPostNumber + 1;
          }
        } else {
          // Use the JSON endpoint (same permissions as topic metadata, avoids /raw/ 403s)
          let current = start_post_number;
          let isFirstRequest = true;

          while (fetchedPosts.length < post_limit) {
            const url = `/t/${topic_id}/${current}.json?include_raw=true`;
            const data = (await client.get(url)) as any;

            if (isFirstRequest) {
              title = data?.title || title;
              category = data?.category_id ? `Category ID ${data.category_id}` : "";
              tags = Array.isArray(data?.tags) ? data.tags : [];
              slug = data?.slug || String(topic_id);
              isFirstRequest = false;
            }

            const stream: any[] = Array.isArray(data?.post_stream?.posts) ? data.post_stream.posts : [];
            if (stream.length === 0) break;

            const sorted = stream.slice().sort((a, b) => (a.post_number || 0) - (b.post_number || 0));
            const filtered = sorted.filter((p) => (p.post_number || 0) >= current);
            if (filtered.length === 0) break;

            for (const p of filtered) {
              if (fetchedPosts.length >= post_limit) break;
              fetchedPosts.push({
                number: p.post_number,
                username: p.username,
                created_at: formatTimestamp(p.created_at || ""),
                content: (p.raw || p.cooked || p.excerpt || "").toString().slice(0, limit),
              });
            }

            if (fetchedPosts.length >= post_limit) break;

            const lastPostNumber = filtered[filtered.length - 1]?.post_number || current;
            current = lastPostNumber + 1;
          }
        }

        const lines: string[] = [];
        lines.push(`# ${title}`);
        if (category) lines.push(category);
        if (tags.length) lines.push(`Tags: ${tags.join(", ")}`);
        if (username_filter) lines.push(`Filtered by user: @${username_filter}`);
        lines.push("");
        for (const p of fetchedPosts) {
          lines.push(`- Post #${p.number} by @${p.username} (${p.created_at})`);
          lines.push(`  ${p.content}`);
        }
        lines.push("");
        lines.push(`Link: ${base}/t/${slug}/${topic_id}`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Failed to read topic ${topic_id}: ${e?.message || String(e)}` }], isError: true };
      }
    }
  );
};

