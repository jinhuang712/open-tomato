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
        <div class="inline-block px-2 py-0.5 rounded-full bg-paper-3 text-ink-3 text-[11px] tracking-wider mb-3">{plan().stage}阶段</div>
        <div class="font-serif text-[28px] leading-tight mb-2">{state.project?.name}</div>
        <div class="text-ink-2 mb-7 leading-relaxed">{plan().line}</div>

        <Show when={disabled()}>
          <div class="mb-4 px-3 py-2 rounded-lg bg-warn-soft text-warn text-[12px]">先在右上角选一个模型，下面的按钮才能点。</div>
        </Show>

        <Show when={primary()}>
          {(c) => (
            <button
              class="w-full text-left px-5 py-4 rounded-2xl bg-accent text-white shadow-lg hover:brightness-110 transition disabled:opacity-40 flex items-center gap-4"
              disabled={disabled()}
              onClick={() => runStep(c())}
            >
              <span class="flex-1">
                <span class="block text-[16px] font-medium">{c().title}</span>
                <span class="block text-[12px] opacity-80 mt-0.5">{c().desc}</span>
              </span>
              <span class="text-xl opacity-80">→</span>
            </button>
          )}
        </Show>

        <div class="grid grid-cols-3 gap-2 mt-3">
          <For each={secondary()}>
            {(c) => (
              <button
                class="text-left px-3.5 py-3 rounded-xl border border-line bg-paper-2 hover:border-accent hover:bg-accent-soft/40 transition-colors disabled:opacity-40"
                disabled={disabled()}
                onClick={() => runStep(c)}
              >
                <div class="font-medium text-[13px]">{c.title}</div>
                <div class="text-[11.5px] text-ink-3 mt-0.5 leading-snug">{c.desc}</div>
              </button>
            )}
          </For>
        </div>

        <div class="mt-6 text-[12px] text-ink-3">或者直接在下面和主编说话</div>
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
