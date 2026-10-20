import { text as textValue } from "../../text/load.js";
import { createTwoFilesPatch } from "diff";
import { Type } from "typebox";
import { ISSUE_LEVEL_LABEL, REJECT_WORDS } from "../../protocol.js";
import type { AgentInfo, AgentMode, CheckIssue, DispatchDetails, DocKindId, RoleId, SearchHit } from "../../protocol.js";
import { frontmatterDiffKeys, parseFrontmatter } from "../../project/frontmatter.js";
import { hasOneLineStory, ONE_LINE_STORY_GATE_MESSAGE } from "../../project/gates.js";
import { bookkeepingFields, DOC_KIND_IDS, DOC_KINDS, resolveKind } from "../../project/kinds.js";
import { contentHash } from "../../project/records.js";
import type { ProjectStore } from "../../project/store.js";
import type { Gate } from "../gate.js";

export type SpawnMode = AgentMode;

/** 没有一句话故事就不能派的角色：排大纲、写正文都建在故事之上 */
export const STORY_GATED_ROLES: ReadonlySet<RoleId> = new Set<RoleId>(["plotter", "writer"]);

/** 只读评审角色：对照已落盘的正文下判断，没有正文就没有可审的东西 */
export const REVIEW_ROLES: ReadonlySet<RoleId> = new Set<RoleId>(["ops", "reader", "copyeditor", "proofreader", "arbiter"]);

/**
 * 派单前的硬门，返回拒绝理由，能派返回 null。没有一句话故事不排纲写章；
 * 另有两道无谓派单的粗闸：写手没章纲可依、评审没正文可审，派出去也是空转一轮。
 */
export async function dispatchProblem(store: ProjectStore, roles: Iterable<RoleId>): Promise<string | null> {
  const wanted = [...roles];
  if (wanted.some((r) => STORY_GATED_ROLES.has(r)) && !(await hasOneLineStory(store))) return ONE_LINE_STORY_GATE_MESSAGE;
  if (wanted.includes("writer") && (await store.list("chapters")).length === 0) {
    return textValue("messages/materials", "shared.message");
  }
  if (wanted.some((r) => REVIEW_ROLES.has(r)) && (await store.list("manuscript")).length === 0) {
    return textValue("messages/materials", "shared.message_2");
  }
  return null;
}

/** propose 时从会话里剥掉的工具 */
export const WRITE_TOOL_NAMES = ["write_doc", "edit_doc"] as const;

export interface SpawnTask {
  role: RoleId;
  task: string;
  /** propose：只出候选，落盘工具被挡住；commit：可以落盘。默认 commit */
  mode?: SpawnMode;
  /**
   * 一次性任务（不需要保留上下文的简短评审等任务）：会话只在内存，不落盘、不进索引，报告交回后不保留会话，不能 continue_agent。
   * 需要迭代、同线续派的别用。默认 false。
   */
  ephemeral?: boolean;
  /**
   * 带上主编与作者的讨论全文转交（落实刚讨论好的内容时用）：任务书只写这次新增的要求，与讨论记录冲突时，以任务书为准。
   * 问策、评审通常不用。默认 false。
   */
  fork?: boolean;
}

/** 派单过程中每次有人开始/完成/失败都回调一次：text 是给模型看的进度，details 是给渲染层的名册 */
export type DispatchProgress = (text: string, details: DispatchDetails) => void;
export interface DispatchResult {
  text: string;
  details: DispatchDetails;
}

export interface ToolContext {
  /** 当前会话分支的原始记录，包含被压缩的消息。 */
  history?: () => import("@earendil-works/pi-coding-agent").SessionEntry[];
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
  /** 续派：agent 是子 agent 的名字（策划1），内核认名字，也兼容旧会话里的 uuid */
  continueAgent?: (agent: string, message: string, mode: SpawnMode | undefined, onProgress: DispatchProgress) => Promise<DispatchResult>;
  /** 封存一个跑完的子 agent：会话留着，之后不能再 continue。删由作者在界面上做 */
  archiveAgent?: (agent: string) => Promise<void>;
  /** 自己派出去的人现在什么状态。只有能派单的角色才有 */
  listAgents?: () => AgentInfo[];
  /** 返回非空字符串表示当前这轮不允许落盘（候选阶段），字符串是给模型看的原因 */
  writeBlocked?: () => string | null;
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
  description: textValue("tools/materials", "shared.description", { v0: DOC_KIND_IDS.map((k) => `${k}=${zhDir(k)}`).join("、") }),
});

/** 写工具用：参数说明只列这个角色能写的类型；放开记账的再补一句其他类型能改什么 */
export const writableKindSchema = (kinds: readonly DocKindId[], bookkeepAnyKind = false) =>
  Type.String({
    description:
      textValue("app/tools/materials", "shared.writable_kind_description", { v0: kinds.map((k) => `${k}=${zhDir(k)}`).join("、") }) +
      (bookkeepAnyKind ? textValue("app/tools/materials", "shared.bookkeeping_description") : ""),
  });

export const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

export const fmtIssue = (i: CheckIssue) => `- ${i.path ?? (i.kind ? zhDir(i.kind) : "全书")}：${i.message}`;

/** 给作者 / 模型看的路径一律中文目录；单例只有名字 */
export const zhPath = (kind: DocKindId, id: string) => (DOC_KINDS[kind].singleton ? zhDir(kind) : `${DOC_KINDS[kind].dir}/${id}`);

