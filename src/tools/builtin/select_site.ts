import { z } from "zod";
import type { RegisterFn } from "../types.js";

export const registerSelectSite: RegisterFn = (server, ctx, opts) => {
  const schema = z.object({
    site: z.string().url().describe("Base URL of the Discourse site"),
  });

  server.registerTool(
    "discourse_select_site",
    {
      title: "Select Site",
      description: "Select a Discourse site for subsequent tool calls.",
      inputSchema: schema.shape,
    },
    async ({ site }, _extra: any) => {
      try {
        const { base } = ctx.siteState.selectSite(site);

        const text = `Selected site: ${base}`;
        return { content: [{ type: "text", text }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Failed to select site: ${e?.message || String(e)}` }], isError: true };
      }
    }
  );
};
