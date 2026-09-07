import { describe, expect, test } from "bun:test";
import { DANGLING_QUESTION_PROMPT, endsWithQuestion, NUDGE_PROMPT, nudgePrompt, shouldNudge } from "../src/agent/kernel/lead-rules.js";

type Live = Parameters<typeof shouldNudge>[0];
const lead = (over: Partial<Live> = {}): Live => ({
  info: { agentId: "director", status: "idle" } as Live["info"],
  asked: false,
  nudged: false,
  hold: false,
  inbox: [],
  ...over,
});

describe("shouldNudge", () => {
  test("主编没有可见回应就停，补一句", () => expect(shouldNudge(lead())).toBe(true));
  test("问过作者就是合法收尾", () => expect(shouldNudge(lead({ asked: true }))).toBe(false));
  test("一次作者发言只补一次", () => expect(shouldNudge(lead({ nudged: true }))).toBe(false));
  test("暂停中不补", () => expect(shouldNudge(lead({ hold: true }))).toBe(false));
  test("出错不补", () => expect(shouldNudge(lead({ info: { agentId: "director", status: "error" } as Live["info"] }))).toBe(false));
  test("收件箱有作者的话就送作者的话，不补", () => expect(shouldNudge(lead({ inbox: [{ id: "1", label: "x", text: "y" }] }))).toBe(false));
  test("有子 agent 在跑：停下等报告是合法的，不补", () => expect(shouldNudge(lead(), true)).toBe(false));
  test("写了正文就是说过话了，不补", () => expect(shouldNudge(lead({ spoke: true }))).toBe(false));
  test("子 agent 不补", () => expect(shouldNudge(lead({ info: { agentId: "a1", status: "done" } as Live["info"] }))).toBe(false));
});

test("已回应作者可以自然结束", () => expect(shouldNudge(lead({ spoke: true }))).toBe(false));

describe("正文结尾是问句却没调 ask_user", () => {
  test("补一句，让它把问题问出来", () => expect(shouldNudge(lead({ spoke: true, tail: "这三个画面你的直觉分别是哪个？" }))).toBe(true));
  test("半角问号一样算", () => expect(shouldNudge(lead({ spoke: true, tail: "which one?" }))).toBe(true));
  test("问号后跟收尾符号、换行也算", () => expect(shouldNudge(lead({ spoke: true, tail: "**这个推测对不对？**\n\n" }))).toBe(true));
  test("问了 ask_user 就不补", () => expect(shouldNudge(lead({ spoke: true, asked: true, tail: "对不对？" }))).toBe(false));
  test("结尾是陈述句不补", () => expect(shouldNudge(lead({ spoke: true, tail: "问题不大？我觉得可以。" }))).toBe(false));
  test("补过一次就不再补", () => expect(shouldNudge(lead({ spoke: true, nudged: true, tail: "对不对？" }))).toBe(false));
  test("用问题卡那句提示", () => {
    expect(nudgePrompt({ spoke: true })).toBe(DANGLING_QUESTION_PROMPT);
    expect(nudgePrompt({ spoke: false })).toBe(NUDGE_PROMPT);
  });
});

describe("endsWithQuestion", () => {
  test("空的不算", () => expect(endsWithQuestion(undefined)).toBe(false));
  test("问号在句中不算", () => expect(endsWithQuestion("是吗？我看不是")).toBe(false));
  test("引号包着的问句算", () => expect(endsWithQuestion("他会问「我们算什么？」")).toBe(true));
});
