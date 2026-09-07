import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { unescapeNewlines } from "./ask-args.js";
import { explainedReportsSchema, text, validateExplainedReports, type ToolContext } from "./shared.js";

/**
 * 对作者说话。作者只看到 say 和 ask_user 里的话，模型的裸文本不进记录。
 * 说话是和读文档、写文档平级的一个动作，不问问题时也随时能说。
 */
export function makeSayTool(ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "say",
    label: "对作者说",
    description:
      "向作者发送 Markdown 对话，支持完整解释、讨论、创意和进展说明，按共同沟通原则表达。需要同时等待作者回答时，也可使用 ask_user 的 say 字段。",
    parameters: Type.Object({
      text: Type.String({ description: "对作者说的话，支持 Markdown。遵循主编的共同沟通原则，自然回应作者当前关切" }),
      explainedReports: explainedReportsSchema,
    }),
    prepareArguments: (args: unknown) => {
      const raw = (args ?? {}) as Record<string, unknown>;
      return { text: typeof raw.text === "string" ? unescapeNewlines(raw.text) : "", ...(raw.explainedReports !== undefined ? { explainedReports: raw.explainedReports as string[] } : {}) };
    },
    execute: async (_id, params) => {
      validateExplainedReports(ctx, params.text, params.explainedReports);
      if (params.explainedReports?.length) ctx.acknowledgeReports?.(params.explainedReports);
      return text(params.text.trim() ? "作者已看到。" : "空话，作者没看到什么。");
    },
  });
}
