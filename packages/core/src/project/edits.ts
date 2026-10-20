import { text as textValue } from "../text/load.js";
/** 对文件文本做 old → new 的局部替换；原文片段即坐标，必须在文件里唯一匹配 */

export interface TextEdit {
  /** 要被替换的原文片段，须在文件中唯一出现；为空串表示追加到文末 */
  old: string;
  /** 替换后的文本；为空串表示删除 old */
  new: string;
}

export class EditError extends Error {
  constructor(
    public readonly index: number,
    message: string,
  ) {
    super(textValue("messages/materials", "edits.message", { v0: index + 1, v1: message }));
  }
}

const preview = (s: string, n = 30) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};

function countOccurrences(hay: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return count;
    count++;
    from = i + needle.length;
  }
}

/**
 * 顺序应用所有修改，返回新全文。任一处失败即整体失败（不做部分应用）。
 * 匹配严格按字面；找不到时给出提示，帮模型判断是原文已变还是引用不准。
 */
export function applyEdits(raw: string, edits: TextEdit[]): string {
  if (edits.length === 0) throw new Error(textValue("messages/materials", "edits.message_2"));
  let text = raw;
  edits.forEach((e, i) => {
    if (e.old === e.new) throw new EditError(i, textValue("messages/materials", "edits.message_3"));
    if (e.old === "") {
      const sep = text.endsWith("\n") || text === "" ? "" : "\n";
      text = `${text}${sep}${e.new}`;
      return;
    }
    const n = countOccurrences(text, e.old);
    if (n === 0) {
      const firstLine = e.old.split("\n")[0]?.trim() ?? "";
      const hint = firstLine && text.includes(firstLine) ? textValue("messages/materials", "edits.message_4") : textValue("messages/materials", "edits.message_5");
      throw new EditError(i, textValue("messages/materials", "edits.message_6", { v0: preview(e.old), v1: hint }));
    }
    if (n > 1) {
      // 模型常拿 frontmatter 的「---」当「正文开头」的坐标，文件里前后各一条必然撞车；直说该怎么办，省一轮往返
      if (/^-{3,}$/.test(e.old.trim())) {
        throw new EditError(i, textValue("messages/materials", "edits.message_7"));
      }
      throw new EditError(i, textValue("messages/materials", "edits.message_8", { v0: preview(e.old), v1: n }));
    }
    text = text.replace(e.old, () => e.new);
  });
  return text;
}
