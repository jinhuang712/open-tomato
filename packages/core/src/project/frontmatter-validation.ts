import { parse as parseYaml } from "yaml";
import { text as textValue } from "../text/load.js";
import { FRONTMATTER_FENCE } from "./frontmatter.js";

/**
 * 落盘前的校验：必须以 frontmatter 开头、YAML 能解析且是一个映射。
 * 返回给用户 / 模型看的原因；合法返回 null。
 */
export function frontmatterProblem(raw: string): string | null {
  const m = FRONTMATTER_FENCE.exec(raw);
  if (!m) return textValue("messages/materials", "frontmatter.message");
  let parsed: unknown;
  try {
    parsed = parseYaml(m[1] ?? "");
  } catch (e) {
    return textValue("messages/materials", "frontmatter.message_2", { v0: e instanceof Error ? e.message.split("\n")[0] : String(e) });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return textValue("messages/materials", "frontmatter.message_3");
  return null;
}
