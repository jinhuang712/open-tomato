import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { text, type ToolContext } from "./shared.js";
import { searchWeb } from "../websearch.js";
import { loadPrompt } from "../prompt-text.js";

const SEARCH_NOTICE = loadPrompt("shared/search-notice");

export function makeWebSearchTool(_ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "web_search",
    label: "搜网络",
    description:
      "联网搜索，查项目文档里没有的现实资料：历史背景、行业常识、地名物价、专业术语、同类作品套路等。返回若干条「标题 / URL / 摘要」。用途是给设定和情节找依据，搜到的东西不会自动保存：有价值的结论要连来源 URL 一起写进对应的卡片（write_doc / edit_doc），在回复里引用时也带上出处。一次查一个具体问题，中文英文都行；结果不满意换个说法再搜，不要连搜同一句。",
    parameters: Type.Object({
      query: Type.String({ description: "具体的搜索词，带年代 / 地域 / 领域限定更准，例如「1999年 上海 快递员 月薪」" }),
      numResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, description: "条数，默认 5" })),
      deep: Type.Optional(Type.Boolean({ description: "true 用深度搜索，慢但全；默认 false" })),
    }),
    execute: async (_id, params, signal) => {
      const out = await searchWeb(params.query, { ...(params.numResults ? { numResults: params.numResults } : {}), type: params.deep ? "deep" : "auto" }, signal);
      return text(`${SEARCH_NOTICE}\n\n${out}`);
    },
  });
}
