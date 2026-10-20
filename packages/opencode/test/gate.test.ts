import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PermissionEvaluation } from "@opencode/plugin/promise/permission";
import { ProjectStore } from "@opentomato/core/headless";
import { createWriteGate, type AfterEvent, type BeforeEvent } from "../src/gate.ts";
import { resolveMaterial } from "../src/material.ts";

let root: string;
let store: ProjectStore;
let gate: ReturnType<typeof createWriteGate>;

const CARD = `---
title: 林尧
summary: 退役刑警，想把妹妹找回来
tier: 主角
status: draft
---

## 一句话

退役刑警，想把妹妹找回来。
`;

const CHAPTER = `---
title: 雨夜
summary: 林尧回到旧城
volume: "01"
status: draft
---

雨下了一夜。
`;

let seq = 0;
const before = async (agent: string, tool: string, input: Record<string, unknown>) => {
  const event: BeforeEvent = { tool, agent, id: `call-${++seq}`, input };
  await gate.before(event);
  return event;
};

/** 写入钩子之后 opencode 会问权限：默认按写作角色的 edit: ask 来 */
const decision = (callId: string) => {
  const event = {
    action: "edit",
    resources: [],
    source: { type: "tool", messageID: "m", id: callId },
    effect: "ask",
  } as unknown as PermissionEvaluation;
  gate.evaluate(event);
  return event.effect;
};

const finish = async (callId: string, content = "Wrote file successfully") => {
  const event = {
    tool: "write",
    id: callId,
    status: "completed",
    result: { content },
  } as AfterEvent;
  await gate.after(event);
  return event.status === "completed" ? String(event.result.content) : "";
};

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ot-gate-"));
  store = await ProjectStore.create(root, "测试书");
  gate = createWriteGate(store, new Set(["read_doc"]));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("resolveMaterial", () => {
  test("材料路径按 core 规则规范化", async () => {
    expect((await resolveMaterial(store, "人物/林尧.md", true)).rel).toBe("人物/林尧.md");
    expect((await resolveMaterial(store, "章纲/1.md", true)).rel).toBe("章纲/0001.md");
    expect((await resolveMaterial(store, path.join(root, "卷纲/2.md"), true)).rel).toBe(
      "卷纲/02.md",
    );
    expect((await resolveMaterial(store, "简介.md", false)).kind).toBe("brief");
  });

  test("新守则没给编号就分配下一个", async () => {
    expect((await resolveMaterial(store, "守则/新.md", true)).rel).toBe("守则/001.md");
  });

  test("不是材料的路径一律打回", async () => {
    const bad = [
      "src/index.ts",
      "../别的书/人物/a.md",
      "人物/a/b.md",
      "人物/a.txt",
      "随笔.md",
      ".opentomato/project.json",
    ];
    await Promise.all(
      bad.map((input) =>
        expect(resolveMaterial(store, input, true)).rejects.toThrow("只能写本项目的材料"),
      ),
    );
  });
});

describe("写入把关", () => {
  test("写手写正文：路径规范化，要过作者这道门，落盘后附机检", async () => {
    const event = await before("写手", "write", { path: "正文/1.md", content: CHAPTER });
    expect((event.input as { path: string }).path).toBe("正文/0001.md");
    expect(decision(event.id)).toBe("ask");
    await store.write("manuscript", "0001", CHAPTER);
    expect(await finish(event.id)).toStartWith("Wrote file successfully");
  });

  test("越界写别人的类别：直接打回", async () => {
    await expect(before("写手", "write", { path: "人物/林尧.md", content: CARD })).rejects.toThrow(
      "人物 不归你写",
    );
    await expect(
      before("文编", "write", { path: "正文/0001.md", content: CHAPTER }),
    ).rejects.toThrow();
  });

  test("主编改任何一张卡的记账字段：放行且不问作者；动正文就打回", async () => {
    await store.write("manuscript", "0001", CHAPTER);
    const ok = await before("主编", "edit", {
      path: "正文/0001.md",
      oldString: "status: draft",
      newString: "status: retired",
    });
    expect(decision(ok.id)).toBe("allow");
    expect(await finish(ok.id)).toContain("frontmatter 字段 status");
    await expect(
      before("主编", "edit", {
        path: "正文/0001.md",
        oldString: "雨下了一夜。",
        newString: "雨停了。",
      }),
    ).rejects.toThrow("内容不归你写");
  });

  test("自己类别里只改 frontmatter：不问作者；改正文：问作者", async () => {
    await store.write("characters", "林尧", CARD);
    const fm = await before("策划", "edit", {
      path: "人物/林尧.md",
      oldString: "tier: 主角",
      newString: "tier: 关键对手",
    });
    expect(decision(fm.id)).toBe("allow");
    const body = await before("策划", "edit", {
      path: "人物/林尧.md",
      oldString: "退役刑警，想把妹妹找回来。\n",
      newString: "退役刑警，只想把妹妹找回来。\n",
    });
    expect(decision(body.id)).toBe("ask");
  });

  test("落盘后附上这篇的机检：主角缺语音签名", async () => {
    const event = await before("策划", "write", { path: "人物/林尧.md", content: CARD });
    await store.write("characters", "林尧", CARD);
    expect(await finish(event.id)).toContain("语音签名");
  });

  test("edit 的原文对不上、不唯一、文件不存在，都让它重读", async () => {
    await store.write("characters", "林尧", CARD);
    await expect(
      before("策划", "edit", { path: "人物/林尧.md", oldString: "没有这句", newString: "x" }),
    ).rejects.toThrow("找不到 oldString");
    await expect(
      before("策划", "edit", { path: "人物/林尧.md", oldString: "退役刑警", newString: "x" }),
    ).rejects.toThrow("出现了");
    await expect(
      before("策划", "edit", { path: "人物/没这人.md", oldString: "a", newString: "b" }),
    ).rejects.toThrow("新建用 write");
  });

  test("frontmatter 写坏了不落盘", async () => {
    await expect(
      before("策划", "write", { path: "人物/林尧.md", content: "---\ntitle: [没闭合\n---\n" }),
    ).rejects.toThrow();
    expect(await readFile(path.join(root, "人物", "林尧.md"), "utf8").catch(() => null)).toBeNull();
  });

  test("写作角色不能用 shell 和 patch", async () => {
    await expect(before("主编", "shell", { command: "ls" })).rejects.toThrow("不能用 shell");
    await expect(before("写手", "patch", { patch: "" })).rejects.toThrow("不能用 patch");
  });

  test("别的 agent：用不了写作工具、派不了写作角色，自己的写入不管", async () => {
    await expect(before("build", "read_doc", { kind: "人物", id: "林尧" })).rejects.toThrow(
      "切到主编",
    );
    await expect(before("build", "subagent", { agent: "写手", prompt: "写" })).rejects.toThrow(
      "只有主编能派",
    );
    const own = await before("build", "write", { path: "src/index.ts", content: "x" });
    expect(decision(own.id)).toBe("ask");
  });
});
