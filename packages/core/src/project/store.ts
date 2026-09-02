import { promises as fs } from "node:fs";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import type { DocContent, DocHeader, DocKindId, ProjectInfo } from "../protocol.js";
import { asString, asStringArray, parseFrontmatter, pickSection, splitSections } from "./frontmatter.js";
import { DOC_KIND_IDS, DOC_KINDS, GUIDE_SEEDS, isDocKindId, LEGACY_DIRS, LEGACY_GUIDE_IDS } from "./kinds.js";

const MARKER_DIR = ".opentomato";
const MARKER_FILE = "project.json";
const PROJECT_FORMAT = 1;
/** 项目内会话目录（相对 .opentomato/），主编会话 jsonl 落这里；子目录按角色分 */
const SESSIONS_DIR = "sessions";
const LEAD_SESSIONS_DIR = path.join(SESSIONS_DIR, "lead");
/** .opentomato/.gitignore：会话记录大且噪音多，不进 git；project.json 等保留 */
const MARKER_GITIGNORE = `${SESSIONS_DIR}/\n`;

export interface WritePreview {
  kind: DocKindId;
  id: string;
  path: string;
  title: string;
  isNew: boolean;
  before: string;
  after: string;
  patch: string;
}

export class ProjectStore {
  private constructor(public readonly info: ProjectInfo) {}

  static markerPath(root: string): string {
    return path.join(root, MARKER_DIR, MARKER_FILE);
  }

  /** 主编会话 jsonl 的目录：<root>/.opentomato/sessions/lead */
  static leadSessionsDir(root: string): string {
    return path.join(root, MARKER_DIR, LEAD_SESSIONS_DIR);
  }

  get leadSessionsDir(): string {
    return ProjectStore.leadSessionsDir(this.info.root);
  }

  static async exists(root: string): Promise<boolean> {
    try {
      await fs.access(ProjectStore.markerPath(root));
      return true;
    } catch {
      return false;
    }
  }

  static async create(root: string, name: string): Promise<ProjectStore> {
    if (await ProjectStore.exists(root)) throw new Error(`已经是一个项目：${root}`);
    const info: ProjectInfo = { root, name: name.trim() || path.basename(root), createdAt: new Date().toISOString() };
    await fs.mkdir(path.join(root, MARKER_DIR), { recursive: true });
    for (const k of DOC_KIND_IDS) await fs.mkdir(path.join(root, DOC_KINDS[k].dir), { recursive: true });
    await fs.writeFile(
      ProjectStore.markerPath(root),
      `${JSON.stringify({ format: PROJECT_FORMAT, ...info }, null, 2)}\n`,
      "utf8",
    );
    for (const [id, raw] of Object.entries(GUIDE_SEEDS)) {
      await fs.writeFile(path.join(root, DOC_KINDS.guide.dir, `${id}.md`), raw, "utf8");
    }
    await ensureMarkerDir(root);
    return new ProjectStore(info);
  }

  static async open(root: string): Promise<ProjectStore> {
    const raw = await fs.readFile(ProjectStore.markerPath(root), "utf8").catch(() => {
      throw new Error(`不是 OpenTomato 项目（缺 ${MARKER_DIR}/${MARKER_FILE}）：${root}`);
    });
    const parsed = JSON.parse(raw) as Partial<ProjectInfo> & { format?: number };
    if (parsed.format !== PROJECT_FORMAT) throw new Error(`项目格式版本不匹配：${String(parsed.format)}`);
    await migrateLegacyLayout(root);
    for (const k of DOC_KIND_IDS) await fs.mkdir(path.join(root, DOC_KINDS[k].dir), { recursive: true });
    await ensureMarkerDir(root);
    return new ProjectStore({
      root,
      name: asString(parsed.name, path.basename(root)),
      createdAt: asString(parsed.createdAt, new Date(0).toISOString()),
    });
  }

  // ───────────── 路径 ─────────────

  relPath(kind: DocKindId, id: string): string {
    return path.posix.join(DOC_KINDS[kind].dir, `${DOC_KINDS[kind].normalizeId(id)}.md`);
  }

