import { describe, expect, test } from "bun:test";
import { makeAskUserTool } from "../src/agent/tools/ask-user.js";
import type { ToolContext } from "../src/agent/tools/shared.js";

/** 只装 ask_user 会碰到的两样：门和「未讲的报告」清单 */
function ctxWith(unrelayed: string[], onAsk: () => void): ToolContext {
  return {
    agentId: "director",
    gate: {
      requestQuestion: async () => {
        onAsk();
        return "A";
      },
    },
    unrelayedReports: () => unrelayed,
  } as unknown as ToolContext;
}

const params = { say: "铺垫", question: "选哪个？", options: ["A", "B"] };
const run = (tool: ReturnType<typeof makeAskUserTool>, id: string, args: Record<string, unknown> = params) =>
  tool.execute(id, args as never, new AbortController().signal as never, undefined as never, undefined as never);

describe("先讲清再问", () => {
  test("有报告还没 say 过：ask_user 打回，问题不到作者面前", async () => {
    let asked = false;
    const tool = makeAskUserTool(ctxWith(["策划"], () => (asked = true)));
    await expect(run(tool, "t1", { ...params, say: "  " })).rejects.toThrow(/策划的报告尚未向作者解释/);
    expect(asked).toBe(false);
  });

  test("没有欠着的报告：照常问", async () => {
    let asked = false;
    const tool = makeAskUserTool(ctxWith([], () => (asked = true)));
    await run(tool, "t2");
    expect(asked).toBe(true);
  });
});

test("报告可在 ask_user.say 中直接解释", async () => {
  let asked = false;
  const tool = makeAskUserTool(ctxWith(["策划"], () => (asked = true)));
  await run(tool, "direct");
  expect(asked).toBe(true);
});
test("无待解释报告时可以省略 say，schema 不要求该字段", async () => {
  let asked = false;
  const tool = makeAskUserTool(ctxWith([], () => (asked = true)));
  expect((tool.parameters as { required?: string[] }).required).not.toContain("say");
  await run(tool, "optional", { question: "继续？" });
  expect(asked).toBe(true);
});
