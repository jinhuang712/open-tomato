import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readProjectSettings, writeProjectSettings } from "../src/project/settings.js";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "opentomato-settings-"));
  file = path.join(dir, ".opentomato", "settings.json");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("project settings", () => {
  test("文件不存在时是空设置", async () => {
    expect(await readProjectSettings(file)).toEqual({ model: null });
  });

  test("写入会建目录，读回一致", async () => {
    await writeProjectSettings(file, { model: { provider: "anthropic", id: "claude-opus-5" }, thinkingLevel: "high" });
    expect(await readProjectSettings(file)).toEqual({
      model: { provider: "anthropic", id: "claude-opus-5" },
      thinkingLevel: "high",
    });
  });

  test("局部更新保留其余字段", async () => {
    await writeProjectSettings(file, { model: { provider: "openai", id: "gpt-5" }, thinkingLevel: "low" });
    const next = await writeProjectSettings(file, { model: { provider: "anthropic", id: "claude-sonnet-5" } });
    expect(next).toEqual({ model: { provider: "anthropic", id: "claude-sonnet-5" }, thinkingLevel: "low" });
  });

  test("坏 json 与非法字段一律归零，不抛", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "{ not json", "utf8");
    expect(await readProjectSettings(file)).toEqual({ model: null });
    await fs.writeFile(file, JSON.stringify({ model: { provider: "x" }, thinkingLevel: "turbo" }), "utf8");
    expect(await readProjectSettings(file)).toEqual({ model: null });
  });
});
