import { describe, expect, test } from "bun:test";
import { useDom } from "./dom";

// findAnchorRange 要走 TreeWalker 和 Range，得有真 DOM
useDom();

const { findAnchorRange, findTextRange } = await import("../src/renderer/annotate");

/** 渲染好的正文：一段一个 <p>，和 markdown 出来的结构一样 */
function prose(...paragraphs: string[]): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = paragraphs.map((p) => `<p>${p}</p>`).join("");
  document.body.append(root);
  return root as unknown as HTMLElement;
}

describe("findAnchorRange", () => {
  test("一段之内的引文，整段就找得到", () => {
    const root = prose("策划1 拿着「学术 / 科研」这条去落卡了。", "编剧1 还停着，等她这张卡出来。");
    expect(findAnchorRange(root, "拿着「学术 / 科研」这条去落卡了")).not.toBe(null);
  });

  test("跨段的选区退成第一行定位：整段找不到，卡照样有位置", () => {
    const root = prose("策划1 拿着「学术 / 科研」这条去落卡了。", "有一件事我盯着：陈默不能插手她的人生。");
    // 选区里那个换行在 DOM 里不存在，所以整段永远对不上
    const whole = "策划1 拿着「学术 / 科研」这条去落卡了。\n有一件事我盯着：陈默不能插手她的人生。";
    expect(findTextRange(root, whole)).toBe(null);
    expect(findAnchorRange(root, whole)).not.toBe(null);
  });

  test("第一行太短（一个字）时不拿它去撞第一个同字，宁可没位置", () => {
    const root = prose("答 完全无关", "她这一世做什么？");
    expect(findAnchorRange(root, "答\n这一段已经被改过了")).toBe(null);
  });

  test("那段字被改掉了：整段和第一行都找不到", () => {
    const root = prose("这一版正文已经换过了。");
    expect(findAnchorRange(root, "旧的那段话\n后面还有一段")).toBe(null);
  });
});
