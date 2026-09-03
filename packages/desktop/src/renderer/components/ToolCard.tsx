import { hasLongOptions, optionLabel, type QuestionOption, type UiPart } from "@opentomato/core/protocol";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { renderMarkdown } from "../markdown";
import { DocLink } from "./DocLink";

type ToolPart = Extract<UiPart, { type: "tool" }>;

const LABELS: Record<string, string> = {
  project_overview: "看盘面",
  list_docs: "列文档",
  read_doc: "读文档",
  search_docs: "搜文档",
  doc_template: "拿模板",
  run_check: "一致性机检",
  write_doc: "写文档",
  edit_doc: "改文档",
  ask_user: "问作者",
  spawn_agents: "派子 agent",
  continue_agent: "续派子 agent",
};

const ROLE_LABELS: Record<string, string> = {
  architect: "设定师",
  planner: "结构师",
  writer: "执笔",
  critic_market: "市场评审",
  critic_reader: "读者评审",
  critic_voice: "文风评审",
  continuity: "连续性审校",
  arbiter: "裁决",
};

const args = (part: ToolPart) => (part.args ?? {}) as Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

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

/** 问作者：问题 + 答案直接铺开，不折叠 */
function AskCard(props: { part: ToolPart }) {
  const a = () => args(props.part);
  // 候选可能是 string 或 {label, text}。历史里只铺短候选；长句候选不重复铺开，「答」那行已经写了选的是哪个
  const raw = () => (Array.isArray(a().options) ? (a().options as QuestionOption[]) : []);
  const options = () => (hasLongOptions(raw()) ? [] : raw().map(optionLabel));
  const answer = () => props.part.output.replace(/^作者回答：/, "");
  return (
    <div class="my-2 rounded-lg border border-line bg-paper-2 text-sm overflow-hidden">
      <div class="px-4 pt-3 pb-1 flex items-start gap-2">
        <div class="prose-zh flex-1" innerHTML={renderMarkdown(str(a().question))} />
      </div>
      <Show when={options().length > 0}>
        <div class="px-4 pb-2 flex flex-wrap gap-1.5">
          <For each={options()}>
            {(o) => (
              <span class={`h-6.5 px-2.5 rounded-md border text-xs flex items-center ${o === answer() ? "border-ink-2 bg-paper-3 text-ink" : "border-line-2 text-ink-3"}`}>{o}</span>
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
          <span class={props.part.status === "error" ? "text-danger" : "text-ink"}>{answer()}</span>
        </div>
      </Show>
    </div>
  );
}

/** 写文档：路径 + 落盘结果，diff 已经在审批时看过，这里不重复 */
function WriteCard(props: { part: ToolPart }) {
  const a = () => args(props.part);
  const running = () => props.part.status === "running";
  const rejected = () => props.part.output.startsWith("用户拒绝");
  return (
    <div class={`my-1 h-7 flex items-center gap-2 text-xs ${running() ? "px-3 rounded-md bg-warn-soft text-warn" : "text-ink-3"}`}>
      <span class={`w-1.5 h-1.5 rounded-full ${running() ? "bg-warn" : rejected() || props.part.status === "error" ? "bg-danger" : "bg-ok"}`} />
      <span class={running() ? "font-medium" : "text-ink-2"}>{running() ? "等待审批" : rejected() ? "已拒绝" : "已写入"}</span>
      <DocLink kind={str(a().kind)} id={str(a().id)} class="text-xs" />
      <Show when={rejected()}>
        <span class="text-ink-3 truncate selectable">{props.part.output.replace(/^用户拒绝写入 \S+/, "").replace(/^，原因：/, "").replace(/。按原因修改.*$/, "")}</span>
      </Show>
    </div>
  );
}

/** 派子 agent：任务书列表 + 回传 */
function SpawnCard(props: { part: ToolPart; open: boolean; toggle: () => void }) {
  const tasks = () => (Array.isArray(args(props.part).tasks) ? (args(props.part).tasks as Array<{ role: string; task: string }>) : []);
  const running = () => props.part.status === "running";
  return (
    <div class="my-1 text-xs">
      <button class="w-full h-7 flex items-center gap-2 text-left text-ink-3 hover:text-ink-2" onClick={props.toggle}>
        <span class={`w-1.5 h-1.5 rounded-full ${running() ? "bg-accent" : props.part.status === "error" ? "bg-danger" : "bg-ok"}`} />
        <span class={running() ? "shimmer" : "text-ink-2"}>{running() ? "子 agent 在干活" : "子 agent 已回传"}</span>
        <span class="text-ink-3 truncate flex-1">{tasks().map((t) => ROLE_LABELS[t.role] ?? t.role).join(" · ")}</span>
        <span class="text-ink-3">{props.open ? "▾" : "▸"}</span>
      </button>
      <Show when={props.open}>
        <div class="mt-1 px-4 py-2 rounded-lg bg-paper-2 space-y-2 selectable text-sm">
          <For each={tasks()}>
            {(t) => (
              <div class="mt-2">
                <div class="text-ink-3 text-xs mb-0.5">任务书 · {ROLE_LABELS[t.role] ?? t.role}</div>
                <div class="text-ink-2 whitespace-pre-wrap">{t.task}</div>
              </div>
            )}
          </For>
          <Show when={props.part.output}>
            <div class="text-ink-3 text-xs mt-2 mb-0.5">回传</div>
            <Output part={props.part} />
          </Show>
        </div>
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
      <Match when={props.part.name === "ask_user"}>
        <AskCard part={props.part} />
      </Match>
      <Match when={props.part.name === "write_doc" || props.part.name === "edit_doc"}>
        <WriteCard part={props.part} />
      </Match>
      <Match when={props.part.name === "spawn_agents" || props.part.name === "continue_agent"}>
        <SpawnCard part={props.part} open={open()} toggle={() => setOpen(!open())} />
      </Match>
    </Switch>
  );
}
