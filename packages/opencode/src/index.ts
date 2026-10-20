import { Plugin } from "@opencode/plugin";
import { childRoster, registerAgents } from "./agents.ts";
import { createBook } from "./book.ts";
import { entryCommand } from "./entry.ts";
import { createWriteGate } from "./gate.ts";
import { roleOf } from "./roles.ts";
import { materialTools } from "./tools.ts";

/**
 * OpenTomato 的 opencode v2 插件。可以全局装，平时不出声：不碰磁盘、不改默认 agent，
 * 写作角色和工具对别的 agent 都不可见。作者输入 /open-tomato，当前目录才作为一本书打开（不是就新建，
 * 和桌面 App 同一套目录结构），会话交给主编。
 */
export default Plugin.define({
  id: "opentomato",
  setup: async (ctx) => {
    const book = createBook(ctx.location.directory);

    const tools = materialTools(book.require);
    await ctx.tool.transform((editor) => {
      for (const tool of tools) editor.add(tool);
    });
    await ctx.agent.transform(registerAgents);
    await ctx.command.transform((editor) => {
      editor.add(entryCommand(ctx.session, book.open));
    });

    const gate = createWriteGate(book.require, new Set(tools.map((tool) => tool.name)));
    await ctx.tool.hook("execute.before", (event) => gate.before(event));
    await ctx.permission.hook("evaluate", (event) => gate.evaluate(event));
    await ctx.tool.hook("execute.after", (event) => gate.after(event));

    const roster = childRoster();
    await ctx.session.hook("context", (event) => {
      const role = roleOf(event.agent);
      if (!role) return;
      // patch 和 write / edit 共用 edit 权限，规则收不掉，只能从写作角色的工具清单里拿走
      delete event.tools.patch;
      const subagent = event.tools.subagent;
      if (role === "director" && subagent)
        subagent.description = `${subagent.description}\n\n${roster}`;
    });
  },
});
