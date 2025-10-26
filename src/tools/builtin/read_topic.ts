import { z } from "zod";
import type { RegisterFn } from "../types.js";

export const registerReadTopic: RegisterFn = (server, ctx) => {
  const schema = z.object({
    topic_id: z.number().int().positive(),
    post_limit: z.number().int().min(1).max(500).optional().describe("Number of posts to fetch (default 30, max 500)"),
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
    async ({ topic_id, post_limit = 30, start_post_number = 1, username_filter }, _extra: any) => {
      try {
        const { base, client } = ctx.siteState.ensureSelectedSite();
        const start = start_post_number;
        const limit = Number.isFinite(ctx.maxReadLength) ? ctx.maxReadLength : 50000;

        let fetchedPosts: Array<{ number: number; username: string; created_at: string; content: string }> = [];
        let slug = "";
        let title = `Topic ${topic_id}`;
        let category = "";
        let tags: string[] = [];
        let current = start;
        let isFirstRequest = true;
        
        // Build URL with optional username filter
        const buildUrl = (postNumber: number) => {
          let url = `/t/${topic_id}/${postNumber}.json?include_raw=true`;
          if (username_filter) {
            url += `&username_filters=${encodeURIComponent(username_filter)}`;
          }
          return url;
        };
        
        // Loop until we have enough posts or no more posts available
        while (fetchedPosts.length < post_limit) {
          // Use the /t/{topic_id}/{post_number}.json endpoint which returns ~15 posts starting from post_number
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
          
          // Only take posts that are >= current post number (in case API returns some earlier posts)
          const filtered = sorted.filter((p) => (p.post_number || 0) >= current);
          
          if (filtered.length === 0) break; // No progress
          
          // Add posts to our result
          for (const p of filtered) {
            if (fetchedPosts.length >= post_limit) break;
            fetchedPosts.push({
              number: p.post_number,
              username: p.username,
              created_at: p.created_at,
              content: (p.raw || p.cooked || p.excerpt || "").toString().slice(0, limit),
            });
          }
          
          // If we've collected enough posts, stop
          if (fetchedPosts.length >= post_limit) break;
          
          // Move to next batch: set current to the post number after the last one we got
          const lastPostNumber = filtered[filtered.length - 1]?.post_number || current;
          current = lastPostNumber + 1;
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

