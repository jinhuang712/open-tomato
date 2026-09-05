import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ISSUE_LEVEL_LABEL } from "../../protocol.js";
import { fmtIssue, text, type ToolContext } from "./shared.js";

export function makeRunCheckTool(ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "run_check",
    label: "一致性机检",
    description: "机械对账：缺必填字段、缺必填段、残留「待填」、段落只写「待定」、章纲引用不存在的卡、章号断档、里程碑 order 重复。error 必须修（落盘返回里标了就当场修）；warning 是欠账提醒。每次落盘后内核自动跑并把这篇的结果附在返回里，全书对账才手动调它。",
    parameters: Type.Object({}),
    execute: async () => {
      const issues = await ctx.runCheck();
      if (issues.length === 0) return text("机检通过，没有问题。");
      const errors = issues.filter((i) => i.level === "error");
      const warnings = issues.filter((i) => i.level === "warning");
      return text(
        [
          `机检：${ISSUE_LEVEL_LABEL.error} ${errors.length} 处，${ISSUE_LEVEL_LABEL.warning} ${warnings.length} 处`,
          ...(errors.length ? ["", `## ${ISSUE_LEVEL_LABEL.error}`, ...errors.map(fmtIssue)] : []),
          ...(warnings.length ? ["", `## ${ISSUE_LEVEL_LABEL.warning}`, ...warnings.map(fmtIssue)] : []),
        ].join("\n"),
      );
    },
  });
}
