import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { ISSUE_LEVEL_LABEL } from "../../protocol.js";
import { fmtIssue, text, type ToolContext } from "./shared.js";

export function makeRunCheckTool(ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "run_check",
    label: textValue("tools/materials", "run_check.label"),
    description: textValue("tools/materials", "run_check.description"),
    parameters: Type.Object({}),
    execute: async () => {
      const issues = await ctx.runCheck();
      if (issues.length === 0) return text(textValue("messages/materials", "run_check.execute"));
      const errors = issues.filter((i) => i.level === "error");
      const warnings = issues.filter((i) => i.level === "warning");
      return text(
        [
          textValue("messages/materials", "run_check.execute_2", { v0: ISSUE_LEVEL_LABEL.error, v1: errors.length, v2: ISSUE_LEVEL_LABEL.warning, v3: warnings.length }),
          ...(errors.length ? ["", `## ${ISSUE_LEVEL_LABEL.error}`, ...errors.map(fmtIssue)] : []),
          ...(warnings.length ? ["", `## ${ISSUE_LEVEL_LABEL.warning}`, ...warnings.map(fmtIssue)] : []),
        ].join("\n"),
      );
    },
  });
}
