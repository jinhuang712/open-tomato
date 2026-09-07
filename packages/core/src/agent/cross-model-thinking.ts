import type { ContextEvent, Extension, ExtensionHandler } from "@earendil-works/pi-coding-agent";

type AgentMessage = ContextEvent["messages"][number];
type HandlerFn = Extension["handlers"] extends Map<string, (infer H)[]> ? H : never;

/** 判定历史里这条 assistant 消息是不是当前模型产出的，三元组齐等才算同一个模型 */
export interface ModelIdentity {
  provider: string;
  api: string;
  id: string;
}

/**
 * 会话中途换模型后，pi-ai 回放历史时会把别的模型产出的 thinking 块转成普通 text 发给新模型。
 * 几十条长篇推理就这样变成了「主编说过的话」，新模型照着学，把推理直接写进正文，界面上就成了思考过程全打印出来。
 * 这里在发给模型前把跨模型的 thinking 块整个丢掉：推理只对产出它的模型有意义，别的模型看见只会被带偏。
 */
export function dropForeignThinking(messages: AgentMessage[], current: ModelIdentity | undefined): AgentMessage[] {
  if (!current) return messages;
  let changed = false;
  const out = messages.map((m) => {
    if (m.role !== "assistant") return m;
    const same = m.provider === current.provider && m.api === current.api && m.model === current.id;
    if (same) return m;
    if (!m.content.some((b) => b.type === "thinking")) return m;
    changed = true;
    return { ...m, content: m.content.filter((b) => b.type !== "thinking") };
  });
  return changed ? out : messages;
}

const onContext: ExtensionHandler<ContextEvent, { messages: AgentMessage[] }> = (event, ctx) => {
  const m = ctx.model;
  const current = m ? { provider: m.provider, api: m.api, id: m.id } : undefined;
  return { messages: dropForeignThinking(event.messages, current) };
};

/** 只挂一个 context 处理器的内存扩展，形状与 stub-strip 一致 */
export function crossModelThinkingExtension(): Extension {
  return {
    path: "<inline:cross-model-thinking>",
    resolvedPath: "<inline:cross-model-thinking>",
    hidden: true,
    sourceInfo: { path: "<inline:cross-model-thinking>", source: "inline", scope: "temporary", origin: "top-level" },
    handlers: new Map([["context", [onContext as unknown as HandlerFn]]]),
    tools: new Map(),
    messageRenderers: new Map(),
    commands: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
  };
}
