import { createSignal, onCleanup, Show } from "solid-js";
import { formatBytes, relativeTime } from "../format";
import { actions, setState, state } from "../state";
import { CloudIcon, SpinnerIcon } from "./CloudIcons";

/**
 * 顶栏右侧的同步指示器，只在配了云端且开着项目时出现。
 * 四种脸：已同步（最淡）· 有改动未同步（小点慢闪）· 同步中（accent 转圈）· 失败（warn）。
 * 点开是一张小卡：一句判断 + 一句细节 + 立即同步。
 */
export function CloudIndicator() {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;
  const onDown = (e: MouseEvent) => {
    if (root && !root.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("mousedown", onDown);
  onCleanup(() => document.removeEventListener("mousedown", onDown));

  const sync = () => state.cloudSync;
  const face = () => {
    const s = sync();
    if (s.phase === "uploading") return { key: "uploading", color: "text-accent", label: "同步中…", title: "正在打包上传", btn: "同步中…" } as const;
    if (s.phase === "error") return { key: "error", color: "text-warn", label: "同步失败", title: "上一次同步没成", btn: "重试" } as const;
    if (s.synced === false) return { key: "dirty", color: "text-ink-2", label: "有改动未同步", title: "本机比云端新", btn: "立即同步" } as const;
    if (s.synced === true) return { key: "synced", color: "text-ink-3", label: "已同步", title: "和云端一致", btn: "重新上传" } as const;
    return { key: "unknown", color: "text-ink-3", label: "云端", title: "正在和云端比对…", btn: "立即同步" } as const;
  };
  const detail = () => {
    const s = sync();
    if (s.phase === "error") return s.message ?? "";
    if (s.phase === "uploading") return "会话记录一起带走，压缩后通常几 MB 以内";
    const last = s.last;
    if (!last) return s.synced === false ? "云端还没有这本书的快照" : "";
    const who = last.host ? `来自 ${last.host}` : null;
    return [`上次同步 ${relativeTime(last.uploadedAt)}`, who, formatBytes(last.size)].filter(Boolean).join(" · ");
  };
  const host = () => state.cloud?.url?.replace(/^https?:\/\//, "") ?? "";
  const busy = () => sync().phase === "uploading";

  return (
    <div ref={root} class="relative">
      <button class={`h-6.5 px-2 rounded-md hover:bg-paper-3 flex items-center gap-1.5 ${face().color}`} onClick={() => setOpen(!open())} title={face().title}>
        <Show when={busy()} fallback={<CloudIcon />}>
          <SpinnerIcon />
        </Show>
        <Show when={face().key === "dirty"}>
          <span class="w-[5px] h-[5px] -ml-0.5 rounded-full bg-ink-2 pulse" />
        </Show>
        <span>{face().label}</span>
      </button>
      <Show when={open()}>
        <div class="absolute right-0 top-8 z-30 w-[272px] rounded-lg border border-line bg-paper-2 shadow-xl text-xs overflow-hidden">
          <div class="px-3 py-2.5 flex flex-col gap-0.5">
            <span class="font-medium text-ink text-sm">{face().title}</span>
            <span class={`selectable ${face().key === "error" ? "text-warn" : "text-ink-2"}`}>{detail()}</span>
          </div>
          <div class="border-t border-line px-3 pt-1.5 pb-2 flex flex-col gap-0.5 text-ink-3">
            <span class="truncate">
              {host()} / {state.cloud?.bucket}
            </span>
            <span>每 10 分钟自动同步 · 关闭项目时会再问一次</span>
          </div>
          <div class="border-t border-line px-3 py-2 flex gap-2 justify-end">
            <button
              class="px-2.5 py-1 rounded-md text-ink-2 hover:bg-paper-3"
              onClick={() => {
                setOpen(false);
                setState("cloudSettingsOpen", true);
              }}
            >
              云端存储…
            </button>
            <button
              class="px-3 py-1 rounded-md bg-ink text-paper font-medium disabled:opacity-40"
              disabled={busy()}
              onClick={() => void actions.uploadCloud(face().key === "synced")}
            >
              {face().btn}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
