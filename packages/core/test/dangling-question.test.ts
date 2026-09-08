import { describe, expect, test } from "bun:test";
import { endsWithQuestion, extractDanglingQuestion, hasDanglingQuestion } from "../src/agent/kernel/lead-rules.js";

type Live = Parameters<typeof hasDanglingQuestion>[0];

const lead = (over: Partial<Live> = {}): Live => ({
  info: { agentId: "director", status: "idle" } as Live["info"],
  asked: false,
  spoke: true,
  tail: "这三个画面你的直觉是哪个？",
  hold: false,
  inbox: [],
  ...over,
});

describe("轮末只管一件事：问了却没把问题问出来", () => {
  test("正文结尾是问句、又没调 ask_user：作者面前没有问题卡，补一次", () => expect(hasDanglingQuestion(lead())).toBe(true));
  test("问过 ask_user 就不算悬空：问题卡已经在作者面前了", () => expect(hasDanglingQuestion(lead({ asked: true }))).toBe(false));
  test("结尾是陈述句：说完就是说完了，不补", () => expect(hasDanglingQuestion(lead({ tail: "问题不大？我觉得可以。" }))).toBe(false));
  test("一个字没说：没有悬空的问句可言", () => expect(hasDanglingQuestion(lead({ spoke: false, tail: "" }))).toBe(false));

  test("作者按了暂停：他要的就是停", () => expect(hasDanglingQuestion(lead({ hold: true }))).toBe(false));
  test("这轮报错：先让错报出去", () => expect(hasDanglingQuestion(lead({ info: { agentId: "director", status: "error" } as Live["info"] }))).toBe(false));
  test("有子 agent 在跑：报告到了会把它叫起来", () => expect(hasDanglingQuestion(lead(), true)).toBe(false));
  test("收件箱有作者的话：送作者的话，不用补", () => expect(hasDanglingQuestion(lead({ inbox: [{ id: "1", label: "x", text: "y" }] }))).toBe(false));
  test("子 agent 不管：这条规矩只对主编", () => expect(hasDanglingQuestion(lead({ info: { agentId: "a1", status: "done" } as Live["info"] }))).toBe(false));
});

describe("循环不再由内核推", () => {
  test("说完一轮正常收尾：内核不补任何东西，做完一件接着取下一件是主编自己的判断", () =>
    expect(hasDanglingQuestion(lead({ tail: "这一批卡已经落盘。" }))).toBe(false));
  test("空转一轮也不补：不拿油门盖住它判断上的缺口", () =>
    expect(hasDanglingQuestion(lead({ spoke: false, tail: "" }))).toBe(false));
});

describe("endsWithQuestion", () => {
  test("空的不算", () => expect(endsWithQuestion(undefined)).toBe(false));
  test("问号在句中不算", () => expect(endsWithQuestion("是吗？我看不是")).toBe(false));
  test("引号包着的问句算", () => expect(endsWithQuestion("他会问「我们算什么？」")).toBe(true));
  test("半角问号一样算", () => expect(endsWithQuestion("which one?")).toBe(true));
  test("问号后跟收尾符号、换行也算", () => expect(endsWithQuestion("**这个推测对不对？**\n\n")).toBe(true));
});

describe("extractDanglingQuestion", () => {
  test("尾句原样取出", () => expect(extractDanglingQuestion("这三个方向你挑哪个？")).toBe("这三个方向你挑哪个？"));
  test("蹭掉问号后面的收尾符号", () => expect(extractDanglingQuestion("这个方向对吗？」")).toBe("这个方向对吗？"));
  test("半角问号一样留", () => expect(extractDanglingQuestion("which one?**")).toBe("which one?"));
  test("空的不算", () => expect(extractDanglingQuestion(undefined)).toBe(""));
});