  absPath(kind: DocKindId, id: string): string {
    return path.join(this.info.root, this.relPath(kind, id));
  }

  normalizeId(kind: DocKindId, id: string): string {
    const n = DOC_KINDS[kind].normalizeId(id);
    if (n === "") throw new Error(`非法 id：${JSON.stringify(id)}`);
    return n;
  }

  // ───────────── 读 ─────────────

  async list(kind: DocKindId): Promise<DocHeader[]> {
    const dir = path.join(this.info.root, DOC_KINDS[kind].dir);
    let names: string[] = [];
    try {
      names = (await fs.readdir(dir)).filter((n) => n.endsWith(".md") && !n.startsWith("."));
    } catch {
      return [];
    }
    names.sort();
    const out: DocHeader[] = [];
    for (const n of names) {
      const id = n.slice(0, -3);
      const raw = await fs.readFile(path.join(dir, n), "utf8").catch(() => null);
      if (raw === null) continue;
      out.push(this.toHeader(kind, id, raw));
    }
    return out;
  }

  async listAll(): Promise<DocHeader[]> {
    const all: DocHeader[] = [];
    for (const k of DOC_KIND_IDS) all.push(...(await this.list(k)));
    return all;
  }

  async read(kind: DocKindId, id: string): Promise<DocContent | null> {
    const nid = this.normalizeId(kind, id);
    const raw = await fs.readFile(this.absPath(kind, nid), "utf8").catch(() => null);
    if (raw === null) return null;
    const header = this.toHeader(kind, nid, raw);
    const { body } = parseFrontmatter(raw);
    return { ...header, raw, body, sections: splitSections(body).map((s) => s.heading).filter(Boolean) };
  }

  async readSection(kind: DocKindId, id: string, heading: string): Promise<string | null> {
    const doc = await this.read(kind, id);
    if (!doc) return null;
    return pickSection(doc.body, heading) ?? null;
  }

