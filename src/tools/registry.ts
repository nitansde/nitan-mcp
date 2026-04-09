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

export type ToolsMode = "auto" | "discourse_api_only" | "tool_exec_api";

export interface RegistryOptions {
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
    registerSelectSite(server, ctx, { toolsMode: opts.toolsMode });
  }
  registerSearch(server, ctx, {});
  registerReadTopic(server, ctx, {});
  // registerReadPost(server, ctx, {});
  // registerListCategories(server, ctx, {}); // Disabled - categories don't change
  // registerListTags(server, ctx, {});
  // registerGetUser(server, ctx, {});
  registerListUserPosts(server, ctx, {});
  registerListHotTopics(server, ctx, {});
  registerListNotifications(server, ctx, {});
  registerListTopTopics(server, ctx, {});
  registerListExcellentTopics(server, ctx, {});
  registerListFunnyTopics(server, ctx, {});
  // registerFilterTopics(server, ctx, {});
}
