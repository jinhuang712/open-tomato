import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { hasOneLineStory } from "../src/project/gates.js";
import { ProjectStore } from "../src/project/store.js";

let root: string;
let store: ProjectStore;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "opentomato-gates-"));
  store = await ProjectStore.create(root, "测试书");
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const withStory = (story: string) => `---
title: 简介
summary: 测试
keywords: [立项]
status: draft
---

## 一句话故事

${story}

## 题材与平台

待填
`;

describe("hasOneLineStory", () => {
  test("新建项目的简介还没有一句话故事这一段，不过门", async () => {
    expect(await hasOneLineStory(store)).toBe(false);
  });

  test("段落有内容就过门", async () => {
    await store.write("brief", "简介", withStory("落魄铸剑师为重铸镇国剑踏遍九州。"));
    expect(await hasOneLineStory(store)).toBe(true);
  });

  test("段落为空不过门", async () => {
    await store.write("brief", "简介", withStory(""));
    expect(await hasOneLineStory(store)).toBe(false);
  });

  test("简介不存在不过门", async () => {
    await fs.rm(path.join(root, "简介.md"));
    expect(await hasOneLineStory(store)).toBe(false);
  });
});
