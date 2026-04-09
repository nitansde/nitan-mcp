import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../util/logger.js";
import type { SiteState } from "../site/state.js";
import { registerSearch } from "./builtin/search.js";
import { registerReadTopic } from "./builtin/read_topic.js";
import { registerReadPost } from "./builtin/read_post.js";
import { registerListCategories } from "./builtin/list_categories.js";
import { registerListTags } from "./builtin/list_tags.js";
import { registerGetUser } from "./builtin/get_user.js";
import { registerCreatePost } from "./builtin/create_post.js";
import { registerCreateCategory } from "./builtin/create_category.js";
import { registerCreateTopic } from "./builtin/create_topic.js";
import { registerSelectSite } from "./builtin/select_site.js";
import { registerFilterTopics } from "./builtin/filter_topics.js";
import { registerCreateUser } from "./builtin/create_user.js";
import { registerListUserPosts } from "./builtin/list_user_posts.js";
import { registerListHotTopics } from "./builtin/list_hot_topics.js";
import { registerListNotifications } from "./builtin/list_notifications.js";
import { registerListTopTopics } from "./builtin/list_top_topics.js";
import { registerListExcellentTopics } from "./builtin/list_excellent_topics.js";
import { registerListFunnyTopics } from "./builtin/list_funny_topics.js";

export type ToolsMode = "auto" | "discourse_api_only" | "tool_exec_api";

export interface RegistryOptions {
  allowWrites: boolean;
  toolsMode: ToolsMode;
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
    registerSelectSite(server, ctx, { allowWrites: false, toolsMode: opts.toolsMode });
  }
  registerSearch(server, ctx, { allowWrites: false });
  registerReadTopic(server, ctx, { allowWrites: false });
  // registerReadPost(server, ctx, { allowWrites: false });
  // registerListCategories(server, ctx, { allowWrites: false }); // Disabled - categories don't change
  // registerListTags(server, ctx, { allowWrites: false });
  // registerGetUser(server, ctx, { allowWrites: false });
  registerListUserPosts(server, ctx, { allowWrites: false });
  registerListHotTopics(server, ctx, { allowWrites: false });
  registerListNotifications(server, ctx, { allowWrites: false });
  registerListTopTopics(server, ctx, { allowWrites: false });
  registerListExcellentTopics(server, ctx, { allowWrites: false });
  registerListFunnyTopics(server, ctx, { allowWrites: false });
  // registerFilterTopics(server, ctx, { allowWrites: false });
  registerCreatePost(server, ctx, { allowWrites: opts.allowWrites });
  registerCreateUser(server, ctx, { allowWrites: opts.allowWrites });
  registerCreateCategory(server, ctx, { allowWrites: opts.allowWrites });
  registerCreateTopic(server, ctx, { allowWrites: opts.allowWrites });
}
