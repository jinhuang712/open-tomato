import { Plugin } from "@opencode/plugin";
import { ProjectStore } from "@opentomato/core/headless";
import { registerAgents } from "./agents.ts";
import { entryCommand } from "./entry.ts";
import { createWriteGate } from "./gate.ts";
import { roleOf } from "./roles.ts";
import { materialTools } from "./tools.ts";

/**
 * OpenTomato 的 opencode v2 插件。装在一本书的目录上（项目 opencode.json 的 plugins），
 * 这个目录就是一个 OpenTomato 项目：和桌面 App 同一套目录结构，两边都能打开。
 */
export default Plugin.define({
  id: "opentomato",
  setup: async (ctx) => {
    const root = ctx.location.directory;
    const store = (await ProjectStore.exists(root))
      ? await ProjectStore.open(root)
      : await ProjectStore.create(root, "");
    console.log(`[opentomato] 项目：${store.info.name}（${root}）`);

    const tools = materialTools(store);
    await ctx.tool.transform((editor) => {
      for (const tool of tools) editor.add(tool);
    });
    await ctx.agent.transform(registerAgents);
    await ctx.command.transform((editor) => {
      editor.add(entryCommand(ctx.session, async () => store));
    });

    const gate = createWriteGate(store, new Set(tools.map((tool) => tool.name)));
    await ctx.tool.hook("execute.before", (event) => gate.before(event));
    await ctx.permission.hook("evaluate", (event) => gate.evaluate(event));
    await ctx.tool.hook("execute.after", (event) => gate.after(event));
    // patch 和 write / edit 共用 edit 权限，规则收不掉，只能从写作角色的工具清单里拿走
    await ctx.session.hook("context", (event) => {
      if (roleOf(event.agent)) delete event.tools.patch;
    });
  },
});
