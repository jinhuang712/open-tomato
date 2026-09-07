import { describe, expect, test } from "bun:test";
import { makeSayTool } from "../src/agent/tools/say.js";
import { repairAskArgs } from "../src/agent/tools/ask-args.js";
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
    acknowledgeReports: (ids: string[]) => { for (let i = unrelayed.length - 1; i >= 0; i--) if (ids.includes(unrelayed[i]!)) unrelayed.splice(i, 1); },
  } as unknown as ToolContext;
}

const params = { say: "铺垫", question: "选哪个？", options: ["A", "B"] };
const run = (tool: ReturnType<typeof makeAskUserTool>, id: string, args: Record<string, unknown> = params) =>
  tool.execute(id, args as never, new AbortController().signal as never, undefined as never, undefined as never);

describe("先讲清再问", () => {
  test("有待解释报告也能自然澄清，提问不清除报告", async () => {
    let asked = false;
    const pending = ["策划"];
    const tool = makeAskUserTool(ctxWith(pending, () => (asked = true)));
    await run(tool, "t1", { question: "你希望哪种阅读感受？" });
    expect(asked).toBe(true);
    expect(pending).toEqual(["策划"]);
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
  await run(tool, "direct", { ...params, explainedReports: ["策划"] });
  expect(asked).toBe(true);
});
test("无待解释报告时可以省略 say，schema 不要求该字段", async () => {
  let asked = false;
  const tool = makeAskUserTool(ctxWith([], () => (asked = true)));
  expect((tool.parameters as { required?: string[] }).required).not.toContain("say");
  await run(tool, "optional", { question: "继续？" });
  expect(asked).toBe(true);
});


test("普通非空铺垫允许提问，但不能冒充报告已解释", async () => {
  let asked = false;
  const pending = ["策划:1"];
  const tool = makeAskUserTool(ctxWith(pending, () => (asked = true)));
  await run(tool, "progress");
  expect(asked).toBe(true);
  expect(pending).toEqual(["策划:1"]);
});

test("同角色两份报告，只确认实际解释的那份；普通发言保留所有报告", async () => {
  const pending = ["策划:1", "策划:2", "编剧:3"];
  const ctx = ctxWith(pending, () => {});
  const say = makeSayTool(ctx);
  await run(say, "progress", { text: "策划回来了" });
  expect(pending).toEqual(["策划:1", "策划:2", "编剧:3"]);
  await run(say, "explain", { text: "第一份候选的内容、理由和代价", explainedReports: ["策划:1"] });
  expect(pending).toEqual(["策划:2", "编剧:3"]);
  await run(makeAskUserTool(ctx), "ask", { ...params, explainedReports: ["编剧:3"] });
  expect(pending).toEqual(["策划:2"]);
});

test("空解释或不存在的报告编号不能清除任何报告或发出问题", async () => {
  const pending = ["策划:1"];
  let asked = false;
  const ctx = ctxWith(pending, () => (asked = true));
  for (const tool of [makeSayTool(ctx), makeAskUserTool(ctx)]) {
    await expect(run(tool, "blank", { ...params, text: " ", say: " ", explainedReports: ["策划:1"] })).rejects.toThrow(/解释正文/);
    await expect(run(tool, "unknown", { ...params, text: "解释", explainedReports: ["策划:1", "不存在"] })).rejects.toThrow(/编号不存在/);
  }
  expect(pending).toEqual(["策划:1"]);
  expect(asked).toBe(false);
});

test("独立解释后可以直接提问，参数修复保留报告编号", async () => {
  const pending = ["策划:1"];
  let asked = false;
  const ctx = ctxWith(pending, () => (asked = true));
  const say = makeSayTool(ctx);
  const prepared = await say.prepareArguments!({ text: "方案与取舍", explainedReports: ["策划:1"] });
  await run(say, "say", prepared as Record<string, unknown>);
  await run(makeAskUserTool(ctx), "ask", { question: "采用哪个方向？" });
  expect(asked).toBe(true);
  expect(pending).toEqual([]);
  expect(repairAskArgs({ ...params, explainedReports: ["策划:1"] }).explainedReports).toEqual(["策划:1"]);
});
