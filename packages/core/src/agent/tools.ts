import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CheckIssue, DocKindId, RoleId, SearchHit } from "../protocol.js";
import { applyEdits } from "../project/edits.js";
import { DOC_KIND_IDS, DOC_KINDS, resolveKind } from "../project/kinds.js";
import type { ProjectStore } from "../project/store.js";
import type { Gate } from "./gate.js";
import { ROLE_IDS, ROLES, isRoleId } from "./roles.js";

export interface SpawnTask {
  role: RoleId;
  task: string;
}

export interface ToolContext {
  store: ProjectStore;
  gate: Gate;
  agentId: string;
  runCheck: () => Promise<CheckIssue[]>;
  onDocsChanged: () => void;
  search: (query: string, limit?: number) => Promise<SearchHit[]>;
  /** 只有能派单的角色才有 */
  spawn?: (tasks: SpawnTask[], onProgress: (text: string) => void, signal?: AbortSignal) => Promise<string>;
  /** 续接一个还活着的子 agent，把新消息发给它并等它这一轮的结论 */
  continueAgent?: (agentId: string, message: string, onProgress: (text: string) => void, signal?: AbortSignal) => Promise<string>;
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
        return text(`用户拒绝写入 ${preview.path}${outcome.reason ? `，原因：${outcome.reason}` : ""}。按原因修改后再提交，不要原样重试。`);
      }
      const header = await store.write(kind, preview.id, preview.after);
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
          "向作者提一个问题，等作者在界面上回答。**每次都要给 options**：封闭问题给明确选项；开放问题（书名、故事、人名这类）给 2–4 个你替作者想好的具体候选，作者点一下就能选，也能自由输入。界面会自动补上「我还没想好」「先跳过」两个逃生选项，你不用重复给。",
        parameters: Type.Object({
          question: Type.String(),
          options: Type.Optional(Type.Array(Type.String(), { description: "可选项 2–6 个。开放问题也要给具体候选，例如书名就直接给 3 个备选书名" })),
          allowFreeText: Type.Optional(Type.Boolean({ description: "默认 true" })),
        }),
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
        description: `并行派一个或多个子 agent 干活，全部完成后返回各自的结论。可用角色：${roleList}。任务书写清目标、要读哪些卡（kind/id）、交付物、边界；不要把卡片内容复制进任务书。`,
        parameters: Type.Object({
          tasks: Type.Array(
            Type.Object({
              role: Type.Union(ROLE_IDS.filter((r) => r !== "lead").map((r) => Type.Literal(r))),
              task: Type.String({ description: "任务书" }),
            }),
            { minItems: 1, maxItems: 6 },
          ),
        }),
        execute: async (_id, params, signal, onUpdate) => {
          const tasks: SpawnTask[] = params.tasks.map((t) => {
            if (!isRoleId(t.role) || t.role === "lead") throw new Error(`不能派这个角色：${String(t.role)}`);
            return { role: t.role, task: t.task };
          });
          const result = await spawn(tasks, (progress) => onUpdate?.(text(progress)), signal);
          return text(result);
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
        }),
        execute: async (_id, params, signal, onUpdate) => {
          const result = await continueAgent(params.agentId, params.message, (progress) => onUpdate?.(text(progress)), signal);
          return text(result);
        },
      }),
    );
  }

  return tools;
}

export function toolNames(tools: ToolDefinition[]): string[] {
  return tools.map((t) => t.name);
}
