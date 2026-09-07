import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { orphanedQuestion } from "../src/agent/kernel/history.js";
import { Kernel } from "../src/agent/runtime.js";
import type { KernelEvent } from "../src/protocol.js";
import { fakeSessionFactory } from "./fake-session.js";

const askCall = (id: string, args: unknown) => ({ role: "assistant", content: [{ type: "toolCall", id, name: "ask_user", arguments: args }], stopReason: "toolUse" });
const result = (id: string, text: string, isError = false) => ({ role: "toolResult", toolCallId: id, toolName: "ask_user", isError, content: [{ type: "text", text }] });
const ARGS = { say: "两条路", question: "先抠样板还是先铺人？", kind: "single", options: ["样板", "铺人"] };

describe("orphanedQuestion", () => {
  test("ask_user 的回音是「会话已重建」：问题悬着", () => {
    expect(orphanedQuestion([askCall("c1", ARGS), result("c1", "会话已重建", true), { role: "assistant", content: [], stopReason: "error", errorMessage: "This operation was aborted" }])).toEqual(ARGS);
  });
  test("ask_user 压根没有回音：问题悬着", () => {
    expect(orphanedQuestion([askCall("c1", ARGS)])).toEqual(ARGS);
  });
  test("作者答过了：不算", () => {
    expect(orphanedQuestion([askCall("c1", ARGS), result("c1", "作者回答：样板")])).toBeNull();
  });
  test("作者后来又开口了：交给作者的话，不重问", () => {
    expect(orphanedQuestion([askCall("c1", ARGS), result("c1", "会话已重建", true), { role: "user", content: "⟦stub:接着上次⟧\n上次会话被打断了" }])).toBeNull();
  });
  test("最后卡住的是别的工具：不是提问，不管", () => {
    expect(orphanedQuestion([{ role: "assistant", content: [{ type: "toolCall", id: "c2", name: "read_doc", arguments: {} }] }])).toBeNull();
  });
  test("实参是没解析的 JSON 字串也能认", () => {
    expect(orphanedQuestion([askCall("c1", JSON.stringify(ARGS))])).toEqual(ARGS);
  });
});

describe("接着开项目时悬着的提问挂回门上", () => {
  let home: string;
  let root: string;
  let kernel: Kernel | null = null;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "ot-rq-home-"));
    root = await fs.mkdtemp(path.join(os.tmpdir(), "ot-rq-proj-"));
    await fs.rm(root, { recursive: true, force: true });
    const k = new Kernel(home, () => {}, { sessionFactory: fakeSessionFactory().factory });
    await k.init("test");
    await k.handle("project.create", { root, name: "测试书" });
    await k.dispose();
  });

  afterEach(async () => {
    await kernel?.dispose().catch(() => {});
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(root, { recursive: true, force: true });
  });

  test("问题原样弹回；作者答了就当一条新话送给主编，不经过模型重问", async () => {
    const events: KernelEvent[] = [];
    const prompts: string[] = [];
    const { factory } = fakeSessionFactory({ messages: [askCall("c1", ARGS), result("c1", "会话已重建", true)], onPrompt: (t) => prompts.push(t) });
    kernel = new Kernel(home, (e) => events.push(e), { sessionFactory: factory });
    await kernel.init("test");
    await kernel.handle("project.open", { root });

    const asked = events.find((e) => e.type === "question.requested") as Extract<KernelEvent, { type: "question.requested" }> | undefined;
    expect(asked?.request).toMatchObject({ agentId: "director", text: ARGS.question, kind: "single", options: ARGS.options });
    // 挂回门上之后不能再有把它撤掉的状态事件
    const idx = events.indexOf(asked!);
    expect(events.slice(idx).some((e) => e.type === "agent.status" && e.agentId === "director" && e.status !== "running")).toBe(false);

    await kernel.handle("question.reply", { questionId: asked!.request.questionId, answer: "样板" });
    expect(prompts).toEqual(["作者回答：样板"]);
    expect(events.some((e) => e.type === "question.resolved" && e.questionId === asked!.request.questionId)).toBe(true);
  });

  test("问题挂着时点「接着上次」不送话：主编不会把同一个问题再问一遍；答完之后再点才送", async () => {
    const events: KernelEvent[] = [];
    const prompts: string[] = [];
    const { factory } = fakeSessionFactory({ messages: [askCall("c1", ARGS), result("c1", "会话已重建", true)], onPrompt: (t) => prompts.push(t) });
    kernel = new Kernel(home, (e) => events.push(e), { sessionFactory: factory });
    await kernel.init("test");
    await kernel.handle("project.open", { root });

    // 回放的历史不标「没收尾」：界面不该给出「接着上次」
    const history = events.find((e) => e.type === "agent.event" && e.agentId === "director" && e.event.type === "history") as Extract<KernelEvent, { type: "agent.event" }> | undefined;
    expect(history?.event).toMatchObject({ type: "history", interrupted: false });

    await kernel.handle("chat.resume", {});
    expect(prompts).toEqual([]);

    const asked = events.find((e) => e.type === "question.requested") as Extract<KernelEvent, { type: "question.requested" }>;
    await kernel.handle("question.reply", { questionId: asked.request.questionId, answer: "铺人" });
    await kernel.handle("chat.resume", {});
    expect(prompts.length).toBe(2);
    expect(prompts[0]).toBe("作者回答：铺人");
    expect(prompts[1]).toContain("⟦stub:接着上次⟧");
  });

  test("上次收尾干净：不弹问题", async () => {
    const events: KernelEvent[] = [];
    const { factory } = fakeSessionFactory({ messages: [askCall("c1", ARGS), result("c1", "作者回答：样板")] });
    kernel = new Kernel(home, (e) => events.push(e), { sessionFactory: factory });
    await kernel.init("test");
    await kernel.handle("project.open", { root });
    expect(events.some((e) => e.type === "question.requested")).toBe(false);
  });
});
