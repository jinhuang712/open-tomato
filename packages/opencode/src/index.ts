import { Plugin } from "@opencode/plugin";
import { ProjectStore } from "@opentomato/core/headless";
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
  },
});
