import { registerSearch } from "./builtin/search.js";
import { registerReadTopic } from "./builtin/read_topic.js";
import { registerCreatePost } from "./builtin/create_post.js";
import { registerCreateCategory } from "./builtin/create_category.js";
import { registerCreateTopic } from "./builtin/create_topic.js";
import { registerSelectSite } from "./builtin/select_site.js";
import { registerCreateUser } from "./builtin/create_user.js";
import { registerListUserPosts } from "./builtin/list_user_posts.js";
import { registerListHotTopics } from "./builtin/list_hot_topics.js";
import { registerListNotifications } from "./builtin/list_notifications.js";
import { registerListTopTopics } from "./builtin/list_top_topics.js";
import { registerListExcellentTopics } from "./builtin/list_excellent_topics.js";
import { registerListFunnyTopics } from "./builtin/list_funny_topics.js";
export async function registerAllTools(server, siteState, logger, opts) {
    const ctx = { siteState, logger, defaultSearchPrefix: opts.defaultSearchPrefix, maxReadLength: opts.maxReadLength ?? 50000 };
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
//# sourceMappingURL=registry.js.map