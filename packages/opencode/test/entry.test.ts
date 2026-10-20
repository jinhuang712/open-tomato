import { describe, expect, test } from "bun:test";
import type { Plugin } from "@opencode/plugin";
import type { CommandInvocation } from "@opencode/plugin/promise/command";
import type { ProjectStore } from "@opentomato/core/headless";
import { ENTRY, entryCommand } from "../src/entry.ts";

const run = async (text: string) => {
  const calls: { op: string; input: Record<string, unknown> }[] = [];
  const session = {
    switchAgent: async (input: Record<string, unknown>) =>
      void calls.push({ op: "switchAgent", input }),
    prompt: async (input: Record<string, unknown>) => void calls.push({ op: "prompt", input }),
  } as unknown as Plugin.Context["session"];
  let opened = 0;
  const command = entryCommand(session, async () => {
    opened++;
    return {} as ProjectStore;
  });
  await command.execute({
    sessionID: "ses_1",
    prompt: { text },
    delivery: "steer",
  } as unknown as CommandInvocation);
  return { command, calls, opened };
};

describe("/open-tomato", () => {
  test("先打开这本书，再把会话交给主编", async () => {
    const { command, calls, opened } = await run("");
    expect(command.name).toBe(ENTRY);
    expect(opened).toBe(1);
    expect(calls[0]).toEqual({ op: "switchAgent", input: { sessionID: "ses_1", agent: "主编" } });
  });

  test("只敲命令：告诉主编作者进来了，不替它安排做什么", async () => {
    const { calls } = await run("  ");
    expect(calls[1]?.input.text).toBe("作者用 /open-tomato 打开了这本书，还没说别的。");
  });

  test("命令后面跟着话：原话转给主编", async () => {
    const { calls } = await run("我想写一个退役刑警找妹妹的故事");
    expect(calls[1]?.input).toMatchObject({
      sessionID: "ses_1",
      text: "我想写一个退役刑警找妹妹的故事",
      delivery: "steer",
    });
  });
});
