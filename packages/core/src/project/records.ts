import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { DocKindId, RoleId } from "../protocol.js";

/**
 * 系统侧记录：模型读写、作者不直接读的东西。不是材料，不注册进 DOC_KINDS，
 * 天然不进侧栏、不进搜索、不进种子导出。全部落在 .opentomato/ 下，随云快照一起走。
 *
 * - 批（marks）：作者对某份材料说的话。一份材料一个 jsonl，只追加。
 * - 审稿记录（reviews）：一章一个目录，一路评审一个文件，各写各的，读时合并。
 *   四路评审并行跑，共用一个文件会互相覆盖，分文件是唯一不用锁的写法。
 */

const MARKS_DIR = "marks";
const REVIEWS_DIR = "reviews";

/** 内容 hash：批和审稿记录用它说明「针对的是哪一版」。文档本身没有版本号 */
export function contentHash(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 12);
}

export type MarkType =
  /** 作者放行了一次落盘 */
  | "approve"
  /** 作者退回了一稿，word 是词汇表里的词，text 是补充 */
  | "reject"
  /** 作者对已落盘正文某段的批注 */
  | "note"
  /** 作者亲手改了文档，patch 记改动 */
  | "edit"
  /** 作者说这笔账不欠：搁置、有意留白。唯一允许主编代记的种类，且只能在作者明确说了之后 */
  | "defer"
  /** 作者推翻了自己早先的决定，旧批保留为坐标 */
  | "overrule"
  /** 作者接受了某条评审意见 */
  | "accept"
  /** 作者驳回了某条评审意见 */
  | "dismiss";

export interface MarkAnchor {
  /** 段名（## 段） */
  section?: string;
  /** 段落开头引文，够人认出是哪段 */
  quote?: string;
  /** 段落内容 hash，段落被改过就对不上，读的人知道锚点已经漂了 */
  hash?: string;
}

export interface Mark {
  at: string;
  kind: DocKindId;
  id: string;
  type: MarkType;
  by: "author" | "director";
  word?: string;
  text?: string;
  anchor?: MarkAnchor;
  /** 这条批针对的文档内容 hash：approve / reject 指 after，edit 指改后 */
  version?: string;
  /** edit 专用：改前 hash */
  before?: string;
  /** edit 专用：unified diff */
  patch?: string;
  /** 触发这条批的子 agent */
  agentId?: string;
}

export type MarkInput = Omit<Mark, "at">;

export interface ReviewItem {
  /** 必须改 / 建议看 */
  level: "must" | "suggest";
  /** 位置：引原文前十来个字 */
  where: string;
  issue: string;
  fix?: string;
}

export interface ReviewRound {
  at: string;
  role: RoleId;
  /** 审的是哪一版正文 */
  version: string;
  /** 一句话结论 */
  verdict: string;
  items: ReviewItem[];
}

export type ReviewRoundInput = Omit<ReviewRound, "at">;

/** 文件名里不能有路径分隔符；材料 id 是中文名或数字，只需挡掉斜杠 */
const safeName = (s: string) => s.replace(/[\\/]/g, "_");

export class ProjectRecords {
  constructor(private readonly markerDir: string) {}

  // ───────────── 批 ─────────────

  marksPath(kind: DocKindId, id: string): string {
    return path.join(this.markerDir, MARKS_DIR, kind, `${safeName(id)}.jsonl`);
  }

  async appendMark(input: MarkInput): Promise<Mark> {
    const mark: Mark = { at: new Date().toISOString(), ...input };
    const abs = this.marksPath(mark.kind, mark.id);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.appendFile(abs, `${JSON.stringify(mark)}\n`, "utf8");
    return mark;
  }

  async marks(kind: DocKindId, id: string): Promise<Mark[]> {
    const raw = await fs.readFile(this.marksPath(kind, id), "utf8").catch(() => "");
    return raw
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as Mark);
  }

  /** 某一类材料下所有有批的 id */
  async markedIds(kind: DocKindId): Promise<string[]> {
    const dir = path.join(this.markerDir, MARKS_DIR, kind);
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    return names.filter((n) => n.endsWith(".jsonl")).map((n) => n.slice(0, -".jsonl".length));
  }

  /**
   * 作者说过「不欠」的材料：最后一条 defer / overrule 里是 defer 的。
   * 返回 "kind/id" 集合，机检用它闭嘴，主编用它不催。
   */
  async deferredDocs(): Promise<Set<string>> {
    const out = new Set<string>();
    const root = path.join(this.markerDir, MARKS_DIR);
    const kinds = await fs.readdir(root).catch(() => [] as string[]);
    for (const kind of kinds) {
      for (const id of await this.markedIds(kind as DocKindId)) {
        const marks = await this.marks(kind as DocKindId, id);
        const last = [...marks].reverse().find((m) => m.type === "defer" || m.type === "overrule");
        if (last?.type === "defer") out.add(`${kind}/${id}`);
      }
    }
    return out;
  }

  // ───────────── 审稿记录 ─────────────

  reviewPath(chapter: string, role: RoleId): string {
    return path.join(this.markerDir, REVIEWS_DIR, safeName(chapter), `${role}.json`);
  }

  /** 同一路评审对同一章可以审多轮，追加；不同路各自一个文件，互不相扰 */
  async saveReview(chapter: string, input: ReviewRoundInput): Promise<ReviewRound> {
    const round: ReviewRound = { at: new Date().toISOString(), ...input };
    const abs = this.reviewPath(chapter, round.role);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const existing = await this.readRounds(abs);
    await fs.writeFile(abs, `${JSON.stringify({ rounds: [...existing, round] }, null, 2)}\n`, "utf8");
    return round;
  }

  /** 这一章所有评审、所有轮次，按时间排 */
  async reviews(chapter: string): Promise<ReviewRound[]> {
    const dir = path.join(this.markerDir, REVIEWS_DIR, safeName(chapter));
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    const all: ReviewRound[] = [];
    // readdir 顺序不保证；同一毫秒写的两路时间相同，先按文件名定序再稳定排时间
    for (const n of names.sort()) {
      if (!n.endsWith(".json")) continue;
      all.push(...(await this.readRounds(path.join(dir, n))));
    }
    return all.sort((a, b) => a.at.localeCompare(b.at));
  }

  /** 每一路最近一轮，写手返修时看这个就够 */
  async latestReviews(chapter: string): Promise<ReviewRound[]> {
    const latest = new Map<RoleId, ReviewRound>();
    for (const r of await this.reviews(chapter)) latest.set(r.role, r);
    return [...latest.values()];
  }

  private async readRounds(abs: string): Promise<ReviewRound[]> {
    const raw = await fs.readFile(abs, "utf8").catch(() => null);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as { rounds?: ReviewRound[] };
    return parsed.rounds ?? [];
  }
}
