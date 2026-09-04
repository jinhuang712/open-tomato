import type { CheckIssue, DocHeader, DocKindId } from "../protocol.js";
import { asStringArray, splitSections } from "./frontmatter.js";
import { DOC_KINDS, enumFieldsOf, PLACEHOLDER, requiredFieldsOf, requiredSectionsOf } from "./kinds.js";
import type { ProjectStore } from "./store.js";

export { PLACEHOLDER };
/** 旧写法里的软占位。现在没想好的段不落盘，作者明确搁置的决定记在 frontmatter open 里 */
export const DEFERRED = "待定";

/**
 * 机械对账。只报不拦：
 * - frontmatter 缺必填字段 / 仍是「待填」/ 枚举字段填了范围外的值
 * - 正文残留「待填」；段落只写了「待定」；缺必填段（按 frontmatter 条件算）
 * - 章纲引用的人物 / 线索 / 卷不存在
 * - 正文没有对应章纲
 * - 章号 / 里程碑 order 断档或重复
 */
export async function runCheck(store: ProjectStore): Promise<CheckIssue[]> {
  const issues: CheckIssue[] = [];
  const byKind = new Map<DocKindId, DocHeader[]>();
  for (const k of Object.keys(DOC_KINDS) as DocKindId[]) byKind.set(k, await store.list(k));

  const ids = (k: DocKindId) => new Set((byKind.get(k) ?? []).map((h) => h.id));
  const push = (level: CheckIssue["level"], h: DocHeader | null, message: string, kind: DocKindId | null = h?.kind ?? null, fix?: string) =>
    issues.push({ level, kind, id: h?.id ?? null, path: h?.path ?? null, message, ...(fix ? { fix } : {}) });
  /** 修补请求里指这篇文档的叫法：「人物卡「陈默」」 */
  const ref = (kind: DocKindId, h: DocHeader) => `${DOC_KINDS[kind].label}「${h.title.trim() || h.id}」`;

  for (const [kind, headers] of byKind) {
    for (const h of headers) {
      const fm = { title: h.title, summary: h.summary, status: h.status, ...h.extra };
      const required = requiredFieldsOf(kind, fm);
      if (h.title === PLACEHOLDER || h.title.trim() === "") push("error", h, "title 未填", kind, `${DOC_KINDS[kind].label}「${h.id}」还没起名，帮我定一个 title`);
      if (h.summary === PLACEHOLDER) push("warning", h, "summary 未填", kind, `${ref(kind, h)}的 summary 还没写，帮我补一句`);
      const missingFields = required.filter((f) => {
        const v = h.extra[f];
        return v === undefined || v === null || v === "" || v === PLACEHOLDER;
      });
      for (const f of missingFields) push("error", h, `缺必填字段 ${f}`, kind, `${ref(kind, h)}缺字段 ${f}，帮我补上`);
      for (const { name, options } of enumFieldsOf(kind)) {
        const v = h.extra[name];
        if (v === undefined || v === null || v === "" || v === PLACEHOLDER) continue;
        if (!options.includes(String(v))) {
          const range = options.join(" / ");
          push("error", h, `${name}=${String(v)} 不在取值范围内（${range}）`, kind, `${ref(kind, h)}的 ${name} 填成了「${String(v)}」，只能是 ${range} 之一，帮我改成对的`);
        }
      }
      const doc = await store.read(kind, h.id);
      if (!doc) continue;
      if (doc.body.includes(PLACEHOLDER)) {
        const count = doc.body.split(PLACEHOLDER).length - 1;
        push(kind === "manuscript" ? "error" : "warning", h, `正文残留 ${count} 处「${PLACEHOLDER}」`, kind, `${ref(kind, h)}正文里还有 ${count} 处「${PLACEHOLDER}」，帮我逐处补成正式内容`);
      }
      // 「待定」不是内容：没想好的段不该出现，先放一放的决定记在 frontmatter open 里
      const deferred = splitSections(doc.body).filter((s) => s.heading !== "" && s.content.startsWith(DEFERRED));
      if (deferred.length > 0) {
        const names = deferred.map((s) => s.heading).join("、");
        push("warning", h, `段落只写了「${DEFERRED}」：${names}，没想好就删掉这一段`, kind, `${ref(kind, h)}的「${names}」段只写了「${DEFERRED}」，我们把它定下来`);
      }
      const present = new Set(doc.sections);
      const missing = requiredSectionsOf(kind, fm).filter((s) => !present.has(s.name));
      if (missing.length > 0) {
        const names = missing.map((s) => s.name).join("、");
        push("warning", h, `缺必填段：${names}`, kind, `${ref(kind, h)}还缺「${names}」段，帮我补上`);
      }
    }
  }

  const characters = ids("characters");
  const threads = ids("threads");
  const volumes = ids("volumes");
  for (const h of byKind.get("chapters") ?? []) {
    for (const c of asStringArray(h.extra.characters)) {
      const nid = DOC_KINDS.characters.normalizeId(c);
      if (!characters.has(nid)) push("error", h, `引用了不存在的人物卡「${c}」`);
    }
    for (const t of asStringArray(h.extra.threads)) {
      const nid = DOC_KINDS.threads.normalizeId(t);
      if (!threads.has(nid)) push("error", h, `引用了不存在的线索卡「${t}」`);
    }
    const v = h.extra.volume;
    if (v !== undefined && v !== null && v !== "" && v !== PLACEHOLDER) {
      const nid = DOC_KINDS.volumes.normalizeId(String(v));
      if (!volumes.has(nid)) push("error", h, `引用了不存在的卷纲「${String(v)}」`);
    }
  }

  for (const h of byKind.get("volumes") ?? []) {
    for (const m of asStringArray(h.extra.milestones)) {
      const nid = DOC_KINDS.milestones.normalizeId(m);
      if (!ids("milestones").has(nid)) push("error", h, `引用了不存在的里程碑「${m}」`);
    }
  }

  const chapterIds = ids("chapters");
  for (const h of byKind.get("manuscript") ?? []) {
    if (!chapterIds.has(h.id)) push("warning", h, "没有对应的章纲");
  }

  checkSequence(
    (byKind.get("chapters") ?? []).map((h) => Number(h.id)),
    (msg) => push("warning", null, msg, "chapters"),
    "章纲",
  );
  checkSequence(
    (byKind.get("manuscript") ?? []).map((h) => Number(h.id)),
    (msg) => push("warning", null, msg, "manuscript"),
    "正文",
  );

  const orders = new Map<number, DocHeader[]>();
  for (const h of byKind.get("milestones") ?? []) {
    const o = Number(h.extra.order);
    if (!Number.isFinite(o)) continue;
    orders.set(o, [...(orders.get(o) ?? []), h]);
  }
  for (const [o, hs] of orders) {
    if (hs.length > 1) push("error", null, `里程碑 order=${o} 重复：${hs.map((h) => h.id).join("、")}`, "milestones");
  }

  return issues;
}

function checkSequence(nums: number[], report: (msg: string) => void, label: string) {
  const valid = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (valid.length === 0) return;
  const gaps: string[] = [];
  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1]!;
    const cur = valid[i]!;
    // 单缺口只写一个数字（缺第 2 章报「2」不报「2-2」）
    if (cur - prev > 1) gaps.push(prev + 2 === cur ? String(prev + 1) : `${prev + 1}-${cur - 1}`);
  }
  if (gaps.length > 0) report(`${label}断档：${gaps.join("、")}`);
}
