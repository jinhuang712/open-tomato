import { describe, expect, test } from "bun:test";
import type { QuestionKind, QuestionOption, QuestionRequest } from "@opentomato/core/protocol";
import { escapesFor } from "../src/renderer/question-escapes";

/**
 * 逃生口是作者手上的方向盘：主编把本该摆候选的问题标成 open 时，作者得能一键
 * 要回选择题，而不是像日志里那样自己打一句「给我选择题」。open 卡少了这条就红。
 */
const req = (kind: QuestionKind, options: QuestionOption[] = []): QuestionRequest => ({
  questionId: "q1",
  agentId: "director",
  text: "问题",
  kind,
  options,
  allowFreeText: true,
});

describe("open 问题卡的逃生口", () => {
  test("有一条直接把问题要成选择题", () => {
    const answers = escapesFor(req("open")).map((e) => e.answer);
    expect(answers.some((a) => a.includes("选择题") && a.includes("候选"))).toBe(true);
  });

  test("「我还没想好」照旧留着：两条前提不同，不合成一条", () => {
    const labels = escapesFor(req("open")).map((e) => e.label);
    expect(labels).toEqual(["给我选择题", "我还没想好", "先放一放"]);
  });

  test("摆了候选的问题卡不提选择题，走换一批 / 你替我定", () => {
    const labels = escapesFor(req("single", ["A", "B"])).map((e) => e.label);
    expect(labels).toEqual(["换一批", "你替我定", "先放一放"]);
  });
});
