import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { text, type ToolContext } from "./shared.js";
import { searchWeb } from "../websearch.js";

const SEARCH_NOTICE = textValue("app/messages/session", "search-notice");

export function makeWebSearchTool(_ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "web_search",
    label: textValue("app/tools/conversation", "web_search.label"),
    description:
      textValue("app/tools/conversation", "web_search.description"),
    parameters: Type.Object({
      query: Type.String({ description: textValue("app/tools/conversation", "web_search.parameters.query.description") }),
      numResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, description: textValue("app/tools/conversation", "web_search.parameters.numResults.description") })),
      deep: Type.Optional(Type.Boolean({ description: textValue("app/tools/conversation", "web_search.parameters.deep.description") })),
    }),
    execute: async (_id, params, signal) => {
      const out = await searchWeb(params.query, { ...(params.numResults ? { numResults: params.numResults } : {}), type: params.deep ? "deep" : "auto" }, signal);
      return text(`${SEARCH_NOTICE}\n\n${out}`);
    },
  });
}
