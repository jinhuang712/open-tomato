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
  test("主编没问就停，补一句", () => expect(shouldNudge(lead())).toBe(true));
  test("问过作者就是合法收尾", () => expect(shouldNudge(lead({ asked: true }))).toBe(false));
  test("一次作者发言只补一次", () => expect(shouldNudge(lead({ nudged: true }))).toBe(false));
  test("暂停中不补", () => expect(shouldNudge(lead({ hold: true }))).toBe(false));
  test("出错不补", () => expect(shouldNudge(lead({ info: { agentId: "director", status: "error" } as Live["info"] }))).toBe(false));
  test("收件箱有作者的话就送作者的话，不补", () => expect(shouldNudge(lead({ inbox: [{ id: "1", label: "x", text: "y" }] }))).toBe(false));
  test("子 agent 不补", () => expect(shouldNudge(lead({ info: { agentId: "a1", status: "done" } as Live["info"] }))).toBe(false));
});
