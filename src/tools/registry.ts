import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../util/logger.js";
import type { SiteState } from "../site/state.js";
import { registerSearch } from "./builtin/search.js";
import { registerReadTopic } from "./builtin/read_topic.js";
import { registerReadPost } from "./builtin/read_post.js";
import { registerListCategories } from "./builtin/list_categories.js";
import { registerListTags } from "./builtin/list_tags.js";
import { registerGetUser } from "./builtin/get_user.js";
import { registerSelectSite } from "./builtin/select_site.js";
import { registerFilterTopics } from "./builtin/filter_topics.js";
import { registerListUserPosts } from "./builtin/list_user_posts.js";
import { registerListHotTopics } from "./builtin/list_hot_topics.js";
import { registerListNotifications } from "./builtin/list_notifications.js";
import { registerListTopTopics } from "./builtin/list_top_topics.js";
import { registerListExcellentTopics } from "./builtin/list_excellent_topics.js";
import { registerListFunnyTopics } from "./builtin/list_funny_topics.js";
import { registerGetTrustLevelProgress } from "./builtin/get_trust_level_progress.js";

export interface RegistryOptions {
  allowWrites?: boolean;
  // When true, do not register the discourse_select_site tool
  hideSelectSite?: boolean;
  // Optional default search prefix to add to all searches
  defaultSearchPrefix?: string;
}

export async function registerAllTools(
  server: McpServer,
  siteState: SiteState,
  logger: Logger,
  opts: RegistryOptions & { maxReadLength?: number }
) {
  const ctx = { siteState, logger, defaultSearchPrefix: opts.defaultSearchPrefix, maxReadLength: opts.maxReadLength ?? 50000 } as const;

  // Built-in tools
  if (!opts.hideSelectSite) {
    registerSelectSite(server, ctx, {});
  }
  registerSearch(server, ctx, { allowWrites: false });
  registerReadTopic(server, ctx, { allowWrites: false });
  registerListUserPosts(server, ctx, { allowWrites: false });
  registerListHotTopics(server, ctx, { allowWrites: false });
  registerListNotifications(server, ctx, { allowWrites: false });
  registerListTopTopics(server, ctx, { allowWrites: false });
  registerListExcellentTopics(server, ctx, { allowWrites: false });
  registerListFunnyTopics(server, ctx, { allowWrites: false });
  registerGetTrustLevelProgress(server, ctx, { allowWrites: false });
}
