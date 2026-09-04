import type { ContextEvent, Extension, ExtensionHandler } from "@earendil-works/pi-coding-agent";
import { STUB_PATTERN } from "../protocol.js";

type AgentMessage = ContextEvent["messages"][number];
/** pi 内部把处理器统一存成 (...args: unknown[]) => Promise<unknown>，类型上对不齐，这里只做一次转换 */
type HandlerFn = Extension["handlers"] extends Map<string, (infer H)[]> ? H : never;

/**
 * 界面按钮发出的消息带 ⟦stub:标签⟧ 前缀，前缀只给渲染层画芯片用，模型不需要看见。
 * 消息原样存进会话（渲染层回放时靠它认标签），发给模型前在这里剥掉。
 */
function stripStub(m: AgentMessage): AgentMessage {
  if (m.role !== "user") return m;
  if (typeof m.content === "string") {
    return STUB_PATTERN.test(m.content) ? { ...m, content: m.content.replace(STUB_PATTERN, "") } : m;
  }
  const first = m.content[0];
  if (!first || first.type !== "text" || !STUB_PATTERN.test(first.text)) return m;
  return { ...m, content: [{ ...first, text: first.text.replace(STUB_PATTERN, "") }, ...m.content.slice(1)] };
}

const onContext: ExtensionHandler<ContextEvent, { messages: AgentMessage[] }> = (event) => ({ messages: event.messages.map(stripStub) });

/** 只挂一个 context 处理器的内存扩展；pi 没导出从工厂造扩展的函数，按 Extension 形状直接拼 */
export function stubStripExtension(): Extension {
  return {
    path: "<inline:stub-strip>",
    resolvedPath: "<inline:stub-strip>",
    hidden: true,
    sourceInfo: { path: "<inline:stub-strip>", source: "inline", scope: "temporary", origin: "top-level" },
    handlers: new Map([["context", [onContext as unknown as HandlerFn]]]),
    tools: new Map(),
    messageRenderers: new Map(),
    commands: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
  };
}
