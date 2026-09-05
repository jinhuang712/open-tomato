import { describe, expect, test } from "bun:test";
import { CAPABILITIES, CAPABILITY_IDS } from "../src/agent/capabilities.js";

const FILLED = { topic: "主角", brief: "主角的人物卡", scope: "全书里程碑", chapter: "12", volume: "1" };

describe("能力脚本", () => {
  test("7 个 render 有参无参都能跑，不留占位符", () => {
    expect(CAPABILITY_IDS).toHaveLength(7);
    for (const id of CAPABILITY_IDS) {
      const cap = CAPABILITIES[id];
      for (const params of [{}, FILLED]) {
        const out = cap.render(params);
        expect(out).not.toMatch(/{{\w+}}/);
        expect(out.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("参数填进去了：chapter 用两次的地方两处都有", () => {
    expect(CAPABILITIES.draft.render({ chapter: "12" })).toContain("第 12 章正文");
    expect(CAPABILITIES.draft.render({ chapter: "12" })).toContain("章纲/12");
    expect(CAPABILITIES.review.render({ chapter: "3" })).toContain("正文/3");
    expect(CAPABILITIES.talk.render({ topic: "主角" })).toContain("我们先聊聊：主角");
  });
});
