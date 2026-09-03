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
import { Titlebar } from "./components/Titlebar";
import { Welcome } from "./components/Welcome";
import { actions, applyEvent, setState, state } from "./state";

function Toasts() {
  return (
    <div class="fixed bottom-4 right-4 z-[60] space-y-2 pointer-events-none">
      <For each={state.toasts}>
        {(t) => (
          <div class={`px-3 py-2 rounded-lg shadow-lg text-xs max-w-[360px] selectable pointer-events-auto ${t.level === "error" ? "bg-danger text-white" : "bg-ink text-paper"}`}>
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
          <aside class="w-[232px] shrink-0 border-r border-line overflow-hidden">
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
