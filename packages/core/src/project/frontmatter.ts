import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface ParsedDoc {
  frontmatter: Record<string, unknown>;
  body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** 拆 `---` 包裹的 YAML 头和正文。没有头就当全是正文。 */
export function parseFrontmatter(raw: string): ParsedDoc {
  const m = FENCE.exec(raw);
  if (!m) return { frontmatter: {}, body: raw };
  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(m[1] ?? "");
  } catch {
    frontmatter = {};
  }
  if (frontmatter === null || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    frontmatter = {};
  }
  return { frontmatter: frontmatter as Record<string, unknown>, body: m[2] ?? "" };
}

export function stringifyFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  const trimmedBody = body.replace(/^\r?\n+/, "");
  return `---\n${yaml}\n---\n\n${trimmedBody.endsWith("\n") ? trimmedBody : `${trimmedBody}\n`}`;
}

export interface Section {
  heading: string;
  content: string;
}

/** 按 `## 标题` 切段。第一个 `##` 之前的内容归到 heading 为空的段。 */
export function splitSections(body: string): Section[] {
  const lines = body.split(/\r?\n/);
  const sections: Section[] = [];
  let current: Section = { heading: "", content: "" };
  const buf: string[] = [];
  const flush = () => {
    current.content = buf.join("\n").trim();
    if (current.heading !== "" || current.content !== "") sections.push(current);
    buf.length = 0;
  };
  for (const line of lines) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      flush();
      current = { heading: h[1] ?? "", content: "" };
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

export function pickSection(body: string, heading: string): string | undefined {
  const want = heading.trim();
  return splitSections(body).find((s) => s.heading === want)?.content;
}

export function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim() !== "") return v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

export function asString(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  return typeof v === "string" ? v : String(v);
}
