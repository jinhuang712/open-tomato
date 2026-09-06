import { hasLongOptions, QUESTION_KINDS, type QuestionKind, type QuestionOption } from "../../protocol.js";

/** ask_user 的实参键名，漏进 options 数组时要摘掉 */
const ASK_ARG_KEYS: ReadonlySet<string> = new Set(["say", "question", "kind", "options", "allowFreeText"]);

/** question 丢了但候选还在时，用这句话把提问撑起来，作者照样能挑 */
const ASK_FALLBACK_QUESTION = "这些候选里，你更想要哪个方向？";

export type AskOption = QuestionOption;

export interface AskArgs {
  say: string;
  question: string;
  kind: QuestionKind;
  options?: AskOption[];
  allowFreeText?: boolean;
}

const isKind = (v: unknown): v is QuestionKind => typeof v === "string" && (QUESTION_KINDS as readonly string[]).includes(v);

/**
 * 定提问形态。模型给的 kind 只是参考，形状说了算：
 * 1. 没候选 → open
 * 2. 任一候选是 {label, text} → compare
 * 3. 任一纯字串含换行或超过 40 字 → compare（兼容旧行为，模型说 single 也覆盖）
 * 4. 模型给了合法 kind → 用它
 * 5. 否则 → single
 */
export function resolveQuestionKind(given: unknown, options: readonly QuestionOption[]): QuestionKind {
  if (options.length === 0) return "open";
  if (hasLongOptions(options)) return "compare";
  if (isKind(given) && given !== "open" && given !== "compare") return given;
  return "single";
}

/** 模型有时把换行写成字面的反斜杠 n（双重转义）。给作者看的话里不可能真要这两个字符，一律还原成换行 */
export const unescapeNewlines = (s: string) => s.replace(/(?:\\r)?\\n/g, "\n");

/**
 * 流式拼接坏掉时，模型给的 ask_user 实参会带三种伤：question 整个丢失、键名
 * "question" 被当成值塞进 options、末尾候选粘上数组闭合符号。校验器一律判失败，
 * 一次提问就变成一条红色报错。这里在校验前把能救的救回来。
 */
export function repairAskArgs(args: unknown): AskArgs {
  const raw = (args ?? {}) as Record<string, unknown>;
  const say = typeof raw.say === "string" ? unescapeNewlines(raw.say) : "";
  const question = typeof raw.question === "string" && raw.question.trim() ? unescapeNewlines(raw.question) : "";
  const damaged = !question;

  const options: AskOption[] = [];
  for (const item of Array.isArray(raw.options) ? raw.options : []) {
    if (typeof item === "string") {
      const trimmed = unescapeNewlines(item).trim();
      if (!trimmed || ASK_ARG_KEYS.has(trimmed)) continue;
      // 闭合符号只在实参已判损坏时才剥，正常候选不动
      const cleaned = damaged ? trimmed.replace(/\\?["'”]?\s*\]\s*$/, "").trim() : trimmed;
      if (cleaned) options.push(cleaned);
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.label === "string" && typeof o.text === "string") options.push({ label: unescapeNewlines(o.label), text: unescapeNewlines(o.text) });
    }
  }

  return {
    say,
    question: question || ASK_FALLBACK_QUESTION,
    kind: resolveQuestionKind(raw.kind, options),
    ...(options.length ? { options } : {}),
    ...(typeof raw.allowFreeText === "boolean" ? { allowFreeText: raw.allowFreeText } : {}),
  };
}
