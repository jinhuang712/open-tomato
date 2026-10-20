import type { defineTool as piDefineTool } from "@earendil-works/pi-coding-agent";

/**
 * pi 的 defineTool 只是把定义原样返回，这里照抄一份：工具模块运行时就不必加载 pi 整个包，
 * 不跑内核的宿主（opencode 插件）也能直接复用这些工具。签名仍以 pi 的为准。
 */
export const defineTool = ((tool: unknown) => tool) as typeof piDefineTool;
