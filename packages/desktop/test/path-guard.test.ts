import { describe, expect, test } from "bun:test";
import { isAllowedPath, isInside, isKnownProjectRoot } from "../src/main/path-guard.js";

describe("isInside", () => {
  test("本身和里面算，同前缀的兄弟目录不算", () => {
    expect(isInside("/a/proj", "/a/proj")).toBe(true);
    expect(isInside("/a/proj", "/a/proj/.opentomato/settings.json")).toBe(true);
    expect(isInside("/a/proj", "/a/proj-evil/x")).toBe(false);
  });

  test(".. 绕出去不算", () => {
    expect(isInside("/a/proj", "/a/proj/../secret")).toBe(false);
    expect(isInside("/a/proj", "/a/proj/sub/../../..")).toBe(false);
  });
});

describe("isKnownProjectRoot", () => {
  const known = ["/Users/x/novels/A", "/Users/x/novels/B"];

  test("只认已知根本身", () => {
    expect(isKnownProjectRoot("/Users/x/novels/A", known)).toBe(true);
    expect(isKnownProjectRoot("/Users/x/novels/A/", known)).toBe(true);
  });

  test("上级、子目录、无关目录都拒", () => {
    expect(isKnownProjectRoot("/Users/x/novels", known)).toBe(false);
    expect(isKnownProjectRoot("/Users/x/novels/A/人物", known)).toBe(false);
    expect(isKnownProjectRoot("/Users/x/Documents", known)).toBe(false);
    expect(isKnownProjectRoot("/", known)).toBe(false);
  });

  test("没有已知项目就全拒", () => {
    expect(isKnownProjectRoot("/Users/x/novels/A", [])).toBe(false);
  });
});

describe("isAllowedPath", () => {
  const roots = ["/Users/x/Library/Application Support/OpenTomato", "/Users/x/.pi/agent", "/Users/x/novels/A"];

  test("应用数据、pi 配置、项目里的文件放行", () => {
    expect(isAllowedPath("/Users/x/Library/Application Support/OpenTomato/state.json", roots)).toBe(true);
    expect(isAllowedPath("/Users/x/.pi/agent/auth.json", roots)).toBe(true);
    expect(isAllowedPath("/Users/x/novels/A/.opentomato/settings.json", roots)).toBe(true);
  });

  test("别处的文件拒", () => {
    expect(isAllowedPath("/Users/x/Documents/tax.pdf", roots)).toBe(false);
    expect(isAllowedPath("/bin/sh", roots)).toBe(false);
    expect(isAllowedPath("/Users/x/.pi/agent/../.ssh/id_rsa", roots)).toBe(false);
  });
});
