import { readFile } from "node:fs/promises";
import type { PermissionEvaluation } from "@opencode/plugin/promise/permission";
import {
  assertWritableKind,
  bookkeepingOnly,
  dispatchProblem,
  frontmatterDiffKeys,
  frontmatterOnly,
  frontmatterProblem,
  ISSUE_LEVEL_LABEL,
  parseFrontmatter,
  ROLE_IDS,
  ROLES,
  runCheck,
  zhDir,
  type DocKindId,
  type ProjectStore,
} from "@opentomato/core/headless";
import { roleOf } from "./roles.ts";
import { resolveMaterial, type Material } from "./material.ts";

/** execute.before 里用到的字段；opencode 的事件对象比这多，input 可以改写 */
export interface BeforeEvent {
  readonly tool: string;
  readonly agent: string;
  readonly id: string;
  input: unknown;
}

type Content =
  | string
  | ReadonlyArray<{ type: "text"; text: string } | { type: "file"; uri: string; mime: string }>;

/** execute.after 里用到的字段；成功时可以改写 result */
export type AfterEvent = { readonly tool: string; readonly id: string } & (
  | {
      readonly status: "completed";
      result: { content?: Content; output?: unknown; metadata?: unknown };
    }
  | { readonly status: "error" }
);

interface Pending extends Material {
  /** 只改了 frontmatter、正文一字没动：不过作者这道门，落盘后告诉 agent 改了哪些字段 */
  frontmatterKeys?: string[];
}

type EditInput = {
  path?: unknown;
  content?: unknown;
  oldString?: unknown;
  newString?: unknown;
  replaceAll?: unknown;
};

/**
 * 写入把关，挂在 opencode 自带的 write / edit 上：桌面端画得出 diff、弹得出审批，规则仍是 App 那套。
 * - before：path 必须是材料，角色只写自己的类别（越界只放行记账字段），frontmatter 必须能解析
 * - evaluate：正文一字没动的改动不问作者，其余照写作角色的 edit: ask 去问
 * - after：落盘成功就附上这篇的机检结果
 * 写作角色不能用 shell、patch；别的 agent 用不了写作工具、派不了写作角色。
 */
