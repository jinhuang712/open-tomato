import { Type } from "typebox";
import { ISSUE_LEVEL_LABEL, REJECT_WORDS } from "../../protocol.js";
import type { AgentMode, CheckIssue, DispatchDetails, DocKindId, RoleId, SearchHit } from "../../protocol.js";
import { frontmatterDiffKeys, parseFrontmatter } from "../../project/frontmatter.js";
import { bookkeepingFields, DOC_KIND_IDS, DOC_KINDS, resolveKind } from "../../project/kinds.js";
import { contentHash } from "../../project/records.js";
import type { ProjectStore } from "../../project/store.js";
import type { Gate } from "../gate.js";

export type SpawnMode = AgentMode;

/** 没有一句话故事就不能派的角色：排大纲、写正文都建在故事之上 */
export const STORY_GATED_ROLES: ReadonlySet<RoleId> = new Set<RoleId>(["plotter", "writer"]);

/** propose 时从会话里剥掉的工具 */
export const WRITE_TOOL_NAMES = ["write_doc", "edit_doc"] as const;

export interface SpawnTask {
  role: RoleId;
  task: string;
  /** propose：只出候选，落盘工具被挡住；commit：可以落盘。默认 commit */
  mode?: SpawnMode;
}

/** 派单过程中每次有人开始/完成/失败都回调一次：text 是给模型看的进度，details 是给渲染层的名册 */
export type DispatchProgress = (text: string, details: DispatchDetails) => void;
export interface DispatchResult {
  text: string;
  details: DispatchDetails;
}

export interface ToolContext {
  store: ProjectStore;
  gate: Gate;
  agentId: string;
  runCheck: () => Promise<CheckIssue[]>;
  /** 落盘后调用：刷索引、广播 docs.changed，并返回最新的机检结果 */
  docsChanged: () => Promise<CheckIssue[]>;
  search: (query: string, limit?: number) => Promise<SearchHit[]>;
  /** 只有能派单的角色才有。不阻塞：立刻返回名册，报告跑完后送进派单人的收件箱 */
  spawn?: (tasks: SpawnTask[], onProgress: DispatchProgress) => Promise<DispatchResult>;
  /** 续接一个还活着的子 agent，把新消息发给它；同样不阻塞。mode 给了就切换它的落盘权限 */
  continueAgent?: (agentId: string, message: string, mode: SpawnMode | undefined, onProgress: DispatchProgress) => Promise<DispatchResult>;
  /** 封存一个跑完的子 agent：会话留着，之后不能再 continue。删由作者在界面上做 */
  archiveAgent?: (agentId: string) => Promise<void>;
  /** 返回非空字符串表示当前这轮不允许落盘（候选阶段），字符串是给模型看的原因 */
  writeBlocked?: () => string | null;
  /** 已送到面前、尚未明确标记解释完成的报告编号 */
  unrelayedReports?: () => string[];
  /** 只移除本次已解释的报告，不能由普通发言清空 */
  acknowledgeReports?: (ids: string[]) => void;
}

export interface ToolPermissions {
  /** 能落盘哪些类型；空数组没有 write_doc / edit_doc */
  writableKinds: readonly DocKindId[];
  /** edit_doc 对其他类型只放开记账字段（status / open / keywords），正文与结构字段照旧拒 */
  bookkeepAnyKind?: boolean;
  canSpawn: boolean;
  canAsk: boolean;
  /** 评审角色以哪个身份落审稿记录；不给就没有 save_review */
  reviewAs?: RoleId;
}

/** 给人看的类型名：目录名；单例没有目录就用标签 */
export const zhDir = (kind: DocKindId) => DOC_KINDS[kind].dir || DOC_KINDS[kind].label;

export const KIND_SCHEMA = Type.String({
  description: `文档类型，写英文 kind 或中文名都行：${DOC_KIND_IDS.map((k) => `${k}=${zhDir(k)}`).join("、")}`,
});

