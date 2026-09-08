import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * bun 把所有测试文件跑在同一个进程里，Happy-DOM 的全局注册只能成功一次 —— 第二个文件再注册会直接抛。
 * 要 DOM 的测试都从这儿引，谁先跑都不影响别人。注册要早于被测模块载入，所以那些模块得动态引。
 */
export function useDom(): void {
  if (!(globalThis as { document?: unknown }).document) GlobalRegistrator.register();
}
