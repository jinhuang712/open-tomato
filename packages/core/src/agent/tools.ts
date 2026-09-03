import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CheckIssue, DispatchDetails, DocKindId, RoleId, SearchHit } from "../protocol.js";
import { applyEdits } from "../project/edits.js";
import { hasOneLineStory, ONE_LINE_STORY_GATE_MESSAGE } from "../project/gates.js";
import { DOC_KIND_IDS, DOC_KINDS, resolveKind } from "../project/kinds.js";
import type { ProjectStore } from "../project/store.js";
import type { Gate } from "./gate.js";
import { ROLE_IDS, ROLES, isRoleId } from "./roles.js";
import { searchWeb } from "./websearch.js";

export type SpawnMode = "propose" | "commit";

/** 没有一句话故事就不能派的角色：排大纲、写正文都建在故事之上 */
const STORY_GATED_ROLES: ReadonlySet<RoleId> = new Set<RoleId>(["planner", "writer"]);

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
  onDocsChanged: () => void;
  search: (query: string, limit?: number) => Promise<SearchHit[]>;
  /** 只有能派单的角色才有 */
  spawn?: (tasks: SpawnTask[], onProgress: DispatchProgress, signal?: AbortSignal) => Promise<DispatchResult>;
  /** 续接一个还活着的子 agent，把新消息发给它并等它这一轮的结论；mode 给了就切换它的落盘权限 */
  continueAgent?: (agentId: string, message: string, mode: SpawnMode | undefined, onProgress: DispatchProgress, signal?: AbortSignal) => Promise<DispatchResult>;
  /** 返回非空字符串表示当前这轮不允许落盘（候选阶段），字符串是给模型看的原因 */
  writeBlocked?: () => string | null;
}

export interface ToolPermissions {
  canWrite: boolean;
  canSpawn: boolean;
  canAsk: boolean;
}

const KIND_SCHEMA = Type.String({
  description: `文档类型，写英文 kind 或中文目录名都行：${DOC_KIND_IDS.map((k) => `${k}=${DOC_KINDS[k].dir}`).join("、")}`,
});

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

/** 给作者 / 模型看的路径一律中文目录 */
const zhPath = (kind: DocKindId, id: string) => `${DOC_KINDS[kind].dir}/${id}`;

function assertKind(kind: unknown): DocKindId {
  const k = resolveKind(kind);
  if (!k) throw new Error(`未知的 kind：${String(kind)}，可选 ${DOC_KIND_IDS.map((x) => `${x}（${DOC_KINDS[x].dir}）`).join(" / ")}`);
  return k;
}

/** ask_user 的实参键名，漏进 options 数组时要摘掉 */
const ASK_ARG_KEYS: ReadonlySet<string> = new Set(["question", "options", "allowFreeText"]);

/** question 丢了但候选还在时，用这句话把提问撑起来，作者照样能挑 */
const ASK_FALLBACK_QUESTION = "这些候选里，你更想要哪个方向？";

type AskOption = string | { label: string; text: string };

/**
 * 流式拼接坏掉时，模型给的 ask_user 实参会带三种伤：question 整个丢失、键名
 * "question" 被当成值塞进 options、末尾候选粘上数组闭合符号。校验器一律判失败，
 * 一次提问就变成一条红色报错。这里在校验前把能救的救回来。
 */
export function repairAskArgs(args: unknown): { question: string; options?: AskOption[]; allowFreeText?: boolean } {
  const raw = (args ?? {}) as Record<string, unknown>;
  const question = typeof raw.question === "string" && raw.question.trim() ? raw.question : "";
  const damaged = !question;

  const options: AskOption[] = [];
  for (const item of Array.isArray(raw.options) ? raw.options : []) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed || ASK_ARG_KEYS.has(trimmed)) continue;
      // 闭合符号只在实参已判损坏时才剥，正常候选不动
      const cleaned = damaged ? trimmed.replace(/\\?["'”]?\s*\]\s*$/, "").trim() : trimmed;
      if (cleaned) options.push(cleaned);
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.label === "string" && typeof o.text === "string") options.push({ label: o.label, text: o.text });
    }
  }

  return {
    question: question || ASK_FALLBACK_QUESTION,
    ...(options.length ? { options } : {}),
    ...(typeof raw.allowFreeText === "boolean" ? { allowFreeText: raw.allowFreeText } : {}),
  };
}

