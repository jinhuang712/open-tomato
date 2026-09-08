import { beforeEach, describe, expect, test } from "bun:test";
import type { DocHeader } from "@opentomato/core/protocol";

// doclink 经 state 读盘面，state 又在载入时取 window.bridge：先打个最小的桩再动态引。
// linkify 本身是纯字符串处理，不需要真 DOM，所以不用 Happy-DOM（也避免和 rich-text 测试抢全局注册）。
(globalThis as unknown as { window: unknown }).window = {
  bridge: {
    request: async () => {
      throw new Error("测试里不调桥");
    },
  },
};

const { linkifyDocRefs, parseDocRef } = await import("../src/renderer/doclink");
const { setState } = await import("../src/renderer/state");

const header = (kind: DocHeader["kind"], id: string, title?: string): DocHeader => ({
  kind,
  id,
  path: `${kind}/${id}.md`,
  title: title ?? id,
  summary: "",
  keywords: [],
  status: "draft",
  extra: {},
});

beforeEach(() => {
  setState("kinds", [
    { id: "characters", label: "人物", dir: "人物", description: "", fields: [] },
    { id: "volumes", label: "卷纲", dir: "卷纲", description: "", fields: [] },
    { id: "chapters", label: "章纲", dir: "章纲", description: "", fields: [] },
    { id: "rules", label: "守则", dir: "守则", description: "", fields: [] },
    { id: "brief", label: "简介", dir: "", description: "", singleton: true, fields: [] },
  ] as never);
  setState("docs", [
    header("characters", "陈默"),
    header("volumes", "01"),
    header("chapters", "0001"),
    header("rules", "001", "钱是粮草不是弹药"),
  ] as never);
});

/**
 * 卡片引用只认全名「目录/名字」：中文里没有词边界，裸名会把「陈默卡」切成两截、
 * 把「卷纲01」切成「卷纲」+「01」，下划线看起来时有时无。
 * 「/」本身就是定界符，全名前后贴着汉字也必须命中。
 */
describe("卡片引用只认全名", () => {
  test("全名前后紧贴汉字也成链", () => {
    expect(linkifyDocRefs("<p>读人物/陈默的卡</p>")).toContain('data-doc="characters/陈默"');
    expect(linkifyDocRefs("<p>从卷纲/01往下推</p>")).toContain('data-doc="volumes/01"');
    expect(linkifyDocRefs("<p>读章纲/0001和人物/陈默</p>")).toContain('data-doc="chapters/0001"');
  });

  test("全名前后有空格或标点也成链，显示的是全名", () => {
    const out = linkifyDocRefs("<p>读文档 卷纲/01。</p>");
    expect(out).toContain('data-doc="volumes/01"');
    expect(out).toContain(">卷纲/01</a>");
  });

  test("裸写卡名不成链", () => {
    for (const s of ["<p>陈默说</p>", "<p>陈默卡</p>", "<p>读卷纲01和章纲0001</p>", "<p>从卷01往下推</p>"]) {
      expect(linkifyDocRefs(s)).toBe(s);
    }
  });

  test("守则用唯一标题引用，显示标题", () => {
    const out = linkifyDocRefs("<p>按守则/钱是粮草不是弹药办</p>");
    expect(out).toContain('data-doc="rules/001"');
    expect(out).toContain(">守则/钱是粮草不是弹药</a>");
  });

  test("自己的全名在自己正文里不成链", () => {
    const s = "<p>人物/陈默的卡</p>";
    expect(linkifyDocRefs(s, { kind: "characters", id: "陈默" })).toBe(s);
  });

  test("单例简介前后贴汉字时不认，避免误链「个人简介」", () => {
    expect(linkifyDocRefs("<p>简介。</p>")).toContain('data-doc="brief/简介"');
    expect(linkifyDocRefs("<p>读「简介」。</p>")).toContain('data-doc="brief/简介"');
    expect(linkifyDocRefs("<p>写一段个人简介</p>")).toBe("<p>写一段个人简介</p>");
  });

  test("parseDocRef 只认全名", () => {
    expect(parseDocRef("人物/陈默")).toEqual({ kind: "characters", id: "陈默" });
    expect(parseDocRef("陈默")).toBeNull();
  });
});
