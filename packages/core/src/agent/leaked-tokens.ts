import type { ContextEvent, Extension, ExtensionHandler } from "@earendil-works/pi-coding-agent";

type AgentMessage = ContextEvent["messages"][number];
type HandlerFn = Extension["handlers"] extends Map<string, (infer H)[]> ? H : never;

/**
 * 有些模型会把自己的控制记号漏进正文或思考里：
 * - DeepSeek 的 DSML 标签，如 `</｜｜DSML｜｜parameter>`、`<｜DSML｜tool_call>`
 * - 豆包 seed 系列的原生工具调用外壳 `<seed:tool_call><function …><parameter …>…`
 * - 通用的 `<|im_end|>`、`<｜end▁of▁sentence｜>` 这类特殊 token
 * 这些记号对作者是乱码，对下一轮的模型是误导（会照着学）。发给界面前和发给模型前都剥掉。
 */
const LEAK_PATTERNS: RegExp[] = [
  // DSML 标签整段：开闭标签都算，名字后可能跟属性
  /<\/?[｜|]{1,2}DSML[｜|]{1,2}[^<>]*>/g,
  // seed 原生工具调用块：从开壳到闭壳；没闭壳就到文本末尾
  /<seed:tool_call>[\s\S]*?(?:<\/seed:tool_call>|$)/g,
  // 落单的 seed 外壳标签：开标签必须带 name= 属性，免得误伤正文里偶然出现的同名词
  /<(?:function|parameter)\s+name=[^<>]*>|<\/(?:seed:tool_call|function|parameter)>/g,
  // `<|xxx|>` 形态的特殊 token，中间不含尖括号与空白
  /<[｜|][^<>\s｜|]{1,64}[｜|]>/g,
];

/** 剥掉泄漏的控制记号；没有泄漏就原样返回同一个字符串 */
export function stripLeakedTokens(text: string): string {
  if (!text || !text.includes("<")) return text;
  let out = text;
  for (const p of LEAK_PATTERNS) out = out.replace(p, "");
  return out;
}

function cleanBlock<T extends { type: string }>(b: T): T {
  if (b.type === "text") {
    const t = (b as { text?: unknown }).text;
    if (typeof t !== "string") return b;
    const s = stripLeakedTokens(t);
    return s === t ? b : { ...b, text: s };
  }
  if (b.type === "thinking") {
    const t = (b as { thinking?: unknown }).thinking;
    if (typeof t !== "string") return b;
    const s = stripLeakedTokens(t);
    return s === t ? b : { ...b, thinking: s };
  }
  return b;
}

/** 历史里 assistant 消息的 text / thinking 块都过一遍；没动过的消息返回原对象 */
export function stripLeakedFromMessages(messages: AgentMessage[]): AgentMessage[] {
  let changed = false;
  const out = messages.map((m) => {
    if (m.role !== "assistant" || !Array.isArray(m.content)) return m;
    let touched = false;
    const content = m.content.map((b) => {
      const c = cleanBlock(b);
      if (c !== b) touched = true;
      return c;
    });
    if (!touched) return m;
    changed = true;
    return { ...m, content } as AgentMessage;
  });
  return changed ? out : messages;
}

const onContext: ExtensionHandler<ContextEvent, { messages: AgentMessage[] }> = (event) => ({ messages: stripLeakedFromMessages(event.messages) });

/** 只挂一个 context 处理器的内存扩展，形状与 stub-strip 一致 */
export function leakedTokensExtension(): Extension {
  return {
    path: "<inline:leaked-tokens>",
    resolvedPath: "<inline:leaked-tokens>",
    hidden: true,
    sourceInfo: { path: "<inline:leaked-tokens>", source: "inline", scope: "temporary", origin: "top-level" },
    handlers: new Map([["context", [onContext as unknown as HandlerFn]]]),
    tools: new Map(),
    messageRenderers: new Map(),
    commands: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
  };
}
