import { parseFrontmatter, patchFrontmatter, replaceBody } from "@opentomato/core/frontmatter";
import type { DocFieldInfo, DocKindId } from "@opentomato/core/protocol";
import type { Editor } from "@tiptap/core";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { autoGrow } from "../autogrow";
import { FIELD_LABEL, FIELD_VIEWS, headFieldText, headFieldValue, headKeysOf } from "../doc-fields";
import { cardMarkdown, createCardEditor } from "../rich-text";
import { state } from "../state";

/** 编辑器交给宿主的把手：宿主自己决定什么时候取内容、怎么落盘 */
export interface CardEditorHandle {
  /** 当前内容拼回完整 raw：没碰过的 frontmatter 字段连原有写法一起留着，diff 里只出现真改动 */
  raw: () => string;
  /** 标题空着：这张卡在侧栏里就没身份了，存下去等于把卡弄丢。宿主存之前自己拦 */
  titleEmpty: () => boolean;
}

/**
 * 一张卡的编辑器：头部字段表单 + 正文富文本。翻卡片时按 ⌘E 用它，审阅时按 ⌘E 自行批改也用它，
 * 两处看到的是同一个编辑器、同一套字段规则。
 *
 * props.raw 只在挂载那一刻当初值读一次，之后编辑器自己是状态源；
 * 宿主中途换 raw（比如落盘撞上 stale、基准换成磁盘最新版）不会重置作者正在写的东西，
 * 只影响 raw() 拼回去时那份没被碰过的底稿。
 */
export function CardEditor(props: { kind: DocKindId; raw: string; onChange: () => void; onReady: (h: CardEditorHandle) => void }) {
  const fields = (): DocFieldInfo[] => state.kinds.find((k) => k.id === props.kind)?.fields ?? [];
  const parsed = parseFrontmatter(props.raw);
  const headBase = parsed.frontmatter;
  const keys = headKeysOf(fields(), headBase);
  const [headText, setHeadText] = createSignal<Record<string, string>>(Object.fromEntries(keys.map((k) => [k, headFieldText(headBase[k])])));
  let editor: Editor | undefined;

  const editHead = (name: string, text: string) => {
    setHeadText({ ...headText(), [name]: text });
    props.onChange();
  };
  /** 只把真的改了的字段交出去 */
  const headPatch = (): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    for (const [name, text] of Object.entries(headText())) {
      const next = headFieldValue(text, fields().find((f) => f.name === name), headBase[name]);
      if (JSON.stringify(next ?? null) !== JSON.stringify(headBase[name] ?? null)) patch[name] = next;
    }
    return patch;
  };

  props.onReady({
    raw: () => replaceBody(patchFrontmatter(props.raw, headPatch()), editor ? cardMarkdown(editor) : parsed.body),
    titleEmpty: () => "title" in headText() && headText().title?.trim() === "",
  });

  /** 预览和编辑用同一套正文排版：进编辑模式时字号行距不该跳 */
  const proseClass = `prose-zh ${props.kind === "manuscript" ? "font-serif text-lg leading-8" : ""}`;
  return (
    <>
      <DocHeadEditor kind={props.kind} fields={fields()} keys={keys} text={headText()} onChange={editHead} />
      <CardBody markdown={parsed.body} proseClass={proseClass} onChange={props.onChange} onEditor={(e) => (editor = e)} />
    </>
  );
}

/**
 * 编辑模式下的卡片头部：标题、摘要就地改，其余 frontmatter 字段一行一个。
 * 有取值范围的出下拉，列表用「、」拼一行，字段说明按 schema 里的 comment 走。
 */
function DocHeadEditor(props: { kind: DocKindId; fields: DocFieldInfo[]; keys: string[]; text: Record<string, string>; onChange: (name: string, text: string) => void }) {
  const spec = (name: string) => props.fields.find((f) => f.name === name);
  const rows = () => props.keys.filter((k) => k !== "title" && k !== "summary");
  const hint = (name: string) => {
    const s = spec(name);
    return s?.comment ?? (s?.list ? "多个用、分开" : "");
  };
  const line = "w-full bg-transparent outline-none border-b border-transparent focus:border-line-2 hover:border-line";
  return (
    <div class="mb-6">
      <input
        class={`font-serif text-2xl mb-3 ${line}`}
        placeholder="标题"
        value={props.text.title ?? ""}
        onInput={(e) => props.onChange("title", e.currentTarget.value)}
      />
      <textarea
        class={`text-lg leading-8 mb-4 text-ink resize-none ${line}`}
        placeholder="一句话摘要"
        rows={1}
        value={props.text.summary ?? ""}
        ref={(el) => onMount(() => autoGrow(el))}
        onInput={(e) => {
          autoGrow(e.currentTarget);
          props.onChange("summary", e.currentTarget.value);
        }}
      />
      <div class="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-xs items-baseline">
        <For each={rows()}>
          {(name) => (
            <>
              <label class="text-ink-3 justify-self-end pt-0.5" title={name}>
                {FIELD_LABEL[name] ?? name}
                <Show when={spec(name)?.required}>
                  <span class="text-warn ml-0.5">*</span>
                </Show>
              </label>
              <Show
                when={spec(name)?.options}
                fallback={
                  <Show
                    when={(FIELD_VIEWS[props.kind] ?? {})[name]?.quote}
                    fallback={<input class={line} placeholder={hint(name)} value={props.text[name] ?? ""} onInput={(e) => props.onChange(name, e.currentTarget.value)} />}
                  >
                    <textarea
                      class={`leading-6 resize-none ${line}`}
                      placeholder={hint(name)}
                      rows={1}
                      value={props.text[name] ?? ""}
                      ref={(el) => onMount(() => autoGrow(el))}
                      onInput={(e) => {
                        autoGrow(e.currentTarget);
                        props.onChange(name, e.currentTarget.value);
                      }}
                    />
                  </Show>
                }
              >
                {(opts) => (
                  <select class={`${line} cursor-pointer`} value={props.text[name] ?? ""} onChange={(e) => props.onChange(name, e.currentTarget.value)}>
                    <option value="">（未填）</option>
                    <For each={opts()}>{(o) => <option value={o}>{o}</option>}</For>
                  </select>
                )}
              </Show>
            </>
          )}
        </For>
      </div>
    </div>
  );
}

/** 卡片正文的编辑区：TipTap 挂在这个 div 上，随编辑模式挂载 / 销毁 */
function CardBody(props: { markdown: string; proseClass: string; onChange: () => void; onEditor: (editor: Editor | undefined) => void }) {
  let host!: HTMLDivElement;
  onMount(() => {
    const editor = createCardEditor({ element: host, markdown: props.markdown, class: props.proseClass, onChange: props.onChange });
    props.onEditor(editor);
    editor.commands.focus("start", { scrollIntoView: false });
    onCleanup(() => {
      props.onEditor(undefined);
      editor.destroy();
    });
  });
  return <div class="card-editor" ref={host} />;
}
