/** opencode 的权限规则：action 和 resource 都是通配符（`*` 匹配任意字符，含 `/`），后写的规则优先 */
export type Effect = "allow" | "deny" | "ask";
export type Rule = { action: string; resource: string; effect: Effect };

export const rule = (action: string, effect: Effect, resource = "*"): Rule => ({
  action,
  resource,
  effect,
});

const patterns = new Map<string, RegExp>();
const matches = (pattern: string, value: string): boolean => {
  let re = patterns.get(pattern);
  if (!re) {
    const body = pattern
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    re = new RegExp(`^${body}$`, "s");
    patterns.set(pattern, re);
  }
  return re.test(value);
};

const STRICTNESS: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };

/**
 * 按这组规则算一次请求的结果；规则管不到的返回 undefined，交给 opencode 原来的结果。
 * 一次请求带多个 resource 时取最严的那个，和逐个问过一遍的结果一样。
 */
export function effectOf(
  rules: readonly Rule[],
  action: string,
  resources: readonly string[],
): Effect | undefined {
  let result: Effect | undefined;
  for (const resource of resources.length > 0 ? resources : [""]) {
    const hit = rules.findLast((r) => matches(r.action, action) && matches(r.resource, resource));
    if (!hit) return undefined;
    if (!result || STRICTNESS[hit.effect] > STRICTNESS[result]) result = hit.effect;
  }
  return result;
}

/** 这个动作在这组规则下一律被拒（没有哪个 resource 还放行）：对应的工具不该出现在清单里 */
export function deniedOutright(rules: readonly Rule[], action: string): boolean {
  const relevant = rules.filter((r) => matches(r.action, action));
  const last = relevant.findLastIndex((r) => r.resource === "*");
  return last >= 0 && relevant.slice(last).every((r) => r.effect === "deny");
}
