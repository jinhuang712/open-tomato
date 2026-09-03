import { createMemo, For, Show } from "solid-js";
import { actions, setState, state } from "../state";
import { stagePlan, type StageStep } from "../stage";

/** 空会话的起手面板：按项目现状判断处在哪个阶段，把下一步做成按钮 */
export function EmptyStart() {
  const plan = createMemo(() => stagePlan(state.docs));
  const primary = () => plan().steps.find((c) => c.primary);
  const secondary = () => plan().steps.filter((c) => !c.primary);
  const disabled = () => !state.models?.current;

  return (
    <div class="flex-1 flex items-center justify-center px-8 py-10">
      <div class="w-full max-w-[560px] text-center">
        <div class="text-xl mb-2">{state.project?.name}</div>
        <div class="text-ink-2 mb-7 leading-relaxed">{plan().line}</div>

        <Show when={disabled()}>
          <div class="mb-4 px-3 py-2 rounded-lg bg-warn-soft text-warn text-xs">先在右上角选一个模型，下面的按钮才能点。</div>
        </Show>

        <Show when={primary()}>
          {(c) => (
            <button
              class="w-full text-left px-5 py-3.5 rounded-lg bg-ink text-paper hover:brightness-110 transition disabled:opacity-40 flex items-center gap-4"
              disabled={disabled()}
              onClick={() => runStep(c())}
            >
              <span class="flex-1">
                <span class="block text-sm font-medium">{c().title}</span>
                <span class="block text-xs opacity-70 mt-0.5">{c().desc}</span>
              </span>
            </button>
          )}
        </Show>

        <div class="grid grid-cols-3 gap-2 mt-3">
          <For each={secondary()}>
            {(c) => (
              <button
                class="text-left px-3.5 py-3 rounded-lg border border-line hover:border-ink-3 transition-colors disabled:opacity-40"
                disabled={disabled()}
                onClick={() => runStep(c)}
              >
                <div class="font-medium text-sm">{c.title}</div>
                <div class="text-xs text-ink-3 mt-0.5 leading-snug">{c.desc}</div>
              </button>
            )}
          </For>
        </div>

        <div class="mt-6 text-xs text-ink-3">或者直接在下面和主编说话</div>
      </div>
    </div>
  );
}

/** 执行一个下一步候选：能力带了参数或不需要参数就直接跑，否则开参数弹窗；说话类往输入框预填 */
export function runStep(step: StageStep) {
  if (step.kind === "say") {
    setState("composerDraft", step.text);
    return;
  }
  const cap = state.capabilities.find((c) => c.id === step.cap);
  if (!cap) return;
  if (step.params || cap.params.length === 0) void actions.runCapability(step.cap, step.params ?? {});
  else setState("capabilityDialog", cap);
}
