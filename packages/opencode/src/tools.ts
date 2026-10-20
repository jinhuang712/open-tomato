import type { Info as ToolInfo } from "@opencode/plugin/promise/tool";
import {
  Gate,
  makeDocTemplateTool,
  makeListDocsTool,
  makeListOpenTool,
  makeLoadCapabilityTool,
  makeProjectOverviewTool,
  makeReadDocTool,
  makeRunCheckTool,
  makeSearchDocsTool,
  runCheck,
  SearchIndex,
  type ProjectStore,
  type ToolContext,
} from "@opentomato/core/headless";

/** 插件工具的权限动作前缀：每个工具的动作是 opentomato.<工具名>，deny「opentomato.*」就整组看不见 */
export const TOOL_PERMISSION = "opentomato";

type CoreTool = ReturnType<typeof makeReadDocTool>;

/**
 * 只读工具直接用 core 的实现：名字、说明、参数、输出格式和 App 里一字不差，角色提示词里提到的工具名都对得上。
 * 落盘不走这里——写入用 opencode 自带的 write / edit，桌面端才画得出 diff、弹得出审批。
 */
export function materialTools(store: ProjectStore): ToolInfo[] {
  const ctx: ToolContext = {
    store,
    gate: new Gate(noGate),
    agentId: "opencode",
    runCheck: () => runCheck(store),
    docsChanged: () => runCheck(store),
    // 作者随时可能在编辑器里直接改文件，索引不缓存，每次现建
    search: async (query, limit) => (await SearchIndex.build(store)).query(query, limit),
  };
  return [
    makeProjectOverviewTool(ctx),
    makeListDocsTool(ctx),
    makeReadDocTool(ctx),
    makeSearchDocsTool(ctx),
    makeDocTemplateTool(ctx),
    makeRunCheckTool(ctx),
    makeListOpenTool(ctx),
    makeLoadCapabilityTool(ctx),
  ].map(adapt);
}

function adapt(tool: CoreTool): ToolInfo {
  return {
    name: tool.name,
    description: tool.description,
    // typebox 的 schema 就是 JSON Schema，转一道去掉它挂在对象上的 symbol 键
    input: JSON.parse(JSON.stringify(tool.parameters)),
    options: { codemode: false, permission: `${TOOL_PERMISSION}.${tool.name}` },
    execute: async (input, context) => {
      const result = await tool.execute(
        context.id,
        input,
        context.signal,
        undefined,
        undefined as never,
      );
      const text = result.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n");
      return { content: text };
    },
  };
}

const noGate = {
  approvalRequested: () => {
    throw new Error("插件里没有 App 的审批门：落盘走 opencode 的 write / edit");
  },
  approvalClosed: () => {},
  questionRequested: () => {
    throw new Error("插件里没有 App 的提问门：问作者用 opencode 的 question");
  },
  questionClosed: () => {},
};
