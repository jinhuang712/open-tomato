import { describe, expect, test } from "bun:test";
import {
  DANGLING_QUESTION_PROMPT,
  endsWithQuestion,
  IDLE_LIMIT,
  NEXT_PROMPT,
  NUDGE_PROMPT,
  nudgePrompt,
  shouldNudge,
  wasIdle,
} from "../src/agent/kernel/lead-rules.js";

type Live = Parameters<typeof shouldNudge>[0];
const lead = (over: Partial<Live> = {}): Live => ({
  info: { agentId: "director", status: "idle" } as Live["info"],
  asked: false,
  idleRounds: 0,
  hold: false,
  inbox: [],
  ...over,
});

describe("shouldNudge：循环不停，刹车在作者手上", () => {
  test("说完一轮就接着叫它取下一件", () => expect(shouldNudge(lead({ spoke: true, acted: true }))).toBe(true));
  test("问过作者也接着叫：ask_user 是 await 的，轮末为真说明作者已经答了", () =>
    expect(shouldNudge(lead({ spoke: true, asked: true }))).toBe(true));
  test("一个字没说也接着叫", () => expect(shouldNudge(lead())).toBe(true));

  test("作者按了暂停：这才是真停", () => expect(shouldNudge(lead({ hold: true }))).toBe(false));
  test("出错不叫", () => expect(shouldNudge(lead({ info: { agentId: "director", status: "error" } as Live["info"] }))).toBe(false));
  test("有子 agent 在跑：停下等报告是合法的，报告到了会自己叫醒它", () => expect(shouldNudge(lead(), true)).toBe(false));
  test("收件箱有作者的话就送作者的话，不补", () => expect(shouldNudge(lead({ inbox: [{ id: "1", label: "x", text: "y" }] }))).toBe(false));
  test("子 agent 不叫", () => expect(shouldNudge(lead({ info: { agentId: "a1", status: "done" } as Live["info"] }))).toBe(false));

  test("连续空转到上限就不再叫", () => expect(shouldNudge(lead({ idleRounds: IDLE_LIMIT }))).toBe(false));
  test("上限之内照样叫", () => expect(shouldNudge(lead({ idleRounds: IDLE_LIMIT - 1 }))).toBe(true));
});

describe("wasIdle：这一轮算不算空转", () => {
  test("既没说话也没动手才算", () => expect(wasIdle({})).toBe(true));
  test("说了话不算", () => expect(wasIdle({ spoke: true })).toBe(false));
  test("动了手不算：读盘面、派人也是活", () => expect(wasIdle({ acted: true })).toBe(false));
});

describe("nudgePrompt：补哪一句", () => {
  const at = (over: Partial<Parameters<typeof nudgePrompt>[0]> = {}) => nudgePrompt({ asked: false, ...over });

  test("说完了正常收尾：接着取下一件", () => expect(at({ spoke: true, acted: true })).toBe(NEXT_PROMPT));
  test("一个字没说也没动手：提醒它回应作者", () => expect(at()).toBe(NUDGE_PROMPT));
  test("正文结尾是问句却没调 ask_user：先把问题问出来", () => expect(at({ spoke: true, tail: "这三个画面你的直觉是哪个？" })).toBe(DANGLING_QUESTION_PROMPT));
  test("半角问号一样算", () => expect(at({ spoke: true, tail: "which one?" })).toBe(DANGLING_QUESTION_PROMPT));
  test("问号后跟收尾符号、换行也算", () => expect(at({ spoke: true, tail: "**这个推测对不对？**\n\n" })).toBe(DANGLING_QUESTION_PROMPT));
  test("问过 ask_user 就不算悬空，接着取下一件", () => expect(at({ spoke: true, asked: true, tail: "对不对？" })).toBe(NEXT_PROMPT));
  test("结尾是陈述句：接着取下一件", () => expect(at({ spoke: true, tail: "问题不大？我觉得可以。" })).toBe(NEXT_PROMPT));
});

describe("endsWithQuestion", () => {
  test("空的不算", () => expect(endsWithQuestion(undefined)).toBe(false));
  test("问号在句中不算", () => expect(endsWithQuestion("是吗？我看不是")).toBe(false));
  test("引号包着的问句算", () => expect(endsWithQuestion("他会问「我们算什么？」")).toBe(true));
});
