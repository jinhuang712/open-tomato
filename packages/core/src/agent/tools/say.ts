import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { unescapeNewlines } from "./ask-args.js";
import { text, type ToolContext } from "./shared.js";

/**
 * 对作者说话。作者只看到 say 和 ask_user 里的话，模型的裸文本不进记录。
 * 说话是和读文档、写文档平级的一个动作，不问问题时也随时能说。
 */
export function makeSayTool(_ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "say",
    label: "对作者说",
    description:
      "向作者说一段话，用于回答、讨论、解释、分享判断与灵感，以及交代有意义的进展和结果。自然承接当前对话，根据内容决定篇幅与结构。后台结果先理解再转述，保留影响作者判断的信息，无需逐项汇报工具动作，也不重复已经讲清的内容。这次只需表达时使用本工具；表达后需要作者回答时，可以直接使用 ask_user，在其中的 say 字段完成解释。说清楚后可以结束，不必附带问题或下一步安排。",
    parameters: Type.Object({
      text: Type.String({ description: "对作者说的话，支持 Markdown。遵循主编的共同沟通原则，自然回应作者当前关切" }),
    }),
    prepareArguments: (args: unknown) => {
      const raw = (args ?? {}) as Record<string, unknown>;
      return { text: typeof raw.text === "string" ? unescapeNewlines(raw.text) : "" };
    },
    execute: async (_id, params) => text(params.text.trim() ? "作者已看到。" : "空话，作者没看到什么。"),
  });
}
