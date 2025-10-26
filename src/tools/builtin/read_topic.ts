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

        let fetchedPosts: Array<{ number: number; username: string; created_at: string; content: string }> = [];
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
          // Use the efficient /raw/ endpoint (100-110 posts per page)
          // First, get metadata from the topic
          const metaUrl = `/t/${topic_id}.json`;
          const metaData = (await client.get(metaUrl)) as any;
          title = metaData?.title || title;
          category = metaData?.category_id ? `Category ID ${metaData.category_id}` : "";
          tags = Array.isArray(metaData?.tags) ? metaData.tags : [];
          slug = metaData?.slug || String(topic_id);
          
          // Calculate which page to start from based on start_post_number
          // Assuming ~100 posts per page
          const postsPerPage = 100;
          let currentPage = Math.floor((start_post_number - 1) / postsPerPage) + 1;
          
          // Fetch raw content pages
          while (fetchedPosts.length < post_limit) {
            const rawUrl = `/raw/${topic_id}?page=${currentPage}`;
            const rawText = (await client.get(rawUrl)) as string;
            
            if (!rawText || rawText.trim().length === 0) break; // No more content
            
            // Parse the raw text format: "username | timestamp | #post_number\n\ncontent\n\n-------------------------\n\n"
            // Split by lines first to process line by line
            const lines = rawText.split('\n');
            
            let i = 0;
            while (i < lines.length) {
              if (fetchedPosts.length >= post_limit) break;
              
              const line = lines[i];
              
              // Look for header line: "username | timestamp | #post_number"
              const headerMatch = line.match(/^(.+?)\s*\|\s*(.+?)\s*\|\s*#(\d+)\s*$/);
              
              if (headerMatch) {
                const username = headerMatch[1].trim();
                const timestamp = formatTimestamp(headerMatch[2].trim());
                const postNumber = parseInt(headerMatch[3], 10);
                
                // Skip posts before start_post_number
                if (postNumber < start_post_number) {
                  // Skip to next separator
                  i++;
                  while (i < lines.length && !lines[i].match(/^-{20,}$/)) {
                    i++;
                  }
                  i++; // Skip the separator line itself
                  continue;
                }
                
                // Collect content lines until we hit the separator
                i++; // Move past header
                const contentLines: string[] = [];
                
                // Skip empty lines after header
                while (i < lines.length && lines[i].trim() === '') {
                  i++;
                }
                
                // Collect content until separator
                while (i < lines.length && !lines[i].match(/^-{20,}$/)) {
                  contentLines.push(lines[i]);
                  i++;
                }
                
                // Skip the separator line
                if (i < lines.length && lines[i].match(/^-{20,}$/)) {
                  i++;
                }
                
                const content = contentLines.join('\n').trim();
                
                fetchedPosts.push({
                  number: postNumber,
                  username: username,
                  created_at: timestamp,
                  content: content.slice(0, limit),
                });
              } else {
                i++;
              }
            }
            
            // If we didn't find any posts on this page, we've reached the end
            if (i === 0 || lines.length === 0) break;
            
            currentPage++;
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

