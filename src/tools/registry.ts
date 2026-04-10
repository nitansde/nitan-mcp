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
    registerSelectSite(aliasedServer, ctx, {});
  }
  registerSearch(aliasedServer, ctx, { allowWrites: false });
  registerReadTopic(aliasedServer, ctx, { allowWrites: false });
  registerListUserPosts(aliasedServer, ctx, { allowWrites: false });
  registerListHotTopics(aliasedServer, ctx, { allowWrites: false });
  registerListNotifications(aliasedServer, ctx, { allowWrites: false });
  registerListTopTopics(aliasedServer, ctx, { allowWrites: false });
  registerListExcellentTopics(aliasedServer, ctx, { allowWrites: false });
  registerListFunnyTopics(aliasedServer, ctx, { allowWrites: false });
  registerGetTrustLevelProgress(aliasedServer, ctx, { allowWrites: false });
}
