import { parsePatch } from "diff";
import { createMemo, createSignal, For, Show } from "solid-js";

export type DiffStyle = "unified" | "split";

interface Line {
  kind: "ctx" | "add" | "del" | "hunk";
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

interface Row {
  left: Line | null;
  right: Line | null;
  hunk?: string;
}

function toLines(patch: string): Line[] {
  const files = parsePatch(patch);
  const out: Line[] = [];
  for (const f of files) {
    for (const h of f.hunks) {
      out.push({ kind: "hunk", oldNo: null, newNo: null, text: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@` });
      let o = h.oldStart;
      let n = h.newStart;
      for (const raw of h.lines) {
        const tag = raw[0];
        const text = raw.slice(1);
        if (tag === "+") out.push({ kind: "add", oldNo: null, newNo: n++, text });
        else if (tag === "-") out.push({ kind: "del", oldNo: o++, newNo: null, text });
        else if (tag === "\\") continue;
        else out.push({ kind: "ctx", oldNo: o++, newNo: n++, text });
      }
    }
  }
  return out;
}

function toRows(lines: Line[]): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (l.kind === "hunk") {
      rows.push({ left: null, right: null, hunk: l.text });
      i++;
      continue;
    }
    if (l.kind === "ctx") {
      rows.push({ left: l, right: l });
      i++;
      continue;
    }
    const dels: Line[] = [];
    const adds: Line[] = [];
    while (i < lines.length && lines[i]!.kind === "del") dels.push(lines[i++]!);
    while (i < lines.length && lines[i]!.kind === "add") adds.push(lines[i++]!);
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) rows.push({ left: dels[k] ?? null, right: adds[k] ?? null });
  }
  return rows;
}

const bg = (l: Line | null) =>
  l === null ? "bg-paper-2" : l.kind === "add" ? "bg-add" : l.kind === "del" ? "bg-del" : "";
const marker = (l: Line | null) => (l === null ? "" : l.kind === "add" ? "+" : l.kind === "del" ? "−" : " ");

export function DiffView(props: { patch: string; style?: DiffStyle; showToggle?: boolean; maxHeight?: string }) {
  const [style, setStyle] = createSignal<DiffStyle>(props.style ?? "unified");
  const lines = createMemo(() => toLines(props.patch));
  const rows = createMemo(() => toRows(lines()));
  const stats = createMemo(() => ({
    add: lines().filter((l) => l.kind === "add").length,
    del: lines().filter((l) => l.kind === "del").length,
  }));

  return (
    <div class="rounded-lg border border-line overflow-hidden text-[12px] font-mono">
      <div class="flex items-center gap-3 px-3 py-1.5 bg-paper-2 border-b border-line font-sans text-ink-2">
        <span class="text-ok">+{stats().add}</span>
        <span class="text-danger">−{stats().del}</span>
        <span class="flex-1" />
        <Show when={props.showToggle ?? true}>
          <div class="flex rounded-md border border-line overflow-hidden text-[11px]">
            <button
              class={`px-2 py-0.5 ${style() === "unified" ? "bg-paper-3 text-ink" : "text-ink-3 hover:text-ink"}`}
              onClick={() => setStyle("unified")}
            >
              合并
            </button>
            <button
              class={`px-2 py-0.5 ${style() === "split" ? "bg-paper-3 text-ink" : "text-ink-3 hover:text-ink"}`}
              onClick={() => setStyle("split")}
            >
              左右
            </button>
          </div>
        </Show>
      </div>
      <div class="overflow-auto selectable" style={{ "max-height": props.maxHeight ?? "50vh" }}>
        <Show
          when={style() === "split"}
          fallback={
            <table class="w-full border-collapse">
              <tbody>
                <For each={lines()}>
                  {(l) => (
                    <Show
                      when={l.kind !== "hunk"}
                      fallback={
                        <tr class="bg-paper-3 text-ink-3">
                          <td colSpan={4} class="px-3 py-0.5">
                            {l.text}
                          </td>
                        </tr>
                      }
                    >
                      <tr class={bg(l)}>
                        <td class="w-10 text-right pr-2 text-ink-3 select-none align-top">{l.oldNo ?? ""}</td>
                        <td class="w-10 text-right pr-2 text-ink-3 select-none align-top">{l.newNo ?? ""}</td>
                        <td class="w-4 text-center text-ink-3 select-none align-top">{marker(l)}</td>
                        <td class="pr-3 whitespace-pre-wrap break-words align-top">{l.text}</td>
                      </tr>
                    </Show>
                  )}
                </For>
              </tbody>
            </table>
          }
        >
          <table class="w-full border-collapse table-fixed">
            <tbody>
              <For each={rows()}>
                {(r) => (
                  <Show
                    when={!r.hunk}
                    fallback={
                      <tr class="bg-paper-3 text-ink-3">
                        <td colSpan={4} class="px-3 py-0.5">
                          {r.hunk}
                        </td>
                      </tr>
                    }
                  >
                    <tr>
                      <td class={`w-10 text-right pr-2 text-ink-3 select-none align-top ${bg(r.left)}`}>{r.left?.oldNo ?? ""}</td>
                      <td class={`pr-3 whitespace-pre-wrap break-words align-top border-r border-line ${bg(r.left)}`}>
                        {r.left?.text ?? ""}
                      </td>
                      <td class={`w-10 text-right pr-2 text-ink-3 select-none align-top ${bg(r.right)}`}>{r.right?.newNo ?? ""}</td>
                      <td class={`pr-3 whitespace-pre-wrap break-words align-top ${bg(r.right)}`}>{r.right?.text ?? ""}</td>
                    </tr>
                  </Show>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>
    </div>
  );
}
