import type { DocKindId, SearchHit } from "../protocol.js";
import { parseFrontmatter, splitSections } from "./frontmatter.js";
import { DOC_KIND_IDS } from "./kinds.js";
import type { ProjectStore } from "./store.js";

/**
 * 全文检索：BM25（按字段加权的简化 BM25F）。
 * 中文按单字 + 双字切，英文 / 数字按词切；标题、关键词、摘要比正文权重高。
 * 索引在内存里，整个项目几百个文件重建一次几十毫秒，所以文档一变就整体重建。
 */

const K1 = 1.2;
const B = 0.75;
const FIELD_WEIGHT = { title: 4, keywords: 3, summary: 2, body: 1 } as const;

interface IndexedDoc {
  kind: DocKindId;
  id: string;
  title: string;
  summary: string;
  body: string;
  /** 段名 → 段落正文，给 snippet 定位用 */
  sections: Array<{ heading: string; content: string }>;
  tf: Map<string, number>;
  length: number;
}

const CJK = /[㐀-鿿豈-﫿]/;
const WORD = /[\p{L}\p{N}_]+/gu;

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.toLowerCase().matchAll(WORD)) {
    const w = m[0];
    if (!CJK.test(w)) {
      out.push(w);
      continue;
    }
    // 中英混排的词拆开：连续 CJK 段出单字 + 双字，非 CJK 段整词
    let run = "";
    const flush = () => {
      if (!run) return;
      for (let i = 0; i < run.length; i++) {
        out.push(run[i]!);
        if (i + 1 < run.length) out.push(run.slice(i, i + 2));
      }
      run = "";
    };
    let ascii = "";
    for (const ch of w) {
      if (CJK.test(ch)) {
        if (ascii) {
          out.push(ascii);
          ascii = "";
        }
        run += ch;
      } else {
        flush();
        ascii += ch;
      }
    }
    flush();
    if (ascii) out.push(ascii);
  }
  return out;
}

export class SearchIndex {
  private docs: IndexedDoc[] = [];
  private df = new Map<string, number>();
  private avgLength = 1;

  static async build(store: ProjectStore): Promise<SearchIndex> {
    const idx = new SearchIndex();
    for (const kind of DOC_KIND_IDS) {
      for (const h of await store.list(kind)) {
        const doc = await store.read(kind, h.id);
        if (!doc) continue;
        const { body } = parseFrontmatter(doc.raw);
        idx.add({
          kind,
          id: h.id,
          title: h.title,
          summary: h.summary,
          keywords: h.keywords,
          body,
        });
      }
    }
    idx.finish();
    return idx;
  }

  private add(d: { kind: DocKindId; id: string; title: string; summary: string; keywords: string[]; body: string }) {
    const tf = new Map<string, number>();
    let length = 0;
    const feed = (text: string, weight: number) => {
      for (const t of tokenize(text)) {
        tf.set(t, (tf.get(t) ?? 0) + weight);
        length += weight;
      }
    };
    feed(d.title, FIELD_WEIGHT.title);
    feed(d.keywords.join(" "), FIELD_WEIGHT.keywords);
    feed(d.summary, FIELD_WEIGHT.summary);
    feed(d.body, FIELD_WEIGHT.body);
    for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.docs.push({
      kind: d.kind,
      id: d.id,
      title: d.title,
      summary: d.summary,
      body: d.body,
      sections: splitSections(d.body),
      tf,
      length,
    });
  }

  private finish() {
    const total = this.docs.reduce((s, d) => s + d.length, 0);
    this.avgLength = this.docs.length ? total / this.docs.length : 1;
  }

  get size(): number {
    return this.docs.length;
  }

  query(raw: string, limit = 40): SearchHit[] {
    const q = raw.trim();
    if (!q) return [];
    const all = [...new Set(tokenize(q))];
    // 查询词能切出双字 / 整词时就不用单字了，否则「量子计算」会因为一个「子」字满屏乱命中
    const strong = all.filter((t) => t.length > 1 || !CJK.test(t));
    const terms = strong.length > 0 ? strong : all;
    if (terms.length === 0) return [];
    const N = this.docs.length;
    const idf = (t: string) => {
      const n = this.df.get(t) ?? 0;
      return Math.log(1 + (N - n + 0.5) / (n + 0.5));
    };
    const lowered = q.toLowerCase();
    const hits: SearchHit[] = [];
    for (const d of this.docs) {
      let score = 0;
      for (const t of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        score += idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / this.avgLength)));
      }
      if (score <= 0) continue;
      // 原样命中标题 / id 再加一截，让「主角」这种词优先出人物卡本人
      if (d.title.toLowerCase().includes(lowered) || d.id.toLowerCase().includes(lowered)) score *= 1.6;
      const snip = snippet(d, q);
      hits.push({ kind: d.kind, id: d.id, title: d.title, summary: d.summary, score, section: snip.section, snippet: snip.text });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }
}

/** 找正文里第一处命中原始查询词（整词优先，退到最长的字）的位置，截前后各 40 字 */
function snippet(d: IndexedDoc, q: string): { section: string; text: string } {
  const needles = [q.toLowerCase(), ...q.toLowerCase().split(/\s+/).filter(Boolean)].filter((n) => n.length > 0);
  for (const s of d.sections) {
    const lower = s.content.toLowerCase();
    for (const n of needles) {
      const at = lower.indexOf(n);
      if (at < 0) continue;
      const start = Math.max(0, at - 40);
      const end = Math.min(s.content.length, at + n.length + 40);
      const text = `${start > 0 ? "…" : ""}${s.content.slice(start, end).replace(/\s+/g, " ")}${end < s.content.length ? "…" : ""}`;
      return { section: s.heading, text };
    }
  }
  return { section: "", text: d.summary };
}
