import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../util/logger.js";
import type { SiteState } from "../site/state.js";
export type ToolsMode = "auto" | "discourse_api_only" | "tool_exec_api";
export interface RegistryOptions {
    allowWrites: boolean;
    toolsMode: ToolsMode;
    hideSelectSite?: boolean;
    defaultSearchPrefix?: string;
}
export declare function registerAllTools(server: McpServer, siteState: SiteState, logger: Logger, opts: RegistryOptions & {
    maxReadLength?: number;
}): Promise<void>;
