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
      "对作者说一段话，作者会立刻看到。这是你对作者说话的唯一方式：做完一件事、想明白一件事、子 agent 的结论回来了，都用它说一句。要问作者问题时不用它，用 ask_user，那里自带说话的位置。",
    parameters: Type.Object({
      text: Type.String({ description: "对作者说的话，支持 Markdown。像编辑跟作者说话：有想法就说，看到问题就指出来；作者看侧栏就能知道的事不用说" }),
    }),
    prepareArguments: (args: unknown) => {
      const raw = (args ?? {}) as Record<string, unknown>;
      return { text: typeof raw.text === "string" ? unescapeNewlines(raw.text) : "" };
    },
    execute: async (_id, params) => text(params.text.trim() ? "作者已看到。" : "空话，作者没看到什么。"),
  });
}
