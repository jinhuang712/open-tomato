import type { CloudProjectRow } from "@opentomato/core/protocol";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { formatBytes, relativeTime } from "../format";
import { actions, setState, state } from "../state";
import { CloudIcon, SpinnerIcon } from "./CloudIcons";

/**
 * 欢迎页的「云端」栏。四种状态：
 * 未配置 → 一行虚线邀请；加载中 → shimmer；出错 → danger 条带重试；就绪 → 每个云端项目一行。
 * 每行按和本机的关系只给一个动作：本机已最新（灰字）/ 拉取到本机 / 下载到本机…
 */
export function CloudProjects() {
  const configured = () => state.cloud?.configured === true;
  const host = () => state.cloud?.url?.replace(/^https?:\/\//, "") ?? "";

  return (
    <div>
      <div class="flex items-center gap-2 mb-2 text-xs text-ink-3">
        <span>云端</span>
        <Show when={configured()}>
          <span>·</span>
          <span class="truncate">
            {host()} / {state.cloud?.bucket}
          </span>
          <span class="flex-1" />
          <button class="px-1.5 rounded-md text-ink-2 hover:bg-paper-2" onClick={() => setState("cloudSettingsOpen", true)}>
            设置
          </button>
        </Show>
      </div>

      <Switch>
        <Match when={state.cloud === null}>
          <div class="px-3 py-2 text-xs text-ink-3">…</div>
        </Match>
        <Match when={!configured()}>
          <button
            class="w-full text-left px-3 py-2.5 rounded-lg border border-dashed border-line-2 hover:bg-paper-2 flex items-center gap-3"
            onClick={() => setState("cloudSettingsOpen", true)}
          >
            <CloudIcon size={18} class="text-ink-3 shrink-0" />
            <span class="flex flex-col min-w-0">
              <span class="font-medium">在另一台机器上接着写</span>
              <span class="text-xs text-ink-3">连接你的 Supabase，项目和会话打包同步。密钥只存本机，不进项目文件。</span>
            </span>
            <span class="flex-1" />
            <span class="text-xs text-accent shrink-0">连接 →</span>
          </button>
        </Match>
        <Match when={state.cloudListing === "loading" && state.cloudRows === null}>
          <div class="px-3 py-2 text-xs shimmer w-fit">正在看云端有什么…</div>
        </Match>
        <Match when={state.cloudListing === "error"}>
          <div class="px-3 py-2 rounded-lg bg-danger-soft text-danger text-xs flex items-center gap-2.5">
            <span class="flex-1 selectable">{state.cloudListError}</span>
            <button class="underline" onClick={() => void actions.refreshCloud()}>
              重试
            </button>
            <button class="underline" onClick={() => setState("cloudSettingsOpen", true)}>
              改设置
            </button>
          </div>
        </Match>
        <Match when={state.cloudRows && state.cloudRows.length === 0}>
          <div class="px-3 py-2 text-xs text-ink-3">云端还是空的。打开一个项目，它会自动同步上去。</div>
        </Match>
        <Match when={state.cloudRows}>
          {(rows) => (
            <div class="space-y-1">
              <For each={rows()}>{(row) => <CloudRow row={row} />}</For>
            </div>
          )}
        </Match>
      </Switch>
    </div>
  );
}

function CloudRow(props: { row: CloudProjectRow }) {
  const [confirming, setConfirming] = createSignal(false);
  const downloading = () => state.cloudDownloading === props.row.slug;
  const meta = () => {
    const parts = [props.row.host ? `来自 ${props.row.host}` : null, relativeTime(props.row.uploadedAt), formatBytes(props.row.size)];
    return parts.filter(Boolean).join(" · ");
  };
  const openLocal = () => props.row.local && void actions.openProject(props.row.local.root);

  return (
    <div class="w-full px-3 py-2 rounded-lg hover:bg-paper-2 flex items-center gap-3">
      <CloudIcon size={16} class="text-ink-3 shrink-0" />
      <button class="flex flex-col min-w-0 text-left" onClick={openLocal} disabled={!props.row.local} title={props.row.local ? "打开本机这份" : ""}>
        <span class="font-medium truncate">{props.row.name}</span>
        <span class="text-xs text-ink-3 truncate">{meta()}</span>
      </button>
      <span class="flex-1" />
      <Switch>
        <Match when={downloading()}>
          <span class="text-xs text-accent flex items-center gap-1.5">
            <SpinnerIcon />
            {props.row.local ? "拉取中…" : "下载中…"}
          </span>
        </Match>
        <Match when={props.row.local?.synced}>
          <span class="text-xs text-ink-3">本机已是最新</span>
        </Match>
        <Match when={props.row.local && confirming()}>
          <span class="text-xs text-ink-2">覆盖本机这份？</span>
          <button
            class="text-xs px-2.5 py-0.5 rounded-md bg-ink text-paper font-medium"
            onClick={() => {
              setConfirming(false);
              void actions.downloadCloud(props.row);
            }}
          >
            覆盖
          </button>
          <button class="text-xs px-2 py-0.5 rounded-md text-ink-2 hover:bg-paper-3" onClick={() => setConfirming(false)}>
            算了
          </button>
        </Match>
        <Match when={props.row.local}>
          <button class="text-xs px-2.5 py-0.5 rounded-md border border-accent-soft text-accent hover:bg-accent-soft" onClick={() => setConfirming(true)}>
            拉取到本机
          </button>
        </Match>
        <Match when={!props.row.local}>
          <button class="text-xs px-2.5 py-0.5 rounded-md border border-accent-soft text-accent hover:bg-accent-soft" onClick={() => void actions.downloadCloud(props.row)}>
            下载到本机…
          </button>
        </Match>
      </Switch>
    </div>
  );
}
