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
import { registerGetTrustLevelProgress } from "./builtin/get_trust_level_progress.js";

export type ToolsMode = "auto" | "discourse_api_only" | "tool_exec_api";

export interface RegistryOptions {
  allowWrites: boolean;
  toolsMode: ToolsMode;
  // When true, do not register the discourse_select_site tool
  hideSelectSite?: boolean;
  // Optional default search prefix to add to all searches
  defaultSearchPrefix?: string;
}

// Chinese aliases: discourse_* → 美卡_*
const TOOL_ALIASES: Record<string, string> = {
  discourse_search: "美卡_搜索",
  discourse_read_topic: "美卡_读帖",
  discourse_get_user_activity: "美卡_用户动态",
  discourse_list_hot_topics: "美卡_热帖",
  discourse_list_notifications: "美卡_通知",
  discourse_list_top_topics: "美卡_热榜",
  discourse_list_excellent_topics: "美卡_精华",
  discourse_list_funny_topics: "美卡_搞笑",
  discourse_get_trust_level_progress: "美卡_等级进度",
  discourse_create_post: "美卡_发帖",
  discourse_create_topic: "美卡_新主题",
  discourse_create_category: "美卡_新板块",
  discourse_create_user: "美卡_新用户",
  discourse_select_site: "美卡_选站",
};

/**
 * Wraps an McpServer to also register each tool under its Chinese alias.
 * The alias tool has the same metadata and handler as the original.
 */
function withAliases(server: McpServer): McpServer {
  const origRegister = server.registerTool.bind(server);

  server.registerTool = function (name: string, metadata: any, handler: any) {
    // Register original
    origRegister(name, metadata, handler);
    // Register alias if one exists
    const alias = TOOL_ALIASES[name];
    if (alias) {
      origRegister(alias, { ...metadata, title: `${metadata.title} (${alias})` }, handler);
    }
  } as typeof server.registerTool;

  return server;
}

export async function registerAllTools(
  server: McpServer,
  siteState: SiteState,
  logger: Logger,
  opts: RegistryOptions & { maxReadLength?: number }
) {
  const ctx = { siteState, logger, defaultSearchPrefix: opts.defaultSearchPrefix, maxReadLength: opts.maxReadLength ?? 50000 } as const;
  const aliasedServer = withAliases(server);

  // Built-in tools
  if (!opts.hideSelectSite) {
    registerSelectSite(aliasedServer, ctx, { allowWrites: false, toolsMode: opts.toolsMode });
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
  registerGetTrustLevelProgress(server, ctx, { allowWrites: false });
}
