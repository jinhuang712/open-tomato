import { hasLongOptions, optionLabel, parseChecklistAnswer, summarizeChecklistMarks, type ChecklistMark, type QuestionOption, type UiPart } from "@opentomato/core/protocol";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { renderMarkdown } from "../markdown";
import { DispatchCard, ROLE_LABELS } from "./DispatchCard";
import { DocLink } from "./DocLink";
import { WebSearchCard } from "./WebSearchCard";

type ToolPart = Extract<UiPart, { type: "tool" }>;

const LABELS: Record<string, string> = {
  project_overview: "看盘面",
  list_docs: "列文档",
  list_open: "搁置清单",
  read_doc: "读文档",
  read_marks: "读作者的批",
  read_review: "读审稿记录",
  save_review: "落审稿记录",
  search_docs: "搜文档",
  web_search: "搜网络",
  doc_template: "拿模板",
  run_check: "一致性机检",
  volume_rhythm: "看一卷的节奏",
  write_doc: "写文档",
  edit_doc: "改文档",
  settle: "记下作者说不欠",
  say: "对作者说",
  ask_user: "问作者",
  spawn_agents: "派子 agent",
  continue_agent: "续派子 agent",
  archive_agent: "封存子 agent",
  // 改名前的历史会话回放：老工具名不再有定义，但行还得是中文
  retire_agent: "让子 agent 退场",
  load_capability: "进入能力",
};


const args = (part: ToolPart) => (part.args ?? {}) as Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
/** 给作者看的话。tool_start 带的是模型原始实参，prepareArguments 的修补界面看不到，字面的反斜杠 n 要在这儿还原成换行 */
const talk = (v: unknown) => str(v).replace(/(?:\\r)?\\n/g, "\n");

/** 头部摘要：文档引用可点，其余是纯文本 */
function Summary(props: { part: ToolPart }) {
  const a = () => args(props.part);
  return (
    <Switch fallback={<span class="text-ink-3 truncate">{summarize(props.part)}</span>}>
      <Match when={props.part.name === "read_doc"}>
        <span class="flex items-center gap-1 min-w-0">
          <DocLink kind={str(a().kind)} id={str(a().id)} class="text-xs" />
          <Show when={a().section}>
            <span class="text-ink-3 truncate">· {str(a().section)}</span>
          </Show>
        </span>
      </Match>
    </Switch>
  );
}

function summarize(part: ToolPart): string {
  const a = args(part);
  switch (part.name) {
    case "list_docs":
    case "doc_template":
      return str(a.kind);
    case "search_docs":
      return str(a.query);
    case "spawn_agents": {
      const tasks = Array.isArray(a.tasks) ? (a.tasks as Array<{ role: string }>) : [];
      return tasks.map((t) => ROLE_LABELS[t.role] ?? t.role).join(" · ");
    }
    case "continue_agent":
      return str(a.message);
    case "archive_agent":
    case "retire_agent":
      return str(a.agentId);
    case "load_capability":
      return str(a.id);
    case "read_marks":
    case "settle":
      return str(a.id);
    case "read_review":
    case "save_review":
      return str(a.chapter);
    case "volume_rhythm":
      return str(a.volume);
    default:
      return "";
  }
}

/** 结果原本是给模型看的文本；给人看时按内容形态选渲染 */
function Output(props: { part: ToolPart }) {
  const raw = () => props.part.output;
  const isError = () => props.part.status === "error";
  const preformatted = () => props.part.name === "read_doc" || props.part.name === "doc_template" || raw().startsWith("---");
  return (
    <Show when={raw()}>
      <Show
        when={!isError() && !preformatted()}
        fallback={
          <pre class={`font-mono whitespace-pre-wrap break-words text-xs max-h-72 overflow-auto ${isError() ? "text-danger" : "text-ink-2"}`}>
            {raw()}
          </pre>
        }
      >
        <div class="prose-zh text-ink-2 text-xs max-h-72 overflow-auto" innerHTML={renderMarkdown(raw())} />
      </Show>
    </Show>
  );
}

/** 对作者说：主编的话就是正文，不当工具行渲染 */
function SayCard(props: { part: ToolPart }) {
  const body = () => talk(args(props.part).text);
  return (
    <Show when={body().trim()}>
      <div class="prose-zh py-1.5 selectable" innerHTML={renderMarkdown(body())} />
    </Show>
  );
}

