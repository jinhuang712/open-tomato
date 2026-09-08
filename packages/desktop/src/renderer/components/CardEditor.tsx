import { parseFrontmatter, patchFrontmatter, replaceBody } from "@opentomato/core/frontmatter";
import type { DocFieldInfo, DocKindId } from "@opentomato/core/protocol";
import type { Editor } from "@tiptap/core";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { autoGrow } from "../autogrow";
import { FIELD_LABEL, FIELD_VIEWS, headFieldText, headFieldValue, headKeysOf } from "../doc-fields";
import { cardMarkdown, createCardEditor } from "../rich-text";
import { state } from "../state";
import { MetaChips, plainChips } from "./TrackChanges";

/** 编辑器交给宿主的把手：宿主自己决定什么时候取内容、怎么落盘 */
export interface CardEditorHandle {
  /** 当前内容拼回完整 raw：没碰过的 frontmatter 字段连原有写法一起留着，diff 里只出现真改动 */
  raw: () => string;
  /** 标题空着：这张卡在侧栏里就没身份了，存下去等于把卡弄丢。宿主存之前自己拦 */
  titleEmpty: () => boolean;
}

/**
 * 一张卡的编辑器：头部 + 正文富文本。翻卡片时按 ⌘E 用它，审阅时按 ⌘E 自行批改也用它，
 * 两处看到的是同一个编辑器、同一套字段规则。
 *
 * head 决定头部长什么样。这不是审美偏好，是「进编辑态时页面不该跳」：
 * - form（翻卡片）：底下是那张卡的阅读页，头部本来就摊着全部字段，编辑态出完整表单
 * - brief（审阅）：底下是 Word 式审阅视图，头部是标题 + 摘要 + 一排芯片。编辑态照这个样子来，
 *   标题摘要原地可改，其余字段维持芯片不可改——它们改了本来也不过审批门（见 docs/设计思想.md），
 *   放行完在卡上改就是了，不值得让审阅的页面在按下 ⌘E 那一瞬变成另一个东西。
 *
 * props.raw 只在挂载那一刻当初值读一次，之后编辑器自己是状态源；
 * 宿主中途换 raw（比如落盘撞上 stale、基准换成磁盘最新版）不会重置作者正在写的东西，
 * 只影响 raw() 拼回去时那份没被碰过的底稿。
 */
export function CardEditor(props: {
  kind: DocKindId;
  raw: string;
  onChange: () => void;
  onReady: (h: CardEditorHandle) => void;
  head?: "form" | "brief";
  /** 正文排版；不给就按类型走默认。宿主的阅读态是什么排版就传什么，进编辑态字号行距不该跳 */
  proseClass?: string;
  /**
   * 挂载时把光标放到文首。翻卡片进编辑是「我要写」，该放；
   * 审阅里自行批改是「我要修某一处」，作者正看着中间某段，光标窜到文首反而
   * 让第一次敲键盘把页面拽走——那边不放，等作者点在他要改的地方。
   */
  autofocus?: boolean;
}) {
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
  const proseClass = props.proseClass ?? `prose-zh ${props.kind === "manuscript" ? "font-serif text-lg leading-8" : ""}`;
  return (
    <>
      <Show
        when={props.head === "brief"}
        fallback={<DocHeadEditor kind={props.kind} fields={fields()} keys={keys} text={headText()} onChange={editHead} />}
      >
        <BriefHead fm={headBase} text={headText()} onChange={editHead} />
      </Show>
      <CardBody markdown={parsed.body} proseClass={proseClass} autofocus={props.autofocus !== false} onChange={props.onChange} onEditor={(e) => (editor = e)} />
    </>
  );
}

/**
 * 审阅里的头部：和 TrackChanges 的头部同一个版式（标题 / 摘要 / 一排芯片），
 * 只是标题和摘要就地可改。芯片走同一个组件，不会哪天一边改了样式另一边没跟上。
 */
function BriefHead(props: { fm: Record<string, unknown>; text: Record<string, string>; onChange: (name: string, text: string) => void }) {
  const line = "w-full bg-transparent outline-none border-b border-transparent focus:border-line-2 hover:border-line";
  return (
    <div class="mb-5">
      <input
        class={`font-serif text-xl mb-1 ${line}`}
        placeholder="标题"
        value={props.text.title ?? ""}
        onInput={(e) => props.onChange("title", e.currentTarget.value)}
      />
      <textarea
        class={`text-ink-2 mb-1 resize-none ${line}`}
        placeholder="一句话摘要"
        rows={1}
        value={props.text.summary ?? ""}
        ref={(el) => onMount(() => autoGrow(el))}
        onInput={(e) => {
          autoGrow(e.currentTarget);
          props.onChange("summary", e.currentTarget.value);
        }}
      />
      <MetaChips chips={plainChips(props.fm)} />
    </div>
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
function CardBody(props: { markdown: string; proseClass: string; autofocus: boolean; onChange: () => void; onEditor: (editor: Editor | undefined) => void }) {
  let host!: HTMLDivElement;
  onMount(() => {
    const editor = createCardEditor({ element: host, markdown: props.markdown, class: props.proseClass, onChange: props.onChange });
    props.onEditor(editor);
    if (props.autofocus) editor.commands.focus("start", { scrollIntoView: false });
    onCleanup(() => {
      props.onEditor(undefined);
      editor.destroy();
    });
  });
  return <div class="card-editor" ref={host} />;
}
