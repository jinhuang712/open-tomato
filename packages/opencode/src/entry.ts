import { pluginText as textValue } from "./text.ts";
import type { CommandDefinition } from "@opencode/plugin/promise/command";
import type { Plugin } from "@opencode/plugin";
import type { ProjectStore } from "@opentomato/core/headless";
import { agentIdOf } from "./roles.ts";

/** 唯一入口：输入 /open-tomato 才进入写作，其余时候插件不出声 */
export const ENTRY = "open-tomato";

const OPENING = textValue("open");

/**
 * 打开（不是项目就新建）这本书，把会话交给主编，再把作者跟在命令后面的话转过去。
 * 只敲了命令没说话，就告诉主编作者进来了；接下来做什么由主编看盘面定，这里不替它安排。
 */
export function entryCommand(
  session: Plugin.Context["session"],
  open: () => Promise<ProjectStore>,
): CommandDefinition {
  return {
    name: ENTRY,
    description: textValue("entry.description"),
    execute: async ({ sessionID, prompt, delivery }) => {
      await open();
      await session.switchAgent({ sessionID, agent: agentIdOf("director") });
      const said = prompt.text.trim();
      // 附件、@ 提到的 agent 原样带过去；两边的类型只在 exactOptionalPropertyTypes 下对不上
      const input = { ...prompt, sessionID, text: said === "" ? OPENING : said, delivery };
      await session.prompt(input as Parameters<typeof session.prompt>[0]);
    },
  };
}
