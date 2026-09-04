import type { CheckIssue, DocHeader, DocKindId } from "../protocol.js";
import { asStringArray } from "./frontmatter.js";
import { DOC_KINDS, PLACEHOLDER, requiredFieldsOf } from "./kinds.js";
import type { ProjectStore } from "./store.js";

export { PLACEHOLDER };

/**
 * 机械对账。只报不拦：
 * - frontmatter 缺必填字段 / 仍是「待填」
 * - 正文残留「待填」
 * - 章纲引用的人物 / 线索 / 卷不存在
 * - 正文没有对应章纲
 * - 章号 / 里程碑 order 断档或重复
 */
export async function runCheck(store: ProjectStore): Promise<CheckIssue[]> {
  const issues: CheckIssue[] = [];
  const byKind = new Map<DocKindId, DocHeader[]>();
  for (const k of Object.keys(DOC_KINDS) as DocKindId[]) byKind.set(k, await store.list(k));

  const ids = (k: DocKindId) => new Set((byKind.get(k) ?? []).map((h) => h.id));
  const push = (level: CheckIssue["level"], h: DocHeader | null, message: string, kind: DocKindId | null = h?.kind ?? null) =>
    issues.push({ level, kind, id: h?.id ?? null, path: h?.path ?? null, message });

  for (const [kind, headers] of byKind) {
    for (const h of headers) {
      const required = requiredFieldsOf(kind, { title: h.title, summary: h.summary, status: h.status, ...h.extra });
      if (h.title === PLACEHOLDER || h.title.trim() === "") push("error", h, "title 未填");
      if (h.summary === PLACEHOLDER) push("warning", h, "summary 未填");
      for (const f of required) {
        const v = h.extra[f];
        if (v === undefined || v === null || v === "" || v === PLACEHOLDER) push("error", h, `缺必填字段 ${f}`);
      }
      const doc = await store.read(kind, h.id);
      if (doc && doc.body.includes(PLACEHOLDER)) {
        const count = doc.body.split(PLACEHOLDER).length - 1;
        push(kind === "manuscript" ? "error" : "warning", h, `正文残留 ${count} 处「${PLACEHOLDER}」`);
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