export function createWriteGate(
  project: () => Promise<ProjectStore>,
  toolNames: ReadonlySet<string>,
) {
  const pending = new Map<string, Pending>();

  async function before(event: BeforeEvent): Promise<void> {
    const role = roleOf(event.agent);
    if (!role) {
      if (toolNames.has(event.tool))
        throw new Error(`${event.tool} 是 OpenTomato 写作角色的工具，切到主编再用`);
      const target = (event.input as { agent?: unknown } | null)?.agent;
      if (event.tool === "subagent" && typeof target === "string" && roleOf(target)) {
        throw new Error(`${target} 是 OpenTomato 的写作角色，只有主编能派`);
      }
      return;
    }
    if (event.tool === "shell" || event.tool === "patch") {
      throw new Error(`写作角色不能用 ${event.tool}：写文档用 write，改文档用 edit`);
    }
    if (event.tool === "subagent") {
      // 和 App 的 spawn_agents 同一套门：没有一句话故事不派编剧写手，没章纲不派写手，没正文不派评审
      const target = roleOf(String((event.input as { agent?: unknown } | null)?.agent ?? ""));
      const problem = target ? await dispatchProblem(await project(), [target]) : null;
      if (problem) throw new Error(problem);
      return;
    }
    if (event.tool !== "write" && event.tool !== "edit") return;

    const input = (event.input ?? {}) as EditInput;
    if (typeof input.path !== "string") return; // 参数不全交给工具自己的校验去报
    const material = await resolveMaterial(await project(), input.path, event.tool === "write");
    const current = (await readFile(material.abs, "utf8").catch(() => null)) ?? "";
    const next =
      event.tool === "write" ? String(input.content ?? "") : applyEdit(current, input, material);

    const problem = frontmatterProblem(next);
    if (problem) throw new Error(problem);

    const def = ROLES[role];
    const exists = current !== "";
    const fmOnly = exists && frontmatterOnly(current, next);
    if (!def.writableKinds.includes(material.kind)) {
      // 统筹者能给任何一张卡改记账字段（把孤卡标 retired），内容一个字都不放
      if (!def.bookkeepAnyKind) assertWritableKind(material.kind, def.writableKinds);
      if (!(fmOnly && bookkeepingOnly(material.kind, current, next))) {
        throw new Error(
          `${zhDir(material.kind)} 的内容不归你写：要改就派${writersOf(material.kind)}。你自己对它只能改记账字段（status / open / keywords），比如把作废的标 status: retired。`,
        );
      }
    }

    const keys = fmOnly
      ? frontmatterDiffKeys(
          parseFrontmatter(current).frontmatter,
          parseFrontmatter(next).frontmatter,
        )
      : [];
    pending.set(event.id, { ...material, ...(keys.length > 0 ? { frontmatterKeys: keys } : {}) });
    if (input.path !== material.rel) event.input = { ...input, path: material.rel };
  }

  function evaluate(event: PermissionEvaluation): void {
    if (event.action !== "edit" || event.source?.type !== "tool") return;
    if (pending.get(event.source.id)?.frontmatterKeys) event.effect = "allow";
  }

  async function after(event: AfterEvent): Promise<void> {
    const material = pending.get(event.id);
    if (!material) return;
    pending.delete(event.id);
    if (event.status !== "completed") return;
    const notes: string[] = [];
    if (material.frontmatterKeys) {
      notes.push(
        `只改了 ${material.rel} 的 frontmatter 字段 ${material.frontmatterKeys.join("、")}，正文没动，无需作者审批。`,
      );
    }
    const issues = (await runCheck(await project())).filter(
      (i) => i.kind === material.kind && i.id === material.id,
    );
    if (issues.length > 0) {
      notes.push(
        `机检对这篇有话说：\n${issues.map((i) => `- ${ISSUE_LEVEL_LABEL[i.level]}：${i.message}`).join("\n")}`,
      );
    }
    if (notes.length === 0) return;
    const tail = notes.join("\n");
    const content = event.result.content;
    event.result.content =
      content === undefined
        ? tail
        : typeof content === "string"
          ? `${content}\n\n${tail}`
          : [...content, { type: "text", text: tail }];
  }

  return { before, evaluate, after };
}

/**
 * 越界被打回的只会是统筹者（子角色在 assertWritableKind 就停了），话要对它说：派谁去改。
 * App 里同一句话写的是「由主编派」，主编自己读到会以为自己不是主编。
 */
const writersOf = (kind: DocKindId): string =>
  ROLE_IDS.filter((role) => !ROLES[role].canSpawn && ROLES[role].writableKinds.includes(kind))
    .map((role) => ROLES[role].label)
    .join("或");

/** 照 edit 的语义算出改完的全文：oldString 须逐字唯一匹配（replaceAll 时全部替换），对不上就让 agent 重读原文 */
function applyEdit(before: string, input: EditInput, material: Material): string {
  if (before === "") throw new Error(`${material.rel} 不存在，新建用 write`);
  const oldString = String(input.oldString ?? "");
  const newString = String(input.newString ?? "");
  if (oldString === "") throw new Error("oldString 不能为空：要追加就带上文末最后一段一起替换");
  const count = before.split(oldString).length - 1;
  if (count === 0) {
    throw new Error(
      `${material.rel} 里找不到 oldString，要逐字照抄原文（含标点和换行）。先 read_doc 拿磁盘上的原文再改。`,
    );
  }
  if (input.replaceAll === true) return before.split(oldString).join(newString);
  if (count > 1)
    throw new Error(`oldString 在 ${material.rel} 里出现了 ${count} 次，多带一两行上下文，确保只能匹配到一处`);
  return before.replace(oldString, () => newString);
}