/** 写工具用：参数说明只列这个角色能写的类型；放开记账的再补一句其他类型能改什么 */
export const writableKindSchema = (kinds: readonly DocKindId[], bookkeepAnyKind = false) =>
  Type.String({
    description:
      `文档类型，写英文 kind 或中文名都行。你能写的只有：${kinds.map((k) => `${k}=${zhDir(k)}`).join("、")}` +
      (bookkeepAnyKind ? "。其他类型只能改 frontmatter 里的记账字段（status / open / keywords），比如把作废的卡标 status: retired；正文一个字都不能动" : ""),
  });

export const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

export const explainedReportsSchema = Type.Optional(Type.Array(Type.String(), {
  description: "本次对作者已讲清的报告编号，逐字取自报告编号字段。只标记已解释其关键方案、依据与取舍的整份报告；进度发言不填。不能用它代替解释，不向作者展示编号。",
}));

/** 仅验证交接声明，不以字数或非空文本冒充语义质量检查。先全部校验，避免部分清除。 */
export function validateExplainedReports(ctx: ToolContext, speech: string | undefined, ids: string[] = []): void {
  if (!ids.length) return;
  if (!speech?.trim()) throw new Error("标记报告已解释时，必须同时向作者提供解释正文。");
  const pending = ctx.unrelayedReports?.() ?? [];
  if (ids.some((id) => !pending.includes(id))) throw new Error(`报告编号不存在或已解释，请使用待解释编号：${pending.join("、")}`);
}

export const fmtIssue = (i: CheckIssue) => `- ${i.path ?? (i.kind ? zhDir(i.kind) : "全书")}：${i.message}`;

/** 给作者 / 模型看的路径一律中文目录；单例只有名字 */
export const zhPath = (kind: DocKindId, id: string) => (DOC_KINDS[kind].singleton ? zhDir(kind) : `${DOC_KINDS[kind].dir}/${id}`);

export function assertKind(kind: unknown): DocKindId {
  const k = resolveKind(kind);
  if (!k) throw new Error(`未知的 kind：${String(kind)}，可选 ${DOC_KIND_IDS.map((x) => `${x}（${zhDir(x)}）`).join(" / ")}`);
  return k;
}

/** 这类材料不归这个角色写：不落盘，让它把要改的内容写进报告交主编派对应角色 */
export function assertWritableKind(kind: DocKindId, allowed: readonly DocKindId[]): void {
  if (allowed.includes(kind)) return;
  throw new Error(
    `${zhDir(kind)} 不归你写，你能写的只有 ${allowed.map(zhDir).join(" / ")}。要改的内容写进你的报告，由主编派负责这类材料的角色去改。`,
  );
}

/** 正文相同，且 frontmatter 变化全落在这类材料的记账字段上 */
function bookkeepingOnly(kind: DocKindId, before: string, after: string): boolean {
  const b = parseFrontmatter(before);
  const a = parseFrontmatter(after);
  if (b.body !== a.body) return false;
  const allowed = bookkeepingFields(kind);
  return frontmatterDiffKeys(b.frontmatter, a.frontmatter).every((k) => allowed.has(k));
}

/**
 * 预览 → 审批门 → 落盘，write_doc 和 edit_doc 共用。
 * bookkeepAnyKind：不归这个角色写的类型，只要正文没动、frontmatter 只改了记账字段，也放行（统筹者把孤卡标 retired 这类活）。
 */