/** 问作者：先是主编的铺垫（say），再是问题 + 答案，直接铺开不折叠 */
function AskCard(props: { part: ToolPart }) {
  const a = () => args(props.part);
  // 候选可能是 string 或 {label, text}。历史里只铺短候选；长句候选不重复铺开，「答」那行已经写了选的是哪个
  const raw = () => (Array.isArray(a().options) ? (a().options as QuestionOption[]) : []);
  const options = () => (hasLongOptions(raw()) ? [] : raw().map(optionLabel));
  const answer = () => props.part.output.replace(/^作者回答：/, "");
  // checklist 历史：按「作者逐条表态」拆回三组序号展示。老会话的 kind 可能缺失，认答案前缀兜底
  const isChecklist = () => (a() as { kind?: unknown }).kind === "checklist" || answer().startsWith("作者逐条表态");
  const parsed = () => (isChecklist() ? parseChecklistAnswer(answer()) : null);
  // 结构化展示的条件：拆得开、候选还在。野句式回退到原来的 chips + 原文
  const structured = () => parsed() !== null && raw().length > 0;
  const markOf = (i: number): ChecklistMark => {
    const p = parsed();
    if (!p) return null;
    if (p.yes.includes(i)) return "yes";
    if (p.no.includes(i)) return "no";
    return null;
  };
  const badgeOf = (i: number): { label: string; cls: string } => {
    const m = markOf(i);
    if (m === "yes") return { label: "改", cls: "border-ink-2 bg-paper-3 text-ink" };
    if (m === "no") return { label: "不改", cls: "border-line-2 text-ink-3" };
    return { label: "没表态", cls: "border-dashed border-line-2 text-ink-3" };
  };
  // 「答」行只留补充说明；没有就报紧凑序号（正文由上面的选项行展示，不复读）
  const checklistReply = (): string | null => {
    const p = parsed();
    if (!p || raw().length === 0) return null;
    if (p.tail) return p.tail;
    const n = raw().length;
    const inRange = (ids: number[]) => ids.filter((i) => i < n);
    const cited = new Set([...p.yes, ...p.no, ...p.undecided]);
    const missing = raw().map((_, i) => i).filter((i) => !cited.has(i));
    return summarizeChecklistMarks(inRange(p.yes), inRange(p.no), [...inRange(p.undecided), ...missing].sort((x, y) => x - y));
  };
  // 高亮作者选中的：single 是整句，multi 是「作者选了：A、C」里的每一项
  const chosen = () => {
    const a = answer();
    return new Set(a.startsWith("作者选了：") ? a.slice("作者选了：".length).split("、") : [a]);
  };
  const say = () => talk(a().say);
  return (
    <>
    <Show when={say().trim()}>
      <div class="prose-zh py-1.5 selectable" innerHTML={renderMarkdown(say())} />
    </Show>
    <div class="my-2 rounded-lg border border-line bg-paper-2 text-sm overflow-hidden">
      <div class="px-4 pt-3 pb-1 flex items-start gap-2">
        <div class="prose-zh flex-1" innerHTML={renderMarkdown(talk(a().question))} />
      </div>
      <Show when={options().length > 0 && !structured()}>
        <div class="px-4 pb-2 flex flex-wrap gap-1.5">
          <For each={options()}>
            {(o) => (
              <span class={`h-6.5 px-2.5 rounded-md border text-xs flex items-center ${chosen().has(o) ? "border-ink-2 bg-paper-3 text-ink" : "border-line-2 text-ink-3"}`}>{o}</span>
            )}
          </For>
        </div>
      </Show>
      {/* checklist：每条一行打标，未填的就是没表态，不再全灰 */}
      <Show when={structured()}>
        <div class="px-4 pb-2 flex flex-col gap-1">
          <For each={raw()}>
            {(opt, i) => (
              <div class="flex items-center gap-2 text-xs">
                <span class="text-ink-3 shrink-0">{i() + 1}.</span>
                <span class="flex-1 min-w-0 truncate" title={optionLabel(opt)}>{optionLabel(opt)}</span>
                <span class={`shrink-0 px-1.5 py-0.5 rounded border ${badgeOf(i()).cls}`}>{badgeOf(i()).label}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show
        when={props.part.status !== "running"}
        fallback={<div class="px-4 pb-3 text-ink-3 shimmer w-fit">等你回答…</div>}
      >
        <div class="px-4 pb-3 flex gap-2.5 selectable">
          <span class="text-ink-3 shrink-0">答</span>
          <span class={props.part.status === "error" ? "text-danger" : "text-ink"}>{checklistReply() ?? answer()}</span>
        </div>
      </Show>
    </div>
    </>
  );
}

/**
 * 拒因只取作者写的那一句：模型看的操作指引（write_doc/read_doc…）一个字都不能漏出来。
 * 之前用 `\S+` 剥路径，中文里没空格就一直贪到指引里的第一个英文空格，整段技术文案直接甩给了作者。
 */
function rejectReason(output: string): string {
  const m = output.match(/，原因：([\s\S]*?)。文件(?:没有创建|保持原样)/);
  return m?.[1]?.trim() ?? "";
}

/** 写文档：路径 + 落盘结果，diff 已经在审批时看过，这里不重复。
 * 失败（非拒因的 error：stale、参数错、审批被 abort……）必须写成「失败」并露出原因，
 * 不能掉进默认分支报「已写入」。 */
function WriteCard(props: { part: ToolPart }) {
  const a = () => args(props.part);
  const running = () => props.part.status === "running";
  const rejected = () => props.part.output.startsWith("用户拒绝");
  const failed = () => !running() && !rejected() && props.part.status === "error";
  const reason = () => rejectReason(props.part.output);
  return (
    <div class={`my-1 h-7 flex items-center gap-2 text-xs ${running() ? "px-3 rounded-md bg-warn-soft text-warn" : "text-ink-3"}`}>
      <span class={`w-1.5 h-1.5 rounded-full ${running() ? "bg-warn" : rejected() || failed() ? "bg-danger" : "bg-ok"}`} />
      <span class={`shrink-0 ${running() ? "font-medium" : "text-ink-2"}`}>{running() ? "等待审批" : rejected() ? "已拒绝" : failed() ? "失败" : "已写入"}</span>
      <DocLink kind={str(a().kind)} id={str(a().id)} class="text-xs shrink-0" />
      <Show when={rejected() && reason()}>
        <span class="text-ink-3 truncate selectable">拒因：{reason()}</span>
      </Show>
      <Show when={failed()}>
        <span class="text-danger truncate selectable" title={props.part.output}>{props.part.output}</span>
      </Show>
    </div>
  );
}

export function ToolCard(props: { part: ToolPart }) {
  const [open, setOpen] = createSignal(false);
  const label = () => LABELS[props.part.name] ?? props.part.name;
  const running = () => props.part.status === "running";

  return (
    <Switch
      fallback={
        <div class="my-0.5 text-xs">
          <button class="w-full h-6.5 flex items-center gap-2 text-left text-ink-3 hover:text-ink-2" onClick={() => setOpen(!open())}>
            <span class={`w-1.5 h-1.5 rounded-full ${running() ? "bg-accent" : props.part.status === "error" ? "bg-danger" : "bg-ok"}`} />
            <span class={running() ? "shimmer" : "text-ink-2"}>{label()}</span>
            <span class="flex-1 min-w-0 flex">
              <Summary part={props.part} />
            </span>
            <span class="text-ink-3">{open() ? "▾" : "▸"}</span>
          </button>
          <Show when={open()}>
            <div class="mt-1 px-4 py-2 rounded-lg bg-paper-2 selectable">
              <Output part={props.part} />
            </div>
          </Show>
        </div>
      }
    >
      <Match when={props.part.name === "web_search"}>
        <WebSearchCard part={props.part} />
      </Match>
      <Match when={props.part.name === "say"}>
        <SayCard part={props.part} />
      </Match>
      <Match when={props.part.name === "ask_user"}>
        <AskCard part={props.part} />
      </Match>
      <Match when={props.part.name === "write_doc" || props.part.name === "edit_doc"}>
        <WriteCard part={props.part} />
      </Match>
      <Match when={props.part.name === "spawn_agents" || props.part.name === "continue_agent"}>
        <DispatchCard part={props.part} />
      </Match>
    </Switch>
  );
}
