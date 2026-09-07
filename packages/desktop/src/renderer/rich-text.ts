import { Editor, type Extensions } from "@tiptap/core";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Link } from "@tiptap/extension-link";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { Markdown, type MarkdownMarkSpec, type MarkdownNodeSpec, type MarkdownStorage } from "tiptap-markdown";

/**
 * 卡片正文的所见即所得编辑：磁盘上仍然是 markdown，编辑时在 TipTap 里改，保存时再序列化回 markdown。
 *
 * 硬约束是「没动过的地方一个字节都不能变」：卡片是模型和作者共同写的，
 * 一次编辑把全篇 markdown 重排一遍，改动记录（marks 里的 patch）就全是噪声。
 * 所以这里的解析 / 序列化口径全部对着 renderMarkdown 那套（marked gfm + breaks）来配，
 * 并由 test/rich-text.test.ts 用真实卡片守住逐字往返。
 */

/**
 * 一个软换行就是一次换行。正文渲染是 marked breaks:true，单个 \n 已经是换行，
 * 所以解析时按 breaks 收成 hardBreak，序列化时也只写回 \n——
 * tiptap-markdown 默认写的是 `\` + 换行，那会往作者的文字里塞反斜杠。
 */
const SoftBreak = HardBreak.extend({
  addStorage(): { markdown: MarkdownNodeSpec } {
    return {
      markdown: {
        serialize(state, node, parent, index) {
          // 段末的连续换行没有意义，丢掉；中间的照原样写回
          for (let i = index + 1; i < parent.childCount; i++) {
            if (parent.child(i).type !== node.type) {
              state.write("\n");
              return;
            }
          }
        },
        parse: {},
      },
    };
  },
});

/** markdown-it 默认把链接 percent-encode，`[铁律](守则/铁律.md)` 会被改写成一串 %E5%AE；解析阶段关掉 */
const RawLink = Link.extend({
  // serialize 交给 tiptap-markdown 自带的 link 规格（按扩展名兜底合并），这里只改解析
  addStorage(): { markdown: Pick<MarkdownMarkSpec, "parse"> } {
    return {
      markdown: {
        parse: {
          setup(md) {
            md.normalizeLink = (url: string) => url;
            md.normalizeLinkText = (text: string) => text;
          },
        },
      },
    };
  },
});

export function cardExtensions(): Extensions {
  return [
    // hardBreak / link 换成上面两个改过序列化口径的
    StarterKit.configure({ hardBreak: false, link: false }),
    SoftBreak,
    RawLink,
    // 表格不在 StarterKit 里；卡片正文里出现过表格，缺了它整张表会被拍平成段落
    TableKit,
    Markdown.configure({ html: false, breaks: true, bulletListMarker: "-", tightLists: true, linkify: false }),
  ];
}

/** 挂一个卡片正文编辑器。markdown 进，markdown 出（cardMarkdown） */
export function createCardEditor(options: { element: HTMLElement; markdown: string; class: string; onSave: () => void }): Editor {
  const editor = new Editor({
    element: options.element,
    extensions: cardExtensions(),
    content: options.markdown,
    editorProps: {
      attributes: { class: options.class },
      handleKeyDown: (_view, event) => {
        // ⌘S 在编辑器里也要能存：ProseMirror 先吃到按键，不在这儿转出去就到不了外面
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "s") {
          event.preventDefault();
          options.onSave();
          return true;
        }
        return false;
      },
    },
  });
  return editor;
}

export function cardMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
}
