import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../../util/logger.js";
import type { SiteState } from "../../site/state.js";
export declare function tryRegisterRemoteTools(server: McpServer, siteState: SiteState, logger: Logger): Promise<void>;
