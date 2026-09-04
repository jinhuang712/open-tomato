import type { AppInfo } from "../../preload/bridge-types";
import { createResource, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { formatKeys, KEYMAP, SCOPE_LABEL, SCOPES } from "../../shared/keymap";
import { bridge } from "../bridge";
import { setState, type SettingsTab, state, toast } from "../state";
import { ModelSettings } from "./ModelSettings";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "keymap", label: "快捷键" },
  { id: "models", label: "模型" },
  { id: "storage", label: "存储" },
  { id: "about", label: "关于" },
];

/**
 * 设置。浮层，左侧分组、右侧内容，和模型选择器同一套骨架。
 * 快捷键只读展示，来源是 shared/keymap 单源；存储与关于回答「东西在哪」「版本是啥」两个最常问的问题。
 */
export function Settings() {
  const close = () => setState("settingsOpen", false);
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] bg-black/30" onClick={close}>
      <div class="w-[900px] h-[min(640px,80vh)] rounded-2xl bg-paper border border-line shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div class="flex items-center gap-3 px-5 py-3 border-b border-line">
          <span class="font-medium">设置</span>
          <span class="flex-1" />
          <button class="text-ink-3 hover:text-ink px-1" onClick={close}>
            ✕
          </button>
        </div>
        <div class="flex flex-1 min-h-0">
          <div class="w-[160px] shrink-0 border-r border-line py-2 px-2">
            <For each={TABS}>
              {(t) => (
                <button
                  class={`w-full h-7.5 px-2 rounded-md text-left ${state.settingsTab === t.id ? "bg-paper-3 text-ink" : "text-ink-2 hover:bg-paper-3 hover:text-ink"}`}
                  onClick={() => setState("settingsTab", t.id)}
                >
                  {t.label}
                </button>
              )}
            </For>
          </div>
          <div class="flex-1 min-w-0 flex flex-col">
            <Switch>
              <Match when={state.settingsTab === "keymap"}>
                <KeymapPane />
              </Match>
              <Match when={state.settingsTab === "models"}>
                <ModelSettings />
              </Match>
              <Match when={state.settingsTab === "storage"}>
                <StoragePane />
              </Match>
              <Match when={state.settingsTab === "about"}>
                <AboutPane />
              </Match>
            </Switch>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section(props: { title: string; hint?: string; children: unknown }) {
  return (
    <section class="mb-6">
      <div class="flex items-baseline gap-2 px-6 mb-1">
        <span class="text-xs font-medium text-ink-2">{props.title}</span>
        <Show when={props.hint}>
          <span class="text-xs text-ink-3">{props.hint}</span>
        </Show>
      </div>
      <div class="mx-4 rounded-lg border border-line divide-y divide-line">{props.children as never}</div>
    </section>
  );
}

function Row(props: { label: string; note?: string | undefined; children?: unknown }) {
  return (
    <div class="flex items-center gap-3 px-3 h-9">
      <span class="shrink-0">{props.label}</span>
      <Show when={props.note}>
        <span class="text-xs text-ink-3 truncate">{props.note}</span>
      </Show>
      <span class="flex-1" />
      {props.children as never}
    </div>
  );
}

function Kbd(props: { keys: string }) {
  return <kbd class="font-sans text-xs text-ink-2 bg-paper-2 border border-line-2 rounded px-1.5 leading-5 min-w-6 text-center">{props.keys}</kbd>;
}

function KeymapPane() {
  return (
    <div class="flex-1 overflow-y-auto py-4">
      <For each={SCOPES}>
        {(scope) => (
          <Section title={SCOPE_LABEL[scope].title} hint={SCOPE_LABEL[scope].hint}>
            <For each={KEYMAP.filter((k) => k.scope === scope)}>
              {(k) => (
                <Row label={k.label} note={k.note}>
                  <div class="flex items-center gap-1">
                    <For each={k.keys}>
                      {(acc, i) => (
                        <>
                          <Show when={i() > 0}>
                            <span class="text-xs text-ink-3 px-0.5">或</span>
                          </Show>
                          <Kbd keys={formatKeys(acc)} />
                        </>
                      )}
                    </For>
                  </div>
                </Row>
              )}
            </For>
          </Section>
        )}
      </For>
    </div>
  );
}

