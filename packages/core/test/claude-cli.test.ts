import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { findClaudeCliEntry } from "../src/agent/claude-cli.js";

const dirs: string[] = [];
function agentDir(): string {
  const d = mkdtempSync(path.join(os.tmpdir(), "claude-cli-"));
  dirs.push(d);
  return d;
}
function touch(file: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "");
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("findClaudeCliEntry", () => {
  test("没装：返回 null，不报错", () => {
    expect(findClaudeCliEntry(agentDir())).toBeNull();
  });

  test("git 包：任意 owner 下的 pi-claude-cli", () => {
    const d = agentDir();
    const entry = path.join(d, "git", "github.com", "someone", "pi-claude-cli", "index.ts");
    touch(entry);
    expect(findClaudeCliEntry(d)).toBe(entry);
  });

  test("npm 全局包", () => {
    const d = agentDir();
    const entry = path.join(d, "npm", "node_modules", "@ramarivera", "pi-claude-cli", "index.ts");
    touch(entry);
    expect(findClaudeCliEntry(d)).toBe(entry);
  });
});
