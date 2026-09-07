import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { makeAskUserTool } from "./ask-user.js";
import { makeContinueAgentTool } from "./continue-agent.js";
import { makeDocTemplateTool } from "./doc-template.js";
import { makeEditDocTool } from "./edit-doc.js";
import { makeListAgentsTool } from "./list-agents.js";
import { makeListDocsTool } from "./list-docs.js";
import { makeListOpenTool } from "./list-open.js";
import { makeLoadCapabilityTool } from "./load-capability.js";
import { makeProjectOverviewTool } from "./project-overview.js";
import { makeReadDocTool } from "./read-doc.js";
import { makeReadMarksTool } from "./read-marks.js";
import { makeReadReviewTool } from "./read-review.js";
import { makeArchiveAgentTool } from "./archive-agent.js";
import { makeRunCheckTool } from "./run-check.js";
import { makeSaveReviewTool } from "./save-review.js";
import { makeSearchDocsTool } from "./search-docs.js";
import { makeSettleTool } from "./settle.js";
import { makeSpawnAgentsTool } from "./spawn-agents.js";
import { makeVolumeRhythmTool } from "./volume-rhythm.js";
import { makeWebSearchTool } from "./web-search.js";
import { makeWriteDocTool } from "./write-doc.js";
import type { ToolContext, ToolPermissions } from "./shared.js";

export function createTools(ctx: ToolContext, perms: ToolPermissions): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  tools.push(makeProjectOverviewTool(ctx));
  tools.push(makeListDocsTool(ctx));
  tools.push(makeListOpenTool(ctx));
  tools.push(makeReadDocTool(ctx));
  tools.push(makeSearchDocsTool(ctx));
  tools.push(makeWebSearchTool(ctx));
  tools.push(makeDocTemplateTool(ctx));
  tools.push(makeRunCheckTool(ctx));

  if (perms.writableKinds.length > 0) {
    tools.push(makeWriteDocTool(ctx, perms.writableKinds));
    tools.push(makeEditDocTool(ctx, perms.writableKinds, perms.bookkeepAnyKind ?? false));
  }

  tools.push(makeReadMarksTool(ctx));
  tools.push(makeVolumeRhythmTool(ctx));
  tools.push(makeReadReviewTool(ctx));

  if (perms.reviewAs) {
    tools.push(makeSaveReviewTool(ctx, perms.reviewAs));
  }

  if (perms.canAsk) {
    tools.push(makeAskUserTool(ctx));
  }

  if (perms.canSpawn) {
    tools.push(makeSettleTool(ctx));
    tools.push(makeLoadCapabilityTool(ctx));
  }

  if (perms.canSpawn && ctx.spawn) {
    tools.push(makeSpawnAgentsTool(ctx));
  }

  if (perms.canSpawn && ctx.continueAgent) {
    tools.push(makeContinueAgentTool(ctx));
  }

  if (perms.canSpawn && ctx.archiveAgent) {
    tools.push(makeArchiveAgentTool(ctx));
  }

  if (perms.canSpawn && ctx.listAgents) {
    tools.push(makeListAgentsTool(ctx));
  }

  return tools;
}

export function toolNames(tools: ToolDefinition[]): string[] {
  return tools.map((t) => t.name);
}

// 对外保持原来的导入面：runtime 与测试只改路径，不改名字
export { WRITE_TOOL_NAMES } from "./shared.js";
export type {
  DispatchProgress,
  DispatchResult,
  SpawnMode,
  SpawnTask,
  ToolContext,
  ToolPermissions,
} from "./shared.js";
export { repairAskArgs } from "./ask-args.js";
export type { AskOption } from "./ask-args.js";
