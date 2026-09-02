import type { UiPart } from "@opentomato/core/protocol";
import { createSignal, Show } from "solid-js";

type ToolPart = Extract<UiPart, { type: "tool" }>;

const LABELS: Record<string, string> = {
  project_overview: "看盘面",
  list_docs: "列文档",
  read_doc: "读文档",
  search_docs: "搜文档",
  doc_template: "拿模板",
  run_check: "一致性机检",
  write_doc: "写文档",
  ask_user: "问作者",
  spawn_agents: "派子 agent",
};

function summarize(part: ToolPart): string {
  const a = (part.args ?? {}) as Record<string, unknown>;
  switch (part.name) {
    case "read_doc":
      return `${String(a.kind)}/${String(a.id)}${a.section ? ` · ${String(a.section)}` : ""}`;
    case "write_doc":
      return `${String(a.kind)}/${String(a.id)}`;
    case "list_docs":
    case "doc_template":
      return String(a.kind ?? "");
    case "search_docs":
      return String(a.query ?? "");
    case "ask_user":
      return String(a.question ?? "").slice(0, 60);
    case "spawn_agents": {
      const tasks = Array.isArray(a.tasks) ? (a.tasks as Array<{ role: string }>) : [];
      return tasks.map((t) => t.role).join(" · ");
    }
    default:
      return "";
  }
}

export function ToolCard(props: { part: ToolPart }) {
  const [open, setOpen] = createSignal(false);
  const label = () => LABELS[props.part.name] ?? props.part.name;
  const running = () => props.part.status === "running";

  return (
    <div class="my-1 rounded-lg border border-line bg-paper-2 text-[12px] overflow-hidden">
      <button class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-paper-3" onClick={() => setOpen(!open())}>
        <span class={`w-1.5 h-1.5 rounded-full ${running() ? "bg-accent" : props.part.status === "error" ? "bg-danger" : "bg-ok"}`} />
        <span class={`font-medium ${running() ? "shimmer" : "text-ink"}`}>{label()}</span>
        <span class="text-ink-3 truncate flex-1 font-mono">{summarize(props.part)}</span>
        <span class="text-ink-3">{open() ? "▾" : "▸"}</span>
      </button>
      <Show when={open()}>
        <div class="px-3 pb-2 border-t border-line selectable">
          <div class="text-ink-3 mt-1.5 mb-0.5">参数</div>
          <pre class="font-mono whitespace-pre-wrap break-words text-ink-2 max-h-40 overflow-auto">{JSON.stringify(props.part.args, null, 2)}</pre>
          <Show when={props.part.output}>
            <div class="text-ink-3 mt-2 mb-0.5">结果</div>
            <pre class={`font-mono whitespace-pre-wrap break-words max-h-72 overflow-auto ${props.part.status === "error" ? "text-danger" : "text-ink-2"}`}>
              {props.part.output}
            </pre>
          </Show>
        </div>
      </Show>
    </div>
  );
}