function PathRow(props: { label: string; path: string; note?: string }) {
  const reveal = () => void bridge.showInFolder(props.path).catch(() => toast("打不开这个位置", "error"));
  const copy = () => void bridge.copyText(props.path).then(() => toast("已复制路径"));
  return (
    <div class="px-3 py-2 flex items-center gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2">
          <span>{props.label}</span>
          <Show when={props.note}>
            <span class="text-xs text-ink-3">{props.note}</span>
          </Show>
        </div>
        <div class="font-mono text-xs text-ink-2 truncate selectable" title={props.path}>
          {props.path}
        </div>
      </div>
      <button class="text-xs text-ink-2 hover:text-ink shrink-0" onClick={copy}>
        复制
      </button>
      <button class="text-xs text-ink-2 hover:text-ink shrink-0" onClick={reveal}>
        在 Finder 中显示
      </button>
    </div>
  );
}

function StoragePane() {
  const [info] = createResource<AppInfo>(() => bridge.appInfo());
  return (
    <div class="flex-1 overflow-y-auto py-4">
      <Show when={info()}>
        {(i) => (
          <>
            <Section title="应用" hint="跟着这台机器走，换机器不带">
              <PathRow label="全局状态" note="上次选的模型、思考档、最近项目" path={`${i().home}/state.json`} />
              <PathRow label="日志" path={i().logsDir} />
            </Section>
            <Section title="模型凭据" hint="沿用 pi 的目录，API key 与自定义 provider 都在这里">
              <PathRow label="API key" path={`${i().piAgentDir}/auth.json`} />
              <PathRow label="自定义 provider" path={`${i().piAgentDir}/models.json`} />
            </Section>
            <Show
              when={state.project}
              fallback={
                <div class="px-6 text-xs">
                  <span class="font-medium text-ink-2">当前项目</span>
                  <span class="text-ink-3 ml-2">还没打开项目</span>
                </div>
              }
            >
              {(p) => (
                <Section title="当前项目" hint="随项目进 git，项目级设置优先于全局">
                  <PathRow label="项目根目录" path={p().root} />
                  <PathRow label="项目设置" note="模型与思考档" path={`${p().root}/.opentomato/settings.json`} />
                </Section>
              )}
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}

function AboutPane() {
  const [info] = createResource<AppInfo>(() => bridge.appInfo());
  return (
    <div class="flex-1 overflow-y-auto py-4">
      <Show when={info()}>
        {(i) => (
          <>
            <div class="px-6 mb-6">
              <div class="text-xl font-medium">OpenTomato</div>
              <div class="text-ink-2">macOS 桌面小说写作工具：pi agent 内核 · 可视 diff 审批 · 多角色子 agent</div>
            </div>
            <Section title="版本">
              <Row label="OpenTomato">
                <span class="font-mono text-xs text-ink-2">{i().version}</span>
              </Row>
              <Row label="Electron">
                <span class="font-mono text-xs text-ink-2">{i().electron}</span>
              </Row>
              <Row label="Chromium">
                <span class="font-mono text-xs text-ink-2">{i().chrome}</span>
              </Row>
              <Row label="Node">
                <span class="font-mono text-xs text-ink-2">{i().node}</span>
              </Row>
            </Section>
            <Section title="链接">
              <Row label="pi 模型提供方文档">
                <a class="text-xs text-accent hover:underline" href="https://github.com/badlogic/pi-mono" target="_blank" rel="noreferrer">
                  github.com/badlogic/pi-mono
                </a>
              </Row>
            </Section>
          </>
        )}
      </Show>
    </div>
  );
}
