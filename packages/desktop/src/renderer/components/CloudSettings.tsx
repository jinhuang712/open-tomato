import { createSignal, Show } from "solid-js";
import { actions, errText, setState, state } from "../state";
import { CloudIcon, SpinnerIcon } from "./CloudIcons";

/**
 * 云端存储设置：Supabase 的 Project URL + Secret key。bucket 名作者不用关心，内核用默认的。
 * 「连接并保存」先连一次再落盘，连不上就原样把错误摆在按钮旁边，不 toast。
 * 密钥只在内核进程里用，这里拿不到已存的 key，所以已配置时输入框留空、显示「已连接」。
 */
export function CloudSettings() {
  const configured = () => state.cloud?.configured === true;
  const [url, setUrl] = createSignal(state.cloud?.url ?? "");
  const [key, setKey] = createSignal("");
  const [phase, setPhase] = createSignal<"idle" | "verifying" | "ok" | "error">("idle");
  const [error, setError] = createSignal<string | null>(null);
  const [wiping, setWiping] = createSignal(false);

  const close = () => setState("cloudSettingsOpen", false);
  const canSubmit = () => url().trim().length > 0 && key().trim().length > 0 && phase() !== "verifying";

  const submit = async () => {
    if (!canSubmit()) return;
    setPhase("verifying");
    setError(null);
    try {
      await actions.configureCloud(url(), key());
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
          <span class="text-ink-3 text-xs">Supabase Storage</span>
          <span class="flex-1" />
          <button class="text-ink-3 hover:text-ink px-1" onClick={close}>
            ✕
          </button>
        </div>

        <div class="px-5 py-4 space-y-3.5">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-ink-2">Project URL</span>
            <input
              class={inputClass}
              placeholder="https://xxxx.supabase.co"
              value={url()}
              onInput={(e) => setUrl(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-ink-2">Secret key</span>
            <input
              type="password"
              class={inputClass}
              placeholder={configured() ? "已保存在本机，要换才填" : "sb_secret_…"}
              value={key()}
              onInput={(e) => setKey(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
            <span class="text-xs text-ink-3">
              在 Supabase 后台 Project Settings → API Keys → Secret keys 里复制（老项目叫 service_role）。首页「Copy」下拉里的 Publishable key
              是公开读的，连不上。key 只存本机应用数据目录（cloud.json），不进项目目录或 git。
            </span>
          </label>
        </div>

        <div class="flex items-center gap-2.5 px-5 py-3 border-t border-line text-xs">
          <Show when={phase() === "verifying"}>
            <SpinnerIcon class="text-accent shrink-0" />
            <span class="text-accent truncate">正在连接…</span>
          </Show>
          <Show when={phase() === "ok"}>
            <span class="w-1.5 h-1.5 rounded-full bg-ok shrink-0" />
            <span class="text-ok truncate">已连接</span>
          </Show>
          <Show when={phase() === "error"}>
            <span class="text-danger selectable break-all leading-snug">{error()}</span>
          </Show>
          <Show when={phase() === "idle" && configured()}>
            <CloudIcon class="text-ok shrink-0" />
            <span class="text-ink-2 truncate" title={state.cloud?.url ?? undefined}>
              已连接 · {state.cloud?.url?.replace(/^https?:\/\//, "")}
            </span>
          </Show>
          <span class="flex-1" />
          <Show when={configured()}>
            <button
              class="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-danger hover:bg-danger-soft disabled:opacity-40"
              title="删掉云端所有项目快照，凭据保留"
              disabled={wiping()}
              onClick={() => {
                setWiping(true);
                void actions.wipeCloud().finally(() => setWiping(false));
              }}
            >
              {wiping() ? "清空中…" : "清空云端…"}
            </button>
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
