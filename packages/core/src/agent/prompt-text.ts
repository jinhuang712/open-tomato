import { readFileSync } from "node:fs";

/**
 * 文本型提示词统一加载口。角色正文在 packages/core/prompts/ 下，
 * 能力脚本在 packages/core/prompts/capabilities/ 下，一律一份 markdown。
 * md 里只写独有部分，共享片段与参数用 {{占位符}}，组装时由调用方注入。
 * 占位符缺值就抛错，别让没拼好的提示词上线。
 */
export function loadPrompt(name: string): string {
  return readFileSync(new URL(`../../prompts/${name}.md`, import.meta.url), "utf8").trim();
}

export function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/{{(\w+)}}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined) throw new Error(`prompt 占位符缺值：${k}`);
    return v;
  });
}
