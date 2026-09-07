import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// TipTap 要一个 DOM 才能建编辑器。注册要发生在 tiptap 载入之前，所以这两个模块动态引
GlobalRegistrator.register();
const { Editor } = await import("@tiptap/core");
const { cardExtensions, cardMarkdown } = await import("../src/renderer/rich-text");

/** 走一遍「markdown → 编辑器 → markdown」，模拟作者进编辑模式又保存 */
function roundTrip(markdown: string): string {
  const editor = new Editor({ element: document.createElement("div"), extensions: cardExtensions(), content: markdown });
  const out = cardMarkdown(editor);
  editor.destroy();
  return out;
}

/**
 * 卡片是模型和作者一起写的：作者只改一句话，其余部分必须逐字不动，
 * 否则每次保存的 diff 和 marks 里的 patch 全是排版噪声。
 */
describe("卡片正文的所见即所得往返", () => {
  const cases: Record<string, string> = {
    "世界设定卡（段、列表、加粗、软换行）": `## 定义

血引是这个世界里唯一能把两个人的命绑在一起的手段。它不是法术，是一种**契约**：一方给血，一方给寿。

## 规则与边界

- 只在满月之夜生效
- 一个人一生只能立一次
- 立约双方必须都清醒，昏迷的人不能被代签

## 与故事的关系

沈砚在第 3 章立了血引，这决定了他后面所有的选择。
他不能反悔，也不能转让。

## 留白

血引断裂时会发生什么，前 20 章不写死。`,

    "章纲（有序列表、三级标题、引用、行内代码、表格、删除线、链接）": `## 场景

1. 破庙夜谈：沈砚第一次说出「血引」两个字
2. 山道追杀
3. 结尾钩子

### 细节

> 他说：我给你血，你给我三年。

正文里出现的道具：\`引血刀\`、断了的玉牌。

## 承接

| 线索 | 这一章推进到 |
| --- | --- |
| 血引之约 | 立约 |
| 沈家旧案 | 露出第一个名字 |

## 备注

~~原本打算让他拒绝~~ 改成他答应了。

参考 [守则/铁律](守则/铁律.md)。`,

    "正文（对白连着换行、分隔线）": `沈砚把刀横在膝上。

"你想要什么？"
"三年。"

他没有立刻回答。风从破窗里灌进来，把供桌上的灰吹起了一层。

---

第二天他就上了山。`,

    "守则（嵌套列表、连续引用块）": `## 展开

这条规则管三件事：

- 对白
  - 不写解释性对白
  - 不让人物替作者说话
- 叙述
- 情节

## 例子

作者原句：

> 他知道自己该走了。

改后：

> 他站起来，把碗底的水泼在火上。

## 边界

以下情形不算违反：

1. 人物在信里自陈
2. 回忆段落里的自述`,
  };

  for (const [name, markdown] of Object.entries(cases)) {
    test(name, () => {
      expect(roundTrip(markdown)).toBe(markdown);
    });
  }

  test("空正文进出还是空", () => {
    expect(roundTrip("")).toBe("");
  });
});
