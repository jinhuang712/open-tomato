import { createSignal, Show } from "solid-js";
import { actions, errText, setState, state } from "../state";
import { CloudIcon, SpinnerIcon } from "./CloudIcons";

/**
 * 云端存储设置：Supabase 地址 + service_role key + bucket。
 * 「连接并保存」先连一次再落盘，连不上就原样把错误摆在按钮旁边，不 toast。
 * 密钥只在内核进程里用，这里拿不到已存的 key，所以已配置时输入框留空、显示「已连接」。
 */
export function CloudSettings() {
  const configured = () => state.cloud?.configured === true;
  const [url, setUrl] = createSignal(state.cloud?.url ?? "");
  const [key, setKey] = createSignal("");
  const [bucket, setBucket] = createSignal(state.cloud?.bucket ?? "projects");
  const [phase, setPhase] = createSignal<"idle" | "verifying" | "ok" | "error">("idle");
  const [error, setError] = createSignal<string | null>(null);

  const close = () => setState("cloudSettingsOpen", false);
  const canSubmit = () => url().trim().length > 0 && key().trim().length > 0 && phase() !== "verifying";

  const submit = async () => {
    if (!canSubmit()) return;
    setPhase("verifying");
    setError(null);
    try {
      await actions.configureCloud(url(), key(), bucket());
      setPhase("ok");
      setKey("");
      setTimeout(close, 600);
    } catch (e) {
      setPhase("error");
      setError(errText(e));
    }
  };

  const inputClass = "px-3 py-1.5 rounded-lg border border-line bg-paper-2 outline-none focus:border-accent font-mono text-xs";

  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/30" onClick={close}>
      <div class="w-[520px] rounded-2xl bg-paper border border-line shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div class="flex items-center gap-3 px-5 py-3 border-b border-line">
          <span class="font-medium">云端存储</span>
          <span class="text-ink-3 text-xs">Supabase Storage · 私有 bucket</span>
          <span class="flex-1" />
          <button class="text-ink-3 hover:text-ink px-1" onClick={close}>
            ✕
          </button>
        </div>

        <div class="px-5 py-4 space-y-3.5">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-ink-2">项目地址</span>
            <input
              class={inputClass}
              placeholder="https://xxxx.supabase.co"
              value={url()}
              onInput={(e) => setUrl(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-ink-2">service_role key</span>
            <input
              type="password"
              class={inputClass}
              placeholder={configured() ? "已保存在本机，要换才填" : "eyJhbGciOi…"}
              value={key()}
              onInput={(e) => setKey(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
            <span class="text-xs text-ink-3">
              在 Supabase 后台 Project Settings → API 里复制。只存在本机的应用数据目录（cloud.json），不进项目目录或 git。
            </span>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-ink-2">bucket</span>
            <input class={`${inputClass} w-[200px]`} value={bucket()} onInput={(e) => setBucket(e.currentTarget.value)} />
          </label>
        </div>

        <div class="flex items-center gap-2.5 px-5 py-3 border-t border-line text-xs">
          <Show when={phase() === "verifying"}>
            <SpinnerIcon class="text-accent shrink-0" />
            <span class="text-accent truncate">正在连接，顺手建 bucket…</span>
          </Show>
          <Show when={phase() === "ok"}>
            <span class="w-1.5 h-1.5 rounded-full bg-ok shrink-0" />
            <span class="text-ok truncate">已连接 · {bucket() || "projects"}</span>
          </Show>
          <Show when={phase() === "error"}>
            <span class="text-danger selectable break-all leading-snug">{error()}</span>
          </Show>
          <Show when={phase() === "idle" && configured()}>
            <CloudIcon class="text-ok shrink-0" />
            <span class="text-ink-2 truncate" title={`${state.cloud?.url} / ${state.cloud?.bucket}`}>
              已连接 · {state.cloud?.url?.replace(/^https?:\/\//, "")} / {state.cloud?.bucket}
            </span>
          </Show>
          <span class="flex-1" />
          <Show when={configured()}>
            <button class="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-danger hover:bg-danger-soft" onClick={() => void actions.clearCloud().then(close)}>
              断开
            </button>
          </Show>
          <button class="shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg bg-ink text-paper font-medium disabled:opacity-40" disabled={!canSubmit()} onClick={() => void submit()}>
            {phase() === "verifying" ? "连接中…" : configured() ? "重新连接" : "连接并保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