export function assertKind(kind: unknown): DocKindId {
  const k = resolveKind(kind);
  if (!k) throw new Error(textValue("messages/materials", "shared.message_3", { v0: String(kind), v1: DOC_KIND_IDS.map((x) => `${x}（${zhDir(x)}）`).join(" / ") }));
  return k;
}

/** 这类材料不归这个角色写：不落盘，让它把要改的内容写进报告交主编派对应角色 */
export function assertWritableKind(kind: DocKindId, allowed: readonly DocKindId[]): void {
  if (allowed.includes(kind)) return;
  throw new Error(
    textValue("messages/materials", "shared.message_4", { v0: zhDir(kind), v1: allowed.map(zhDir).join(" / ") }),
  );
}

/** 正文相同，改动全在 frontmatter 里 */
export function frontmatterOnly(before: string, after: string): boolean {
  return parseFrontmatter(before).body === parseFrontmatter(after).body;
}

/** 正文相同，且 frontmatter 变化全落在这类材料的记账字段上 */
export function bookkeepingOnly(kind: DocKindId, before: string, after: string): boolean {
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
    if (preview.before === preview.after) return text(textValue("app/messages/materials", "shared.message_5", { v0: preview.path }));
    // 正文一字未改、改动全在 frontmatter 里：不过审批门，直接落盘，改了哪些字段写在回话里让作者看见。
    // 越界写别人的材料是另一码事，那里仍只放行记账字段，跟审批门宽严无关。
    const frontmatterEdit = !preview.isNew && frontmatterOnly(preview.before, preview.after);
    if (!ownKind && !(frontmatterEdit && bookkeepingOnly(kind, preview.before, preview.after))) {
      throw new Error(
        textValue("app/messages/materials", "shared.message_6", { v0: zhDir(kind) }),
      );
    }
    if (frontmatterEdit) {
      const changed = frontmatterDiffKeys(parseFrontmatter(preview.before).frontmatter, parseFrontmatter(preview.after).frontmatter);
      const header = await store.write(kind, preview.id, preview.after, { expectBefore: preview.before });
      const issues = (await ctx.docsChanged()).filter((i) => i.kind === kind && i.id === header.id);
      const tail = issues.length === 0 ? "" : textValue("app/messages/materials", "shared.message_7", { v0: issues.map((i) => `- ${ISSUE_LEVEL_LABEL[i.level]}：${i.message}`).join("\n") });
      return text(textValue("app/messages/materials", "shared.message_8", { v0: header.path, v1: header.title, v2: changed.join("、"), v3: tail }));
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
    const reason = outcome.reason.trim();
    // 作者批准前在审阅里按 ⌘E 自己改过：落盘以作者那版为准，agent 提的那版只是底稿。
    // 单独记一条 edit 批，写手下次开写前 read_marks 能看见作者动了哪儿——放行本身说不出这个。
    const edited = outcome.decision === "approve" ? normalizeEdit(outcome.content, preview.after) : null;
    const final = edited ?? preview.after;
    if (edited) {
      await store.records.appendMark({
        kind,
        id: preview.id,
        type: "edit",
        by: "author",
        before: contentHash(preview.after),
        version: contentHash(edited),
        patch: createTwoFilesPatch(preview.path, preview.path, preview.after, edited, "", "", { context: 3 }),
        agentId: ctx.agentId,
      });
    }
    // 作者的每次放行和退回都是一条批：退回理由若是词汇表里的词就记进 word，其余进 text
    await store.records.appendMark({
      kind,
      id: preview.id,
      type: outcome.decision,
      by: "author",
      ...(REJECT_WORDS.has(reason) ? { word: reason } : reason ? { text: reason } : {}),
      version: contentHash(final),
      agentId: ctx.agentId,
    });
    if (outcome.decision === "reject") {
      const state = preview.isNew ? textValue("app/messages/materials", "shared.message_9") : textValue("app/messages/materials", "shared.message_10");
      const redo = preview.isNew
        ? textValue("app/messages/materials", "shared.message_11")
        : textValue("app/messages/materials", "shared.message_12");
      return text(
        textValue("app/messages/materials", "shared.message_13", { v0: preview.path, v1: outcome.reason ? `，原因：${outcome.reason}` : "", v2: state }) +
          textValue("app/messages/materials", "shared.message_14", { v0: redo }) +
          textValue("app/messages/materials", "shared.message_15"),
      );
    }
    const header = await store.write(kind, preview.id, final, { expectBefore: preview.before });
    const issues = (await ctx.docsChanged()).filter((i) => i.kind === kind && i.id === header.id);
    const tail = issues.length === 0 ? "" : textValue("app/messages/materials", "shared.message_7", { v0: issues.map((i) => `- ${ISSUE_LEVEL_LABEL[i.level]}：${i.message}`).join("\n") });
    // 落的不是你提的那版，必须说出来：不然 agent 会拿自己那份当磁盘上的现状，接着 edit_doc 就把作者的改动盖回去
    if (edited) {
      return text(textValue("app/messages/materials", "shared.message_16", { v0: header.path, v1: header.title, v2: tail }));
    }
    return text(textValue("app/messages/materials", "shared.message_17", { v0: header.path, v1: header.title, v2: tail }));
  };
}

/** 作者改的那份：补上末尾换行好和 previewWrite 的 after 对齐；空的、跟 agent 那版一字不差的都当没改 */
function normalizeEdit(content: string | undefined, after: string): string | null {
  if (content === undefined || content.trim() === "") return null;
  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  return normalized === after ? null : normalized;
}
