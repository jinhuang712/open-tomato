import { createSignal, onCleanup, Show } from "solid-js";
import { keyHint } from "../../shared/keymap";
import { registerEscape } from "../escape";
import { CloudIndicator } from "./CloudIndicator";
import { actions, setState, state } from "../state";

/**
 * 顶栏只放高频入口：项目菜单 + 书名 · 搜索 · 等你拍板 · 子 agent · 模型。
 * 菜单入口是书名左边的常驻底色按钮（和搜索框同一套控件语言），书名只是标题（留在拖拽区里，可以拖着窗口走）。
 * 拍板徽章把待答和待审合成一个数，点进主编会话处理。子 agent 徽章常驻，跑着的和出错的一眼可见。
 */
export function Titlebar() {
  return (
    // 三列网格：两侧等宽，中间是「边栏宽的占位 + 搜索框」，搜索框因此正对边栏右侧的正文列中心。
    // 空间不够时占位先缩、再缩搜索框，两侧内容永远不会被压住；一侧太宽时中间整体挪开而不是重叠。
    <div class="drag relative h-11 shrink-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center pl-[84px] pr-3 gap-3 border-b border-line">
      <div class="flex items-center min-w-0">
        <Show when={state.project} fallback={<span class="text-ink-2 shrink-0">OpenTomato</span>}>
          {(p) => <BookMenu name={p().name} />}
        </Show>
      </div>
      <div class="flex items-center min-w-0">
        <Show when={state.project}>
          {/* 占位 = 边栏 232 − 顶栏左右内边距差 (84 − 12)，这样搜索框中心正好落在 50% + 116px */}
          <span class="w-[160px] shrink-[999]" />
          <button
            class="no-drag w-[320px] min-w-0 shrink h-7 px-2.5 rounded-md bg-paper-3 hover:bg-paper-4 text-ink-3 text-xs flex items-center gap-2"
            onClick={() => setState("searchOpen", true)}
          >
            <SearchIcon />
            <span class="flex-1 text-left truncate">搜人物、设定、章节、正文</span>
            <kbd class="font-sans text-xs text-ink-3 border border-line-2 rounded px-1 leading-4 shrink-0">{keyHint("search.open")}</kbd>
          </button>
        </Show>
      </div>
      {/* 右侧只放静态项（云端、模型），会动的徽章在会话区左上角（LiveBadges）；一律不折行，空间不够只截模型名 */}
      <div class="no-drag flex items-center justify-end gap-1 text-xs min-w-0 whitespace-nowrap">
        <Show when={state.project && state.cloud?.configured}>
          <CloudIndicator />
        </Show>
        <button class="h-6.5 px-2.5 rounded-md text-ink-2 hover:bg-paper-3 flex items-center gap-1.5 min-w-0" onClick={() => setState("modelPickerOpen", true)}>
          <span class="truncate">{state.models?.current ? state.models.current.id : "选择模型"}</span>
          <Show when={state.models?.thinkingLevel && state.models.thinkingLevel !== "off"}>
            <span class="text-ink-3 shrink-0">思考 {state.models!.thinkingLevel}</span>
          </Show>
        </button>
      </div>
    </div>
  );
}

// 菜单入口和书名是两个东西：入口在书名左边，用常驻底色 + 菜单图标让它第一眼就读作按钮；
// 书名是纯标题，可以拖着窗口走、截断时悬停看全名，不参与交互。
function BookMenu(props: { name: string }) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;
  const onDown = (e: MouseEvent) => {
    if (root && !root.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("mousedown", onDown);
  onCleanup(() => document.removeEventListener("mousedown", onDown));
  registerEscape(() => open() && (setOpen(false), true));
  const run = (fn: () => unknown) => {
    setOpen(false);
    void fn();
  };
  return (
    <div ref={root} class="relative flex items-center gap-1.5 min-w-0 max-w-full">
      <button
        class="no-drag shrink-0 w-6.5 h-6.5 rounded-md flex items-center justify-center bg-paper-3 hover:bg-paper-4 text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        title="项目菜单"
        aria-label="项目菜单"
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        <MenuIcon />
      </button>
      <span class="font-medium truncate" title={props.name}>
        {props.name}
      </span>
      <Show when={open()}>
        <div class="absolute left-0 top-8 z-30 w-52 py-1 rounded-lg border border-line bg-paper-2 shadow-xl text-sm">
          <MenuItem label="导出故事种子" hint={keyHint("project.exportSeed")} onClick={() => run(actions.exportSeed)} />
          <MenuItem label="复制会话路径" tag="dev" hint={keyHint("chat.copyPath")} onClick={() => run(actions.copyTranscriptPath)} />
          <div class="my-1 border-t border-line" />
          <Show when={state.cloud?.configured}>
            <MenuItem label="同步到云端" hint="⌘S" onClick={() => run(() => actions.uploadCloud())} />
          </Show>
          <MenuItem label="云端存储…" onClick={() => run(() => setState("cloudSettingsOpen", true))} />
          <div class="my-1 border-t border-line" />
          <MenuItem label="打开别的项目" onClick={() => run(() => actions.openProject())} />
          <MenuItem label="关闭项目" onClick={() => run(() => actions.closeProject())} />
          <div class="my-1 border-t border-line" />
          <MenuItem label="设置…" hint={keyHint("settings.open")} onClick={() => run(() => setState("settingsOpen", true))} />
        </div>
      </Show>
    </div>
  );
}

function MenuItem(props: { label: string; tag?: string; hint?: string; onClick: () => void }) {
  return (
    <button class="w-full h-8 px-3 flex items-center gap-1.5 text-left hover:bg-paper-3" onClick={props.onClick}>
      <span>{props.label}</span>
      <Show when={props.tag}>
        <span class="px-1 rounded text-[10px] leading-4 font-mono border border-line text-ink-3">{props.tag}</span>
      </Show>
      <span class="flex-1" />
      <Show when={props.hint}>
        <span class="text-xs text-ink-3">{props.hint}</span>
      </Show>
    </button>
  );
}

function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
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

