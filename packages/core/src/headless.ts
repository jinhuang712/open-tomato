/**
 * 不带 pi 内核的一面：材料层、机检、角色与能力定义、只读工具。
 * 给不跑 Kernel 的宿主（opencode 插件）用，同一个项目目录两边都能打开，schema 与提示词只有这一份。
 * 这里导出的模块运行时都不加载 pi；加新导出前先确认它的依赖链里没有 pi。
 */
export * from "./protocol.js";
export { ProjectStore, StaleWriteError } from "./project/store.js";
export {
  DOC_KINDS,
  DOC_KIND_IDS,
  bookkeepingFields,
  kindInfos,
  resolveKind,
} from "./project/kinds.js";
export {
  frontmatterDiffKeys,
  parseFrontmatter,
} from "./project/frontmatter.js";
export { frontmatterProblem } from "./project/frontmatter-validation.js";
export { runCheck } from "./project/check.js";
export { SearchIndex } from "./project/search.js";
export { ROLES, ROLE_IDS, sharedRolePrompt, sharedToolPrompt, type RoleDef } from "./agent/roles.js";
export {
  CAPABILITIES,
  CAPABILITY_IDS,
  capabilityRoster,
} from "./agent/capabilities.js";
export { Gate } from "./agent/gate.js";
export {
  assertWritableKind,
  bookkeepingOnly,
  dispatchProblem,
  fmtIssue,
  frontmatterOnly,
  zhDir,
  zhPath,
  type ToolContext,
} from "./agent/tools/shared.js";
export { makeDocTemplateTool } from "./agent/tools/doc-template.js";
export { makeListDocsTool } from "./agent/tools/list-docs.js";
export { makeListOpenTool } from "./agent/tools/list-open.js";
export { makeLoadCapabilityTool } from "./agent/tools/load-capability.js";
export { makeProjectOverviewTool } from "./agent/tools/project-overview.js";
export { makeReadDocTool } from "./agent/tools/read-doc.js";
export { makeReadReviewTool } from "./agent/tools/read-review.js";
export { makeRunCheckTool } from "./agent/tools/run-check.js";
export { makeSaveReviewTool } from "./agent/tools/save-review.js";
export { makeSearchDocsTool } from "./agent/tools/search-docs.js";
export { makeVolumeRhythmTool } from "./agent/tools/volume-rhythm.js";

export { text, markdown, fill, createTextLoader } from "./text/load.js";
