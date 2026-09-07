import { expect, test } from "bun:test";
import { makeAskUserTool } from "../src/agent/tools/ask-user.js";
import type { ToolContext } from "../src/agent/tools/shared.js";

/** ask_user 只碰门 */
function ctxWith(onAsk: (q: { text: string; kind: string; options: unknown[] }) => void): ToolContext {
  return {
    agentId: "director",
    gate: {
      requestQuestion: async (q: { text: string; kind: string; options: unknown[] }) => {
        onAsk(q);
        return "A";
      },
    },
  } as unknown as ToolContext;
}

const run = (tool: ReturnType<typeof makeAskUserTool>, id: string, args: Record<string, unknown>) =>
  tool.execute(id, args as never, new AbortController().signal as never, undefined as never, undefined as never);

test("ask_user 只有问题与候选：解释在正文里，参数表不再有 say / explainedReports", async () => {
  let got: { text: string; kind: string; options: unknown[] } | null = null;
  const tool = makeAskUserTool(ctxWith((q) => (got = q)));
  const props = (tool.parameters as { properties: Record<string, unknown> }).properties;
  expect(Object.keys(props).sort()).toEqual(["allowFreeText", "kind", "options", "question"]);
  await run(tool, "t1", { question: "选哪个？", options: ["A", "B"] });
  expect(got).toEqual({ agentId: "director", text: "选哪个？", kind: "single", options: ["A", "B"], allowFreeText: true });
});

test("工具描述先摆候选形态、再给 open，并点名「候选写进问句」这种错法", () => {
  const d = makeAskUserTool(ctxWith(() => {})).description as string;
  // kind 表按「该用哪个」排序：single 打头，open 垫底
  expect(d.indexOf("| single |")).toBeLessThan(d.indexOf("| open |"));
  expect(d).toContain("A、B 还是 C");
  expect(d).toContain("挪进 options 走 single");
});

test("旧会话里带 say 的实参照样能问，多出来的键被忽略", async () => {
  let asked = false;
  const tool = makeAskUserTool(ctxWith(() => (asked = true)));
  const prepared = await tool.prepareArguments!({ say: "铺垫", question: "继续？", explainedReports: ["策划"] });
  const res = await run(tool, "t2", prepared as Record<string, unknown>);
  expect(asked).toBe(true);
  expect(res.content[0]!.text).toContain("say 字段已废弃");
});

test("没传 say 的正常提问，结果不带提醒", async () => {
  const tool = makeAskUserTool(ctxWith(() => {}));
  const res = await run(tool, "t3", { question: "继续？" });
  expect(res.content[0]!.text).not.toContain("已废弃");
});
