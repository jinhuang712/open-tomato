import { describe, expect, test } from "bun:test";
import { shouldNudge } from "../src/agent/kernel/lead-rules.js";

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
  test("有子 agent 在跑但把话写成了裸正文：不是等报告，是话没送出去，要补", () => expect(shouldNudge(lead({ leaked: true }), true)).toBe(true));
  test("裸正文之后已经 say 过了，不补", () => expect(shouldNudge(lead({ leaked: true, spoke: true }), true)).toBe(false));
  test("裸正文之后已经 ask_user 了，不补", () => expect(shouldNudge(lead({ leaked: true, asked: true }), true)).toBe(false));
  test("子 agent 不补", () => expect(shouldNudge(lead({ info: { agentId: "a1", status: "done" } as Live["info"] }))).toBe(false));
});

test("已回应作者可以自然结束", () => expect(shouldNudge(lead({ spoke: true }))).toBe(false));
