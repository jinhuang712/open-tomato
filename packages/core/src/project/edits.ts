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
    super(`第 ${index + 1} 处修改：${message}`);
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
  if (edits.length === 0) throw new Error("edits 为空，没有要改的内容");
  let text = raw;
  edits.forEach((e, i) => {
    if (e.old === e.new) throw new EditError(i, "old 和 new 相同，没有变化");
    if (e.old === "") {
      const sep = text.endsWith("\n") || text === "" ? "" : "\n";
      text = `${text}${sep}${e.new}`;
      return;
    }
    const n = countOccurrences(text, e.old);
    if (n === 0) {
      const firstLine = e.old.split("\n")[0]?.trim() ?? "";
      const hint = firstLine && text.includes(firstLine) ? "首行能找到但整段对不上，多半是换行或空格不一致；请重新 read_doc 取原文" : "文件里没有这段文字，可能已被改过；请重新 read_doc 再改";
      throw new EditError(i, `找不到「${preview(e.old)}」。${hint}`);
    }
    if (n > 1) {
      // 模型常拿 frontmatter 的「---」当「正文开头」的坐标，文件里前后各一条必然撞车；直说该怎么办，省一轮往返
      if (/^-{3,}$/.test(e.old.trim())) {
        throw new EditError(i, "「---」是 frontmatter 的分隔线，文件里前后各一条，不能当锚点。要在正文里改就逐字照抄正文里的原句；文档还是空模板、要铺全文就用 write_doc");
      }
      throw new EditError(i, `「${preview(e.old)}」出现了 ${n} 次，请把 old 多带一两行上下文以唯一定位`);
    }
    text = text.replace(e.old, () => e.new);
  });
  return text;
}
