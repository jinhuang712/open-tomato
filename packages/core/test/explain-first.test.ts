import { describe, expect, test } from "bun:test";
import { EXPLAIN_FIRST_MESSAGE, askBlockReason } from "../src/agent/kernel/lead-rules.js";

type Live = Parameters<typeof askBlockReason>[0];
const lead = (over: Partial<Live> = {}): Live => ({
  info: { agentId: "director", status: "running" } as Live["info"],
  unexplained: false,
  ...over,
});

describe("askBlockReason：子 agent 结论回来后先解释再问", () => {
  test("平时能问", () => expect(askBlockReason(lead())).toBeNull());
  test("子 agent 结论刚回来、一个字没说就问，打回", () => expect(askBlockReason(lead({ unexplained: true }))).toBe(EXPLAIN_FIRST_MESSAGE));
  test("子 agent 没有 ask_user，不受影响", () =>
    expect(askBlockReason(lead({ info: { agentId: "a1", status: "running" } as Live["info"], unexplained: true }))).toBeNull());
});