  async search(query: string, limit = 30): Promise<DocHeader[]> {
    const q = query.trim().toLowerCase();
    if (q === "") return [];
    const hits: Array<{ score: number; h: DocHeader }> = [];
    for (const k of DOC_KIND_IDS) {
      const dir = path.join(this.info.root, DOC_KINDS[k].dir);
      let names: string[] = [];
      try {
        names = (await fs.readdir(dir)).filter((n) => n.endsWith(".md"));
      } catch {
        continue;
      }
      for (const n of names) {
        const raw = await fs.readFile(path.join(dir, n), "utf8").catch(() => null);
        if (raw === null) continue;
        const h = this.toHeader(k, n.slice(0, -3), raw);
        let score = 0;
        if (h.id.toLowerCase().includes(q) || h.title.toLowerCase().includes(q)) score += 10;
        if (h.keywords.some((kw) => kw.toLowerCase().includes(q))) score += 6;
        if (h.summary.toLowerCase().includes(q)) score += 3;
        if (raw.toLowerCase().includes(q)) score += 1;
        if (score > 0) hits.push({ score, h });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit).map((x) => x.h);
  }

  template(kind: DocKindId): string {
    return DOC_KINDS[kind].template;
  }

  // ───────────── 写 ─────────────

  async previewWrite(kind: DocKindId, id: string, after: string): Promise<WritePreview> {
    const nid = this.normalizeId(kind, id);
    const rel = this.relPath(kind, nid);
    const before = (await fs.readFile(this.absPath(kind, nid), "utf8").catch(() => null)) ?? "";
    const normalized = after.endsWith("\n") ? after : `${after}\n`;
    const patch = createTwoFilesPatch(rel, rel, before, normalized, "", "", { context: 3 });
    const title = this.toHeader(kind, nid, normalized).title;
    return { kind, id: nid, path: rel, title, isNew: before === "", before, after: normalized, patch };
  }

  async write(kind: DocKindId, id: string, raw: string): Promise<DocHeader> {
    const nid = this.normalizeId(kind, id);
    const abs = this.absPath(kind, nid);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const normalized = raw.endsWith("\n") ? raw : `${raw}\n`;
    await fs.writeFile(abs, normalized, "utf8");
    return this.toHeader(kind, nid, normalized);
  }

  // ───────────── 内部 ─────────────

  private toHeader(kind: DocKindId, id: string, raw: string): DocHeader {
    const { frontmatter } = parseFrontmatter(raw);
    const { title, summary, keywords, status, ...extra } = frontmatter;
    return {
      kind,
      id,
      path: this.relPath(kind, id),
      title: asString(title, id),
      summary: asString(summary),
      keywords: asStringArray(keywords),
      status: asString(status, "draft"),
      extra,
    };
  }
}

/** 英文目录 → 中文目录、英文守则文件名 → 中文；只在老目录存在且新目录为空时搬 */
async function migrateLegacyLayout(root: string) {
  const exists = (p: string) => fs.access(p).then(() => true, () => false);
  for (const k of DOC_KIND_IDS) {
    const from = path.join(root, LEGACY_DIRS[k]);
    const to = path.join(root, DOC_KINDS[k].dir);
    if (from === to || !(await exists(from))) continue;
    await fs.mkdir(path.dirname(to), { recursive: true });
    if (!(await exists(to))) {
      await fs.rename(from, to);
    } else {
      for (const n of await fs.readdir(from)) {
        if (!(await exists(path.join(to, n)))) await fs.rename(path.join(from, n), path.join(to, n));
      }
      await fs.rmdir(from).catch(() => {});
    }
  }
  await fs.rmdir(path.join(root, "outline")).catch(() => {});
  const guideDir = path.join(root, DOC_KINDS.guide.dir);
  for (const [en, zh] of Object.entries(LEGACY_GUIDE_IDS)) {
    const from = path.join(guideDir, `${en}.md`);
    const to = path.join(guideDir, `${zh}.md`);
    if ((await exists(from)) && !(await exists(to))) await fs.rename(from, to);
  }
}

/** 建 .opentomato/sessions/lead 与 .gitignore（已有的不覆盖） */
async function ensureMarkerDir(root: string) {
  await fs.mkdir(ProjectStore.leadSessionsDir(root), { recursive: true });
  const ignore = path.join(root, MARKER_DIR, ".gitignore");
  await fs.writeFile(ignore, MARKER_GITIGNORE, { encoding: "utf8", flag: "wx" }).catch(() => {});
}

/**
 * 把早期落在全局目录里的主编会话搬进项目：按 jsonl 首行 header 的 cwd 匹配项目根。
 * 只搬项目内不存在同名文件的；搬完返回搬了几个。
 */
export async function migrateLegacySessions(legacyDir: string, root: string): Promise<number> {
  const target = ProjectStore.leadSessionsDir(root);
  let names: string[];
  try {
    names = (await fs.readdir(legacyDir)).filter((n) => n.endsWith(".jsonl"));
  } catch {
    return 0;
  }
  const wanted = path.resolve(root);
  let moved = 0;
  for (const n of names) {
    const from = path.join(legacyDir, n);
    const cwd = await readSessionCwd(from);
    if (!cwd || path.resolve(cwd) !== wanted) continue;
    const to = path.join(target, n);
    if (await fs.access(to).then(() => true, () => false)) continue;
    await fs.mkdir(target, { recursive: true });
    try {
      await fs.rename(from, to);
    } catch {
      await fs.copyFile(from, to);
      await fs.unlink(from);
    }
    moved++;
  }
  return moved;
}

/** 读 pi session jsonl 首行 header 里的 cwd；不是 session 文件返回 null */
async function readSessionCwd(file: string): Promise<string | null> {
  const fh = await fs.open(file, "r").catch(() => null);
  if (!fh) return null;
  try {
    const buf = Buffer.alloc(4096);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const line = buf.subarray(0, bytesRead).toString("utf8").split("\n")[0] ?? "";
    const header = JSON.parse(line) as { type?: string; cwd?: string };
    return header.type === "session" && typeof header.cwd === "string" ? header.cwd : null;
  } catch {
    return null;
  } finally {
    await fh.close();
  }
}

export { isDocKindId };
