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
    { id: "world", label: "世界", dir: "世界", description: "", fields: [] },
    { id: "threads", label: "线索", dir: "线索", description: "", fields: [] },
    { id: "volumes", label: "卷纲", dir: "卷纲", description: "", fields: [] },
    { id: "chapters", label: "章纲", dir: "章纲", description: "", fields: [] },
    { id: "rules", label: "守则", dir: "守则", description: "", fields: [] },
    { id: "brief", label: "简介", dir: "", description: "", singleton: true, fields: [] },
  ] as never);
  setState("docs", [
    header("characters", "陈默"),
    header("world", "饭团"),
    header("threads", "复仇"),
    header("volumes", "01"),
    header("chapters", "0001"),
    header("rules", "001", "钱是粮草不是弹药"),
  ] as never);
});

/**
 * 回归：9c4a4f5 删掉裸名分支后，正文里直接写的卡名全都不成链，下划线集体消失。
 * 修法是两者都要：全名（目录/id，「/」当定界符，前后贴汉字也命中）+ 裸名回退（全项目唯一的中文卡名）。
 * 纯数字编号（卷纲 01、章纲 0001）只认全名，避免正文里随手一个数字就成链。
 */
describe("卡片引用：全名 + 唯一裸名都成链", () => {
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

  test("唯一中文卡名裸写也成链，保持原文显示", () => {
    const out = linkifyDocRefs("<p>陈默说饭团最终会被收编</p>");
    expect(out).toContain('data-doc="characters/陈默"');
    expect(out).toContain(">陈默</a>");
    expect(out).toContain('data-doc="world/饭团"');
  });

  test("裸名紧贴汉字后缀也成链（陈默卡 → 链陈默）", () => {
    const out = linkifyDocRefs("<p>把陈默卡落一下</p>");
    expect(out).toContain('data-doc="characters/陈默"');
  });

  test("纯数字编号裸写不成链（目录粘连除外），正文里的年份数字不受影响", () => {
    for (const s of ["<p>从卷01往下推</p>", "<p>阿里 2011 年 B 轮入股</p>"]) {
      expect(linkifyDocRefs(s)).toBe(s);
    }
  });

  test("守则用唯一标题引用，裸写标题也成链", () => {
    const full = linkifyDocRefs("<p>按守则/钱是粮草不是弹药办</p>");
    expect(full).toContain('data-doc="rules/001"');
    expect(full).toContain(">守则/钱是粮草不是弹药</a>");
    const bare = linkifyDocRefs("<p>按钱是粮草不是弹药办</p>");
    expect(bare).toContain('data-doc="rules/001"');
  });

  test("同名卡谁都不认", () => {
    setState("docs", [header("characters", "陈默"), header("world", "陈默")] as never);
    expect(linkifyDocRefs("<p>陈默说</p>")).toBe("<p>陈默说</p>");
    // 全名不受影响
    expect(linkifyDocRefs("<p>读人物/陈默</p>")).toContain('data-doc="characters/陈默"');
  });

  test("自己的名字在自己正文里不成链（全名和裸名都不链）", () => {
    const self = { kind: "characters", id: "陈默" } as const;
    expect(linkifyDocRefs("<p>人物/陈默的卡</p>", self)).toBe("<p>人物/陈默的卡</p>");
    expect(linkifyDocRefs("<p>陈默说</p>", self)).toBe("<p>陈默说</p>");
  });

  test("单例简介前后贴汉字时不认，避免误链「个人简介」", () => {
    expect(linkifyDocRefs("<p>简介。</p>")).toContain('data-doc="brief/简介"');
    expect(linkifyDocRefs("<p>读「简介」。</p>")).toContain('data-doc="brief/简介"');
    expect(linkifyDocRefs("<p>写一段个人简介</p>")).toBe("<p>写一段个人简介</p>");
  });

  test("parseDocRef 全名和唯一裸名都认，编号裸写不认", () => {
    expect(parseDocRef("人物/陈默")).toEqual({ kind: "characters", id: "陈默" });
    expect(parseDocRef("陈默")).toEqual({ kind: "characters", id: "陈默" });
    expect(parseDocRef("守则001")).toEqual({ kind: "rules", id: "001" });
    expect(parseDocRef("陈默卡")).toEqual({ kind: "characters", id: "陈默" });
    expect(parseDocRef("01")).toBeNull();
  });
});

describe("粘连与后缀整词成链", () => {
  test("目录+编号缺/照认：守则001、卷纲01、章纲0001", () => {
    const a = linkifyDocRefs("<p>按守则001办</p>");
    expect(a).toContain('data-doc="rules/001"');
    expect(a).toContain(">守则001</a>");
    expect(linkifyDocRefs("<p>读卷纲01往下推</p>")).toContain('data-doc="volumes/01"');
    expect(linkifyDocRefs("<p>章纲0001的钩子</p>")).toContain('data-doc="chapters/0001"');
  });

  test("目录+名字缺/照认：人物陈默", () => {
    const out = linkifyDocRefs("<p>人物陈默的弧光</p>");
    expect(out).toContain('data-doc="characters/陈默"');
    expect(out).toContain(">人物陈默</a>");
  });

  test("目录+守则标题缺/照认", () => {
    expect(linkifyDocRefs("<p>守则钱是粮草不是弹药</p>")).toContain('data-doc="rules/001"');
  });

  test("名字+后缀整词成链：陈默卡、复仇线、饭团势力卡", () => {
    const a = linkifyDocRefs("<p>把陈默卡落一下</p>");
    expect(a).toContain('data-doc="characters/陈默"');
    expect(a).toContain(">陈默卡</a>");
    expect(linkifyDocRefs("<p>复仇线收束了</p>")).toContain('data-doc="threads/复仇"');
    const b = linkifyDocRefs("<p>落盘饭团势力卡</p>");
    expect(b).toContain('data-doc="world/饭团"');
    expect(b).toContain(">饭团势力卡</a>");
  });

  test("真名优先于后缀展开", () => {
    setState("docs", [header("characters", "陈默"), header("world", "陈默卡")] as never);
    expect(linkifyDocRefs("<p>陈默卡</p>")).toContain('data-doc="world/陈默卡"');
  });

  test("目录锚不住的不链：守则意识", () => {
    expect(linkifyDocRefs("<p>守则意识要强</p>")).toBe("<p>守则意识要强</p>");
  });
});