export function makeApproveAndWrite(ctx: ToolContext, writableKinds: readonly DocKindId[], bookkeepAnyKind = false) {
  const { store } = ctx;
  return async (toolCallId: string, kind: DocKindId, id: string, after: string, signal?: AbortSignal) => {
    // 工具参数已经只列了能写的类型；这里落盘前再查一次，模型凭记忆填了别的类型也进不来
    const ownKind = writableKinds.includes(kind);
    if (!ownKind && !bookkeepAnyKind) assertWritableKind(kind, writableKinds);
    const blocked = ctx.writeBlocked?.();
    if (blocked) throw new Error(blocked);
    const preview = await store.previewWrite(kind, id, after);
    if (preview.before === preview.after) return text(`${preview.path} 内容没有变化，跳过。`);
    // 正文一字未改、frontmatter 只动了记账字段（open 清单、状态、关键词、字数计数）：不是内容也不是结构，不过审批门，直接落盘。
    // 正文没变不等于故事没变：人物层级、所属卷、关联线索这类字段变了照样审批，按字段含义分，不按它在 frontmatter 里分。
    const bookkeeping = !preview.isNew && bookkeepingOnly(kind, preview.before, preview.after);
    if (!ownKind && !bookkeeping) {
      throw new Error(
        `${zhDir(kind)} 的内容不归你写，你对它只能改记账字段（status / open / keywords）。要改的内容写进你的报告，由主编派负责这类材料的角色去改。`,
      );
    }
    if (bookkeeping) {
      const changed = frontmatterDiffKeys(parseFrontmatter(preview.before).frontmatter, parseFrontmatter(preview.after).frontmatter);
      const header = await store.write(kind, preview.id, preview.after, { expectBefore: preview.before });
      const issues = (await ctx.docsChanged()).filter((i) => i.kind === kind && i.id === header.id);
      const tail = issues.length === 0 ? "" : `\n机检对这篇有话说：\n${issues.map((i) => `- ${ISSUE_LEVEL_LABEL[i.level]}：${i.message}`).join("\n")}`;
      return text(`已更新 ${header.path}（${header.title}）的记账字段 ${changed.join("、")}，正文没动，无需作者审批${tail}`);
    }
    const outcome = await ctx.gate.requestApproval(
      {
        agentId: ctx.agentId,
        toolCallId,
        kind,
        docId: preview.id,
        path: preview.path,
        title: preview.title,
        isNew: preview.isNew,
        before: preview.before,
        after: preview.after,
        patch: preview.patch,
      },
      signal,
    );
    // 作者的每次放行和退回都是一条批：退回理由若是词汇表里的词就记进 word，其余进 text
    const reason = outcome.reason.trim();
    await store.records.appendMark({
      kind,
      id: preview.id,
      type: outcome.decision,
      by: "author",
      ...(REJECT_WORDS.has(reason) ? { word: reason } : reason ? { text: reason } : {}),
      version: contentHash(preview.after),
      agentId: ctx.agentId,
    });
    if (outcome.decision === "reject") {
      const state = preview.isNew ? "文件没有创建" : "文件保持原样、被拒的稿子没有落盘";
      const redo = preview.isNew
        ? "用 write_doc 重新提交全文"
        : "整篇重写就 write_doc 给全文，局部改就先 read_doc 拿磁盘上的原文再 edit_doc，不要对被拒的稿子做 edit_doc";
      return text(
        `用户拒绝写入 ${preview.path}${outcome.reason ? `，原因：${outcome.reason}` : ""}。${state}。\n` +
          `理由是作者对你说的话，先判断它是什么：能照着改的，改好后${redo}，不要原样重试；` +
          `理由是一个问题，先回答它，不要再提一版；理由和任务书或已有材料对不上、或你拿不准该怎么改，把矛盾写清楚停下，你这一停话就交回主编，由主编和作者定，不要自己编一个说法把两头缝上。`,
      );
    }
    const header = await store.write(kind, preview.id, preview.after, { expectBefore: preview.before });
    const issues = (await ctx.docsChanged()).filter((i) => i.kind === kind && i.id === header.id);
    const tail = issues.length === 0 ? "" : `\n机检对这篇有话说：\n${issues.map((i) => `- ${ISSUE_LEVEL_LABEL[i.level]}：${i.message}`).join("\n")}`;
    return text(`已写入 ${header.path}（${header.title}）${tail}`);
  };
}
