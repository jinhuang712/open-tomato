import { createSignal, onCleanup, Show } from "solid-js";
import { actions, setState, state } from "../state";

/**
 * 顶栏只放高频入口：书名（低频操作收进它的菜单）· 搜索 · 等你拍板 · 模型。
 * 拍板徽章把待答和待审合成一个数，点进主编会话处理。
 */
export function Titlebar() {
  const pending = () => state.questions.length + state.approvals.length;
  return (
    <div class="drag relative h-11 shrink-0 flex items-center pl-[84px] pr-3 gap-3 border-b border-line">
      <Show when={state.project} fallback={<span class="text-ink-2">OpenTomato</span>}>
        {(p) => <BookMenu name={p().name} />}
      </Show>
      <span class="flex-1" />
      {/* 绝对定位居中，不受两侧内容宽度影响 */}
      <Show when={state.project}>
        <button
          class="no-drag absolute left-1/2 -translate-x-1/2 w-[320px] h-7 px-2.5 rounded-md bg-paper-3 hover:bg-paper-4 text-ink-3 text-xs flex items-center gap-2"
          onClick={() => setState("searchOpen", true)}
        >
          <SearchIcon />
          <span class="flex-1 text-left">搜人物、设定、章节、正文</span>
          <kbd class="font-sans text-xs text-ink-3 border border-line-2 rounded px-1 leading-4">⌘K</kbd>
        </button>
      </Show>
      <div class="no-drag flex items-center gap-1 text-xs">
        <Show when={pending() > 0}>
          <button class="h-6.5 px-2.5 rounded-md bg-warn-soft text-warn font-medium hover:brightness-110" onClick={() => actions.openChat("lead")}>
            {pending()} 项等你拍板
          </button>
        </Show>
        <button class="h-6.5 px-2.5 rounded-md text-ink-2 hover:bg-paper-3" onClick={() => setState("modelPickerOpen", true)}>
          {state.models?.current ? state.models.current.id : "选择模型"}
        </button>
      </div>
    </div>
  );
}

function BookMenu(props: { name: string }) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;
  const onDown = (e: MouseEvent) => {
    if (root && !root.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("mousedown", onDown);
  onCleanup(() => document.removeEventListener("mousedown", onDown));
  const run = (fn: () => unknown) => {
    setOpen(false);
    void fn();
  };
  return (
    <div ref={root} class="no-drag relative">
      <button class="h-6.5 px-2 -ml-2 rounded-md flex items-center gap-1 font-medium hover:bg-paper-3" onClick={() => setOpen(!open())}>
        {props.name}
        <ChevronIcon />
      </button>
      <Show when={open()}>
        <div class="absolute left-0 top-8 z-30 w-52 py-1 rounded-lg border border-line bg-paper-2 shadow-xl text-sm">
          <MenuItem label="新会话" hint="⌘⇧N" onClick={() => run(actions.newChat)} />
          <MenuItem label="重新机检" onClick={() => run(actions.runCheck)} />
          <MenuItem label="导出会话" hint="⌘E" onClick={() => run(actions.exportChat)} />
          <div class="my-1 border-t border-line" />
          <MenuItem label="打开别的项目" onClick={() => run(() => actions.openProject())} />
          <MenuItem label="关闭项目" onClick={() => run(actions.closeProject)} />
        </div>
      </Show>
    </div>
  );
}

function MenuItem(props: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button class="w-full h-8 px-3 flex items-center text-left hover:bg-paper-3" onClick={props.onClick}>
      <span class="flex-1">{props.label}</span>
      <Show when={props.hint}>
        <span class="text-xs text-ink-3">{props.hint}</span>
      </Show>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-ink-3">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
