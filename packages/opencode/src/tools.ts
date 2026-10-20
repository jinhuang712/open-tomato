import { hostText, text as textValue } from "@opentomato/core/headless";
import type { Info as ToolInfo } from "@opencode/plugin/promise/tool";
import {
  Gate,
  makeDocTemplateTool,
  makeListDocsTool,
  makeListOpenTool,
  makeLoadCapabilityTool,
  makeProjectOverviewTool,
  makeReadDocTool,
  makeReadReviewTool,
  makeRunCheckTool,
  makeSaveReviewTool,
  makeSearchDocsTool,
  makeVolumeRhythmTool,
  ROLE_IDS,
  ROLES,
  runCheck,
  SearchIndex,
  type ProjectStore,
  type ToolContext,
} from "@opentomato/core/headless";
import { agentIdOf } from "./roles.ts";

/** 插件工具的权限动作前缀：每个工具的动作是 opentomato.<工具名>，deny「opentomato.*」就整组看不见 */
export const TOOL_PERMISSION = "opentomato";

type CoreTool = ReturnType<typeof makeReadDocTool>;

/**
 * 只读工具直接用 core 的实现：名字、参数和输出格式沿用 core，说明里的工具名称按宿主适配。
 * 落盘不走这里——写入用 opencode 自带的 write / edit，桌面端才画得出 diff、弹得出审批。
 */
export function materialTools(project: () => Promise<ProjectStore>): ToolInfo[] {
  // 注册时还没打开书：名字、说明、参数取自一份不执行的样本，执行时换成这本书的那一份
  const sample = coreTools(null as unknown as ProjectStore);
  let live: { store: ProjectStore; tools: CoreTools } | undefined;
  const current = async () => {
    const store = await project();
    if (live?.store !== store) live = { store, tools: coreTools(store) };
    return live.tools;
  };
  const [saveReview] = sample.reviews.values();
  if (!saveReview) throw new Error(textValue("messages/opencode", "tools.message"));
  return [
    ...[...sample.shared.values()].map((tool) =>
      adapt(tool, async () => (await current()).shared.get(tool.name) ?? tool),
    ),
    adapt(saveReview, async (agent) => {
      const tool = (await current()).reviews.get(agent);
      if (!tool) throw new Error(textValue("messages/opencode", "tools.message_2"));
      return tool;
    }),
  ];
}

interface CoreTools {
  shared: Map<string, CoreTool>;
  /** save_review 以哪一路评审的身份落记录，看是哪个 agent 在调 */
  reviews: Map<string, CoreTool>;
}

function coreTools(store: ProjectStore): CoreTools {
  const ctx: ToolContext = {
    store,
    gate: new Gate(noGate),
    agentId: "opencode",
    runCheck: () => runCheck(store),
    docsChanged: () => runCheck(store),
    // 作者随时可能在编辑器里直接改文件，索引不缓存，每次现建
    search: async (query, limit) => (await SearchIndex.build(store)).query(query, limit),
  };
  const shared = [
    makeProjectOverviewTool(ctx),
    makeListDocsTool(ctx),
    makeReadDocTool(ctx),
    makeSearchDocsTool(ctx),
    makeDocTemplateTool(ctx),
    makeRunCheckTool(ctx),
    makeListOpenTool(ctx),
    makeLoadCapabilityTool(ctx, "opencode"),
    makeReadReviewTool(ctx),
    makeVolumeRhythmTool(ctx),
  ];
  return {
    shared: new Map(shared.map((tool) => [tool.name, tool])),
    reviews: new Map(
      ROLE_IDS.filter((role) => ROLES[role].canReview).map((role) => [
        agentIdOf(role),
        makeSaveReviewTool(ctx, role),
      ]),
    ),
  };
}

/** pick：按调用的 agent 选用哪一份 core 工具；绝大多数工具只有一份 */
function adapt(tool: CoreTool, pick: (agent: string) => Promise<CoreTool>): ToolInfo {
  return {
    name: tool.name,
    description: hostText(tool.description, "opencode"),
    // typebox 的 schema 就是 JSON Schema，转一道去掉它挂在对象上的 symbol 键
    input: JSON.parse(JSON.stringify(tool.parameters), (key, value) => key === "description" && typeof value === "string" ? hostText(value, "opencode") : value),
    options: { codemode: false, permission: `${TOOL_PERMISSION}.${tool.name}` },
    execute: async (input, context) => {
      const result = await (
        await pick(context.agent)
      ).execute(context.id, input, context.signal, undefined, undefined as never);
      const text = result.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n");
      return { content: text };
    },
  };
}

const noGate = {
  approvalRequested: () => {
    throw new Error(textValue("messages/opencode", "tools.approvalRequested"));
  },
  approvalClosed: () => {},
  questionRequested: () => {
    throw new Error(textValue("messages/opencode", "tools.questionRequested"));
  },
  questionClosed: () => {},
};
