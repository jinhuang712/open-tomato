import { For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { bridge } from "./bridge";
import { installDocLinkHandler } from "./doclink";
import { CapabilityDialog } from "./components/CapabilityDialog";
import { Chat } from "./components/Chat";
import { DocViewer } from "./components/DocViewer";
import { ModelPicker } from "./components/ModelPicker";
import { ReviewModal } from "./components/ReviewModal";
import { SearchPalette } from "./components/SearchPalette";
import { Sidebar } from "./components/Sidebar";
import { Welcome } from "./components/Welcome";
import { actions, applyEvent, setState, state } from "./state";

function Titlebar() {
  return (
    <div class="drag h-12 shrink-0 flex items-center pl-[84px] pr-4 border-b border-line bg-paper-2">
      <Show when={state.project} fallback={<span class="font-serif text-ink-2">OpenTomato</span>}>
        {(p) => (
          <>
            <span class="font-serif text-[15px]">{p().name}</span>
            <span class="ml-2 text-ink-3 text-[11px] font-mono truncate max-w-[40%]">{p().root}</span>
          </>
        )}
      </Show>
      <span class="flex-1" />
      {/* 标题栏正中的搜索入口，⌘P 同效 */}
      <Show when={state.project}>
        <button
          class="no-drag w-[360px] h-7 px-3 rounded-lg border border-line bg-paper/60 hover:bg-paper-3 text-ink-3 text-[12px] flex items-center gap-2"
          onClick={() => setState("searchOpen", true)}
        >
          <span>⌕</span>
          <span class="flex-1 text-left">搜人物、设定、章节、正文…</span>
          <kbd class="text-[10px] border border-line rounded px-1">⌘P</kbd>
        </button>
      </Show>
      <span class="flex-1" />
      <div class="no-drag flex items-center gap-1.5 text-[12px]">
        <Show when={state.approvals.length > 0}>
          <span class="px-2 py-0.5 rounded-md bg-accent-soft text-accent">{state.approvals.length} 待审</span>
        </Show>
        <Show when={state.questions.length > 0}>
          <span class="px-2 py-0.5 rounded-md bg-warn-soft text-warn">{state.questions.length} 待答</span>
        </Show>
        <button class="px-2.5 py-1 rounded-md border border-line hover:bg-paper-3 font-mono" onClick={() => setState("modelPickerOpen", true)}>
          {state.models?.current ? state.models.current.id : "选择模型"}
        </button>
        <Show when={state.project}>
          <button class="px-2.5 py-1 rounded-md border border-line hover:bg-paper-3" onClick={() => void actions.exportChat()} title="导出当前会话为 Markdown（⌘E）">
            导出会话
          </button>
          <button class="px-2.5 py-1 rounded-md border border-line hover:bg-paper-3" onClick={() => void actions.newChat()} title="⌘⇧N">
            新会话
          </button>
          <button class="px-2.5 py-1 rounded-md border border-line hover:bg-paper-3" onClick={() => void actions.closeProject()}>
            关闭项目
          </button>
        </Show>
      </div>
    </div>
  );
}

function Toasts() {
  return (
    <div class="fixed bottom-4 right-4 z-[60] space-y-2 pointer-events-none">
      <For each={state.toasts}>
        {(t) => (
          <div class={`px-3 py-2 rounded-lg shadow-lg text-[12px] max-w-[360px] selectable pointer-events-auto ${t.level === "error" ? "bg-danger text-white" : "bg-ink text-paper"}`}>
            {t.text}
          </div>
        )}
      </For>
    </div>
  );
}

export function App() {
  onMount(() => {
    const offDocLinks = installDocLinkHandler();
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "p" || e.key === "k") && state.project) {
        e.preventDefault();
        setState("searchOpen", true);
      }
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
    const offEvent = bridge.onEvent(applyEvent);
    const offMenu = bridge.onMenu((cmd) => {
      switch (cmd) {
        case "project.new":
          void actions.newProject();
          break;
        case "project.open":
          void actions.openProject();
          break;
        case "chat.new":
          if (state.project) void actions.newChat();
          break;
        case "check.run":
          if (state.project) void actions.runCheck();
          break;
        case "chat.export":
          if (state.project) void actions.exportChat();
          break;
      }
    });
    // 渲染层刷新过（HMR / 重新载入）时内核里可能还挂着项目和正在跑的 agent，
    // 先让它全部停下回到空白，和眼前的界面对齐；内核 ready 后这个请求才会被处理
    void bridge
      .request("kernel.reset", {})
      .then(() => bridge.request("models.list", {}))
      .then((m) => setState({ models: m, ready: true }))
      .catch(() => {});
    void bridge
      .request("capabilities.list", {})
      .then((c) => setState("capabilities", c))
      .catch(() => {});
    void bridge
      .request("project.recent", {})
      .then((r) => setState("recent", r))
      .catch(() => {});
    onCleanup(() => {
      offDocLinks();
      offEvent();
      offMenu();
    });
  });

  return (
    <div class="h-full flex flex-col">
      <Titlebar />
      <Show when={state.project} fallback={<Welcome />}>
        <div class="flex-1 flex min-h-0">
          <aside class="w-[260px] shrink-0 border-r border-line bg-paper-2/60 overflow-hidden">
            <Sidebar />
          </aside>
          <main class="flex-1 min-w-0">
            <Switch>
              <Match when={state.view.type === "chat" && state.view}>{(v) => <Chat agentId={v().agentId} />}</Match>
              <Match when={state.view.type === "doc" && state.view}>{(v) => <DocViewer kind={v().kind} id={v().id} />}</Match>
            </Switch>
          </main>
        </div>
      </Show>
      <Show when={state.modelPickerOpen}>
        <ModelPicker />
      </Show>
      <Show when={state.capabilityDialog}>{(c) => <CapabilityDialog capability={c()} />}</Show>
      <Show when={state.searchOpen && state.project}>
        <SearchPalette />
      </Show>
      <Show when={state.approvals.find((a) => a.approvalId === state.reviewOpen)}>{(r) => <ReviewModal request={r()} />}</Show>
      <Toasts />
    </div>
  );
}
