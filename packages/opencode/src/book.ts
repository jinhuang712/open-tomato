import { text as textValue } from "@opentomato/core/headless";
import { ProjectStore } from "@opentomato/core/headless";
import { ENTRY } from "./entry.ts";

/** 当前目录这本书。插件加载时不碰磁盘，作者输入 /open-tomato 才打开或新建 */
export interface Book {
  /** /open-tomato 用：不是项目就按 App 的结构新建 */
  open(): Promise<ProjectStore>;
  /** 写作工具和写入钩子用：已经是项目就打开（opencode 重启后接着写），不是就让作者先进入口 */
  require(): Promise<ProjectStore>;
}

export function createBook(root: string): Book {
  let ready: ProjectStore | undefined;
  let pending: Promise<ProjectStore> | undefined;

  const load = async (create: boolean): Promise<ProjectStore> => {
    if (ready) return ready;
    if (await ProjectStore.exists(root)) pending ??= ProjectStore.open(root);
    else if (create) pending ??= ProjectStore.create(root, "");
    else throw new Error(textValue("messages/opencode", "book.message", { v0: ENTRY }));
    try {
      ready = await pending;
      return ready;
    } catch (error) {
      pending = undefined;
      throw error;
    }
  };

  return { open: () => load(true), require: () => load(false) };
}
