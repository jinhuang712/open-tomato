import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Gate } from "../src/agent/gate.js";
import { ROLES } from "../src/agent/roles.js";
import { createTools, toolNames, type ToolContext } from "../src/agent/tools/index.js";
import type { RoleId } from "../src/protocol.js";
import { ProjectStore } from "../src/project/store.js";

let root: string;
let store: ProjectStore;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "opentomato-"));
  store = await ProjectStore.create(root, "测试书");
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function namesFor(role: RoleId): string[] {
  const gate = new Gate({ approvalRequested: () => {}, approvalClosed: () => {}, questionRequested: () => {}, questionClosed: () => {} });
  const ctx: ToolContext = { store, gate, agentId: role, runCheck: async () => [], docsChanged: async () => [], search: async () => [] };
  const def = ROLES[role];
  return toolNames(createTools(ctx, { writableKinds: def.writableKinds, bookkeepAnyKind: def.bookkeepAnyKind ?? false, canSpawn: def.canSpawn, canAsk: def.canAsk, reviewAs: def.canReview ? role : undefined }));
}

describe("只读角色的工具表", () => {
  test("评审与裁决没有 web_search 与 doc_template：对照章纲正文下判断，不动笔", () => {
    for (const role of ["ops", "reader", "copyeditor", "proofreader", "arbiter"] as const) {
      const names = namesFor(role);
      expect(names).not.toContain("web_search");
      expect(names).not.toContain("doc_template");
      // 保底：读材料与落审稿记录的家伙式还在
      expect(names).toContain("read_doc");
    }
  });

  test("动笔的角色不受影响", () => {
    for (const role of ["director", "designer", "plotter", "writer"] as const) {
      const names = namesFor(role);
      expect(names).toContain("web_search");
      expect(names).toContain("doc_template");
    }
  });
});