export function createTools(ctx: ToolContext, perms: ToolPermissions): ToolDefinition[] {
  const { store } = ctx;
  const tools: ToolDefinition[] = [];

  tools.push(
    defineTool({
      name: "project_overview",
      label: "项目盘面",
      description: "列出项目里所有文档的 kind / id / title / status / summary，一行一个。开工先看这个。",
      parameters: Type.Object({}),
      execute: async () => {
        const all = await store.listAll();
        if (all.length === 0) return text("项目是空的，还没有任何文档。");
        const lines: string[] = [`项目：${store.info.name}`];
        for (const k of DOC_KIND_IDS) {
          const docs = all.filter((d) => d.kind === k);
          if (docs.length === 0) continue;
          lines.push("", `## ${DOC_KINDS[k].dir}/（kind=${k}）${docs.length} 篇`);
          for (const d of docs) lines.push(`- ${d.id} | ${d.title} | ${d.status} | ${d.summary}`);
        }
        return text(lines.join("\n"));
      },
    }),
  );

  tools.push(
    defineTool({
      name: "list_docs",
      label: "列文档",
      description: "列出某一类文档的 id / title / status / summary 和 frontmatter 里的其他字段。",
      parameters: Type.Object({ kind: KIND_SCHEMA }),
      execute: async (_id, params) => {
        const kind = assertKind(params.kind);
        const docs = await store.list(kind);
        if (docs.length === 0) return text(`${DOC_KINDS[kind].dir}/ 下没有文档。`);
        return text(
          docs
            .map((d) => {
              const extra = Object.entries(d.extra)
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(" ");
              return `- ${d.id} | ${d.title} | ${d.status} | ${d.summary}${extra ? ` | ${extra}` : ""}`;
            })
            .join("\n"),
        );
      },
    }),
  );

  tools.push(
    defineTool({
      name: "read_doc",
      label: "读文档",
      description: "读一篇文档。传 section 只取某个「## 段名」下的内容；不传返回完整文件（含 frontmatter）。",
      parameters: Type.Object({
        kind: KIND_SCHEMA,
        id: Type.String({ description: "文档 id，章号可以直接给数字" }),
        section: Type.Optional(Type.String({ description: "段名，例如「语音签名」" })),
      }),
      execute: async (_id, params) => {
        const kind = assertKind(params.kind);
        const doc = await store.read(kind, params.id);
        if (!doc) throw new Error(`${zhPath(kind, store.normalizeId(kind, params.id))} 不存在`);
        if (params.section) {
          const s = await store.readSection(kind, params.id, params.section);
          if (s === null) throw new Error(`${doc.path} 没有「${params.section}」段，现有段：${doc.sections.join(" / ")}`);
          return text(s);
        }
        return text(doc.raw);
      },
    }),
  );

  tools.push(
    defineTool({
      name: "search_docs",
      label: "搜文档",
      description: "全文检索（BM25，中英文都行）所有文档的标题 / 关键词 / 摘要 / 正文，按相关度返回命中文档和命中片段。",
      parameters: Type.Object({ query: Type.String(), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })) }),
      execute: async (_id, params) => {
        const hits = await ctx.search(params.query, params.limit ?? 20);
        if (hits.length === 0) return text("没有命中。");
        return text(
          hits
            .map((h) => `- ${zhPath(h.kind, h.id)} | ${h.title}${h.section ? ` | §${h.section}` : ""} | ${h.snippet}`)
            .join("\n"),
        );
      },
    }),
  );

  tools.push(
    defineTool({
      name: "web_search",
      label: "搜网络",
      description:
        "联网搜索，查项目文档里没有的现实资料：历史背景、行业常识、地名物价、专业术语、同类作品套路等。返回若干条「标题 / URL / 摘要」。用途是给设定和情节找依据，搜到的东西不会自动保存：有价值的结论要连来源 URL 一起写进对应的卡片（write_doc / edit_doc），在回复里引用时也带上出处。一次查一个具体问题，中文英文都行；结果不满意换个说法再搜，不要连搜同一句。",
      parameters: Type.Object({
        query: Type.String({ description: "具体的搜索词，带年代 / 地域 / 领域限定更准，例如「1999年 上海 快递员 月薪」" }),
        numResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, description: "条数，默认 5" })),
        deep: Type.Optional(Type.Boolean({ description: "true 用深度搜索，慢但全；默认 false" })),
      }),
      execute: async (_id, params, signal) => {
        const out = await searchWeb(params.query, { ...(params.numResults ? { numResults: params.numResults } : {}), type: params.deep ? "deep" : "auto" }, signal);
        return text(out);
      },
    }),
  );

  tools.push(
    defineTool({
      name: "doc_template",
      label: "文档模板",
      description: "拿某一类文档的空白模板（完整文件文本），新建文档时以它为底改。",
      parameters: Type.Object({ kind: KIND_SCHEMA }),
      execute: async (_id, params) => text(store.template(assertKind(params.kind))),
    }),
  );

  tools.push(
    defineTool({
      name: "run_check",
      label: "一致性机检",
      description: "机械对账：缺必填字段、残留「待填」、章纲引用不存在的卡、章号断档、里程碑 order 重复。",
      parameters: Type.Object({}),
      execute: async () => {
        const issues = await ctx.runCheck();
        if (issues.length === 0) return text("机检通过，没有问题。");
        const fmt = (i: CheckIssue) => `- [${i.level}] ${i.path ?? i.kind ?? "-"}：${i.message}`;
        const errors = issues.filter((i) => i.level === "error");
        const warnings = issues.filter((i) => i.level === "warning");
        return text(
          [
            `error ${errors.length} 条，warning ${warnings.length} 条`,
            ...(errors.length ? ["", "## error", ...errors.map(fmt)] : []),
            ...(warnings.length ? ["", "## warning", ...warnings.map(fmt)] : []),
          ].join("\n"),
        );
      },
    }),
  );

  if (perms.canWrite) {
    /** 预览 → 审批门 → 落盘，write_doc 和 edit_doc 共用 */
    const approveAndWrite = async (toolCallId: string, kind: DocKindId, id: string, after: string, signal?: AbortSignal) => {
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
      if (outcome.decision === "reject") {
        const how = preview.isNew
          ? "文件没有创建。按原因改好后用 write_doc 重新提交全文"
          : "文件保持原样、被拒的稿子没有落盘。按原因改好后重新提交：整篇重写就 write_doc 给全文，局部改就先 read_doc 拿磁盘上的原文再 edit_doc，不要对被拒的稿子做 edit_doc";
        return text(`用户拒绝写入 ${preview.path}${outcome.reason ? `，原因：${outcome.reason}` : ""}。${how}，不要原样重试。`);
      }
      const header = await store.write(kind, preview.id, preview.after, { expectBefore: preview.before });
      ctx.onDocsChanged();
      return text(`已写入 ${header.path}（${header.title}）`);
    };

    tools.push(
      defineTool({
        name: "write_doc",
        label: "写文档",
        description:
          "新建文档或整篇重写：写入完整文件文本（含 frontmatter，用 doc_template 拿模板）。改已有文档的局部请用 edit_doc。会先在界面上给用户看 diff，用户批准后才真正写入；被拒时返回原因。",
        parameters: Type.Object({
          kind: KIND_SCHEMA,
          id: Type.String({ description: "文档 id：卡片用中文名（如 林尧），章号 / 卷号给数字" }),
          content: Type.String({ description: "完整文件文本，必须以 --- 开头的 frontmatter 起始" }),
        }),
        execute: async (toolCallId, params, signal) => {
          const kind = assertKind(params.kind);
          if (!/^---\r?\n/.test(params.content)) {
            throw new Error("content 必须以 frontmatter（--- 开头）起始，先用 doc_template 拿模板");
          }
          return approveAndWrite(toolCallId, kind, params.id, params.content, signal);
        },
      }),
    );

    tools.push(
      defineTool({
        name: "edit_doc",
        label: "改文档",
        description:
          "局部修改一篇已有文档：给若干组 old/new，old 是文件里的原文片段（须唯一匹配，可多带一两行上下文），new 是替换后的文字（空串即删除）。不必复述整篇。只改动的部分会以 diff 给用户审批；原文对不上时会报错，请重新 read_doc 取原文再改。",
        parameters: Type.Object({
          kind: KIND_SCHEMA,
          id: Type.String({ description: "文档 id，章号可以直接给数字" }),
          edits: Type.Array(
            Type.Object({
              old: Type.String({ description: "原文片段，逐字照抄（含换行）；空串表示追加到文末" }),
              new: Type.String({ description: "新文字；空串表示删除 old" }),
            }),
            { minItems: 1, maxItems: 20 },
          ),
        }),
        execute: async (toolCallId, params, signal) => {
          const kind = assertKind(params.kind);
          const doc = await store.read(kind, params.id);
          if (!doc) throw new Error(`${zhPath(kind, store.normalizeId(kind, params.id))} 不存在，新建请用 write_doc`);
          const after = applyEdits(doc.raw, params.edits);
          return approveAndWrite(toolCallId, kind, doc.id, after, signal);
        },
      }),
    );
  }

  if (perms.canAsk) {
    tools.push(
      defineTool({
        name: "ask_user",
        label: "问作者",
        description:
          "向作者提一个问题，等作者在界面上回答。**每次都要给 options**：封闭问题给明确选项；开放问题（书名、故事、人名这类）给 2–4 个你替作者想好的具体候选，作者点一下就能选，也能自由输入。候选是一大段文字（比如同一段的两种写法、两版人物小传）时，用 {label, text} 形式：label 是短名字（「主角是 A」「留白版」），text 是完整正文，界面会把它们并排铺开给作者对比。界面会按候选形态自动补逃生口（换一批 / 混搭 / 你替我定 / 先放一放），你不用重复给。",
        parameters: Type.Object({
          question: Type.String(),
          options: Type.Optional(
            Type.Array(
              Type.Union([
                Type.String(),
                Type.Object({
                  label: Type.String({ description: "候选的短名字，作者一眼能认出" }),
                  text: Type.String({ description: "候选完整正文，支持 Markdown" }),
                }),
              ]),
              { description: "可选项 2–6 个。开放问题也要给具体候选，例如书名就直接给 3 个备选书名；长文本候选用 {label, text}" },
            ),
          ),
          allowFreeText: Type.Optional(Type.Boolean({ description: "默认 true" })),
        }),
        prepareArguments: repairAskArgs,
        execute: async (_id, params, signal) => {
          const answer = await ctx.gate.requestQuestion(
            {
              agentId: ctx.agentId,
              text: params.question,
              options: params.options ?? [],
              allowFreeText: params.allowFreeText ?? true,
            },
            signal,
          );
          return text(`作者回答：${answer}`);
        },
      }),
    );
  }

  if (perms.canSpawn && ctx.spawn) {
    const spawn = ctx.spawn;
    const roleList = ROLE_IDS.filter((r) => r !== "lead")
      .map((r) => `${r}（${ROLES[r].label}：${ROLES[r].description}）`)
      .join("；");
    tools.push(
      defineTool({
        name: "spawn_agents",
        label: "派子 agent",
        description: `并行派一个或多个子 agent 干活，全部完成后返回各自的结论。可用角色：${roleList}。任务书写清目标、要读哪些卡（kind/id）、交付物、边界；不要把卡片内容复制进任务书。mode=propose 时子 agent 只能出候选、落盘工具被挡住，作者拍板后用 continue_agent 切到 commit 让它接着孵化落盘；作者已经定了方向、只是要产出时才直接 commit。派 planner / writer 要求 守则/立项 的「一句话故事」已填，否则会被拒。`,
        parameters: Type.Object({
          tasks: Type.Array(
            Type.Object({
              role: Type.Union(ROLE_IDS.filter((r) => r !== "lead").map((r) => Type.Literal(r))),
              task: Type.String({ description: "任务书" }),
              mode: Type.Optional(Type.Union([Type.Literal("propose"), Type.Literal("commit")], { description: "propose=只出候选不落盘；commit=可以落盘。默认 commit" })),
            }),
            { minItems: 1, maxItems: 6 },
          ),
        }),
        execute: async (_id, params, signal, onUpdate) => {
          const tasks: SpawnTask[] = params.tasks.map((t) => {
            const role: unknown = t.role;
            if (!isRoleId(role) || role === "lead") throw new Error(`不能派这个角色：${String(role)}`);
            return { role, task: t.task, ...(t.mode ? { mode: t.mode } : {}) };
          });
          if (tasks.some((t) => STORY_GATED_ROLES.has(t.role)) && !(await hasOneLineStory(store))) {
            throw new Error(ONE_LINE_STORY_GATE_MESSAGE);
          }
          const result = await spawn(tasks, (progress, details) => onUpdate?.({ ...text(progress), details }), signal);
          return { ...text(result.text), details: result.details };
        },
      }),
    );
  }

  if (perms.canSpawn && ctx.continueAgent) {
    const continueAgent = ctx.continueAgent;
    tools.push(
      defineTool({
        name: "continue_agent",
        label: "续派子 agent",
        description:
          "接着和一个已经跑完一轮的子 agent 说话，它带着之前的上下文继续干。用于：它给了候选、作者拍板后让它在选中的候选上孵化落盘；或让它按作者意见修改。agentId 从 spawn_agents 结果的标题里取。不要用它重派一个全新的任务。",
        parameters: Type.Object({
          agentId: Type.String({ description: "spawn_agents 结果标题里的 id" }),
          message: Type.String({ description: "发给它的消息：作者拍板了什么、接下来做什么" }),
          mode: Type.Optional(Type.Union([Type.Literal("propose"), Type.Literal("commit")], { description: "要切换它的落盘权限时给：拍板后让它落盘就传 commit；不传保持原样" })),
        }),
        execute: async (_id, params, signal, onUpdate) => {
          const result = await continueAgent(params.agentId, params.message, params.mode, (progress, details) => onUpdate?.({ ...text(progress), details }), signal);
          return { ...text(result.text), details: result.details };
        },
      }),
    );
  }

  return tools;
}

export function toolNames(tools: ToolDefinition[]): string[] {
  return tools.map((t) => t.name);
}
