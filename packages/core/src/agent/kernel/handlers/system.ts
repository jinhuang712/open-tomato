import { ProjectStore } from "../../../project/store.js";
import { buildStorySeed, storySeedFilename } from "../../../project/seed.js";
import type { HandlerMap, KernelApi } from "./shared.js";

export function systemHandlers(
  api: KernelApi,
): Pick<
  HandlerMap,
  "kernel.reset" | "project.create" | "project.open" | "project.close" | "project.recent" | "project.forget" | "project.exportSeed"
> {
  return {
    "kernel.reset": async () => {
      await api.closeProject();
      return null;
    },
    // 先把新项目立起来再关旧的：新项目开不了（路径不对、已存在）时，当前项目保持原样
    "project.create": async ({ root, name }) => {
      const store = await ProjectStore.create(root, name);
      await api.closeProject();
      api.setStore(store);
      await api.afterOpen("new");
      return store.info;
    },
    "project.open": async ({ root }) => {
      const store = await ProjectStore.open(root);
      await api.closeProject();
      api.setStore(store);
      await api.afterOpen("continue");
      return store.info;
    },
    "project.close": async () => {
      await api.closeProject();
      return null;
    },
    // 磁盘上已经不是项目的（目录被删、被改名）顺手从列表摘掉，首页不留死卡片
    "project.recent": async () => {
      const all = api.models.recentProjects;
      const alive = await Promise.all(all.map((root) => ProjectStore.exists(root)));
      for (const [i, root] of all.entries()) if (!alive[i]) await api.models.forgetProject(root);
      return api.models.recentProjects;
    },
    "project.forget": async ({ root }) => {
      await api.models.forgetProject(root);
      return null;
    },
    "project.exportSeed": async () => {
      const store = api.requireStore();
      const now = new Date();
      return { filename: storySeedFilename(store.info.name, now), content: await buildStorySeed(store, now) };
    },
  };
}
