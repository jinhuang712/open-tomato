import type { CapabilityInfo } from "@opentomato/core/protocol";
import { createSignal, For } from "solid-js";
import { actions, setState } from "../state";

export function CapabilityDialog(props: { capability: CapabilityInfo }) {
  const [values, setValues] = createSignal<Record<string, string>>({});
  const ready = () => props.capability.params.every((p) => !p.required || (values()[p.name] ?? "").trim());
  const submit = () => {
    if (!ready()) return;
    void actions.runCapability(props.capability.id, values());
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setState("capabilityDialog", null)}>
      <div class="w-[520px] rounded-2xl bg-paper border border-line shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div class="font-medium text-[15px] mb-1">{props.capability.label}</div>
        <div class="text-ink-2 text-[12px] mb-4">{props.capability.description}</div>
        <For each={props.capability.params}>
          {(p, i) => (
            <label class="block mb-3">
              <div class="text-[12px] text-ink-2 mb-1">
                {p.label}
                {p.required ? " *" : ""}
              </div>
              <input
                class="w-full px-3 py-2 rounded-lg border border-line bg-paper-2 outline-none focus:border-accent"
                placeholder={p.placeholder}
                value={values()[p.name] ?? ""}
                onInput={(e) => setValues((v) => ({ ...v, [p.name]: e.currentTarget.value }))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autofocus={i() === 0}
              />
            </label>
          )}
        </For>
        <div class="flex justify-end gap-2 mt-2">
          <button class="px-3 py-1.5 rounded-lg border border-line hover:bg-paper-2" onClick={() => setState("capabilityDialog", null)}>
            取消
          </button>
          <button class="px-3 py-1.5 rounded-lg bg-accent text-white font-medium disabled:opacity-40" disabled={!ready()} onClick={submit}>
            交给主编
          </button>
        </div>
      </div>
    </div>
  );
}
