import path from "node:path";
import { projectSlug } from "../../../cloud/sync.js";
import { ProjectStore } from "../../../project/store.js";
import type { HandlerMap, KernelApi } from "./shared.js";

export function cloudHandlers(
  api: KernelApi,
): Pick<
  HandlerMap,
  | "cloud.status"
  | "cloud.configure"
  | "cloud.clear"
  | "cloud.list"
  | "cloud.check"
  | "cloud.upload"
  | "cloud.download"
  | "cloud.remove"
  | "cloud.wipe"
> {
  return {
    "cloud.status": async () => api.clouds.status(),
    "cloud.configure": async ({ url, serviceKey, bucket }) => {
      const status = await api.clouds.configure(url, serviceKey, bucket ?? "");
      api.clouds.start(() => api.getStore()?.info ?? null);
      return status;
    },
    "cloud.clear": async () => api.clouds.clear(),
    "cloud.list": async () =>
      api.clouds.requireCloud().listWithLocals(api.models.recentProjects, async (root) =>
        (await ProjectStore.exists(root)) ? (await ProjectStore.open(root)).info.name : null,
      ),
    "cloud.check": async () => api.clouds.requireCloud().check(api.requireStore().info),
    "cloud.upload": async ({ force }) => api.clouds.upload(api.requireStore().info, force === true),
    "cloud.download": async ({ slug, dest, replace }) => {
      // 覆盖的目标可能正是当前项目：先关掉，agent 不能在被替换的目录上继续写
      const current = api.getStore();
      if (replace && current && path.resolve(current.info.root) === path.resolve(dest)) await api.closeProject();
      const { root } = await api.clouds.requireCloud().download(slug, dest, { replace: replace === true });
      const store = await ProjectStore.open(root);
      await api.closeProject();
      api.setStore(store);
      await api.afterOpen("continue");
      return store.info;
    },
    "cloud.remove": async ({ root }) => {
      const cloud = api.clouds.requireCloud();
      const { name } = (await ProjectStore.open(root)).info;
      await cloud.removeProject(projectSlug(name));
      if (api.getStore()?.info.name === name) api.clouds.markUnsynced();
      return null;
    },
    "cloud.wipe": async () => {
      const removed = await api.clouds.requireCloud().wipe();
      if (api.getStore()) api.clouds.markUnsynced();
      return { removed };
    },
  };
}
