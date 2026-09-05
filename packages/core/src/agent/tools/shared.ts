import { Type } from "typebox";
import { ISSUE_LEVEL_LABEL, REJECT_WORDS } from "../../protocol.js";
import type { CheckIssue, DispatchDetails, DocKindId, RoleId, SearchHit } from "../../protocol.js";
import { DOC_KIND_IDS, DOC_KINDS, resolveKind } from "../../project/kinds.js";
import { contentHash } from "../../project/records.js";
import type { ProjectStore } from "../../project/store.js";
import type { Gate } from "../gate.js";

export type SpawnMode = "propose" | "commit";

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
  /** 只有能派单的角色才有 */
  spawn?: (tasks: SpawnTask[], onProgress: DispatchProgress, signal?: AbortSignal) => Promise<DispatchResult>;
  /** 续接一个还活着的子 agent，把新消息发给它并等它这一轮的结论；mode 给了就切换它的落盘权限 */
  continueAgent?: (agentId: string, message: string, mode: SpawnMode | undefined, onProgress: DispatchProgress, signal?: AbortSignal) => Promise<DispatchResult>;
  /** 返回非空字符串表示当前这轮不允许落盘（候选阶段），字符串是给模型看的原因 */
  writeBlocked?: () => string | null;
  /** 返回非空字符串表示现在还不能 ask_user（子 agent 结论刚回来、还没对作者解释），字符串是给模型看的原因 */
  askBlocked?: () => string | null;
}

export interface ToolPermissions {
  canWrite: boolean;
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

export const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

export const fmtIssue = (i: CheckIssue) => `- ${i.path ?? (i.kind ? zhDir(i.kind) : "全书")}：${i.message}`;

/** 给作者 / 模型看的路径一律中文目录；单例只有名字 */
export const zhPath = (kind: DocKindId, id: string) => (DOC_KINDS[kind].singleton ? zhDir(kind) : `${DOC_KINDS[kind].dir}/${id}`);

export function assertKind(kind: unknown): DocKindId {
  const k = resolveKind(kind);
  if (!k) throw new Error(`未知的 kind：${String(kind)}，可选 ${DOC_KIND_IDS.map((x) => `${x}（${zhDir(x)}）`).join(" / ")}`);
  return k;
}

/** 预览 → 审批门 → 落盘，write_doc 和 edit_doc 共用 */
export function makeApproveAndWrite(ctx: ToolContext) {
  const { store } = ctx;
  return async (toolCallId: string, kind: DocKindId, id: string, after: string, signal?: AbortSignal) => {
    const blocked = ctx.writeBlocked?.();
    if (blocked) throw new Error(blocked);
    const preview = await store.previewWrite(kind, id, after);
    if (preview.before === preview.after) return text(`${preview.path} 内容没有变化，跳过。`);
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
      const how = preview.isNew
        ? "文件没有创建。按原因改好后用 write_doc 重新提交全文"
        : "文件保持原样、被拒的稿子没有落盘。按原因改好后重新提交：整篇重写就 write_doc 给全文，局部改就先 read_doc 拿磁盘上的原文再 edit_doc，不要对被拒的稿子做 edit_doc";
      return text(`用户拒绝写入 ${preview.path}${outcome.reason ? `，原因：${outcome.reason}` : ""}。${how}，不要原样重试。`);
    }
    const header = await store.write(kind, preview.id, preview.after, { expectBefore: preview.before });
    const issues = (await ctx.docsChanged()).filter((i) => i.kind === kind && i.id === header.id);
    const tail = issues.length === 0 ? "" : `\n机检对这篇有话说：\n${issues.map((i) => `- ${ISSUE_LEVEL_LABEL[i.level]}：${i.message}`).join("\n")}`;
    return text(`已写入 ${header.path}（${header.title}）${tail}`);
  };
}
