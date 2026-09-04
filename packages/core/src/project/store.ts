import { promises as fs } from "node:fs";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import type { DocContent, DocHeader, DocKindId, ProjectInfo } from "../protocol.js";
import { asString, asStringArray, parseFrontmatter, pickSection, splitSections, frontmatterProblem } from "./frontmatter.js";
import { PLACEHOLDER } from "./check.js";
import { BRIEF_SEED_BODY, DOC_KIND_IDS, DOC_KINDS, isDocKindId, LEGACY_DIRS, LEGACY_GUIDE_IDS } from "./kinds.js";
import { ProjectRecords } from "./records.js";
import { settingsPath } from "./settings.js";

const MARKER_DIR = ".opentomato";
const MARKER_FILE = "project.json";
const PROJECT_FORMAT = 1;
/** 项目内会话目录（相对 .opentomato/），主编会话 jsonl 落这里；子目录按角色分 */
const SESSIONS_DIR = "sessions";
/** 先写同目录临时文件再 rename 覆盖：写一半崩掉不会留下半截正文 */
async function writeAtomic(abs: string, content: string) {
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.writeFile(tmp, content, "utf8");
    await fs.rename(tmp, abs);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

export class StaleWriteError extends Error {
  constructor(public readonly path: string) {
    super(`${path} 在审批期间被改过，这次写入作废；请重新 read_doc 拿最新内容再提交`);
    this.name = "StaleWriteError";
  }
}

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
  /** 系统侧记录（批、审稿记录）：.opentomato/ 下，不是材料 */
  readonly records: ProjectRecords;

  private constructor(public readonly info: ProjectInfo) {
    this.records = new ProjectRecords(path.join(info.root, MARKER_DIR));
  }

  static markerPath(root: string): string {
    return path.join(root, MARKER_DIR, MARKER_FILE);
  }

  /** 项目级设置：<root>/.opentomato/settings.json */
  static settingsPath(root: string): string {
    return settingsPath(root, MARKER_DIR);
  }

  get settingsPath(): string {
    return ProjectStore.settingsPath(this.info.root);
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
    await ensureKindDirs(root);
    await fs.writeFile(
      ProjectStore.markerPath(root),
      `${JSON.stringify({ format: PROJECT_FORMAT, ...info }, null, 2)}\n`,
      "utf8",
    );
    await fs.writeFile(path.join(root, DOC_KINDS.brief.dir, `${DOC_KINDS.brief.normalizeId("")}.md`), BRIEF_SEED_BODY, "utf8");
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
    await ensureKindDirs(root);
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
    const out: DocHeader[] = [];
    for (const { id, abs } of await this.files(kind)) {
      const raw = await fs.readFile(abs, "utf8").catch(() => null);
      if (raw === null) continue;
      out.push(this.toHeader(kind, id, raw));
    }
    return out;
  }

  /** 某类下所有文档的 id 与绝对路径，按 id 排序；单例只看那一个文件，不扫项目根 */
  private async files(kind: DocKindId): Promise<Array<{ id: string; abs: string }>> {
    const def = DOC_KINDS[kind];
    if (def.singleton) {
      const id = def.normalizeId("");
      const abs = this.absPath(kind, id);
      return (await fs.access(abs).then(() => true, () => false)) ? [{ id, abs }] : [];
    }
    const dir = path.join(this.info.root, def.dir);
    let names: string[] = [];
    try {
      names = (await fs.readdir(dir)).filter((n) => n.endsWith(".md") && !n.startsWith("."));
    } catch {
      return [];
    }
    names.sort();
    return names.map((n) => ({ id: n.slice(0, -3), abs: path.join(dir, n) }));
  }

  /** 自动编号类型的下一个 id：现有最大编号 + 1 */
  async nextId(kind: DocKindId): Promise<string> {
    const max = (await this.files(kind)).reduce((m, f) => Math.max(m, Number(f.id) || 0), 0);
    return DOC_KINDS[kind].normalizeId(String(max + 1));
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
      for (const { id, abs } of await this.files(k)) {
        const raw = await fs.readFile(abs, "utf8").catch(() => null);
        if (raw === null) continue;
        const h = this.toHeader(k, id, raw);
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
    this.assertWritable(after);
    const nid = DOC_KINDS[kind].autoId && id.trim() === "" ? await this.nextId(kind) : this.normalizeId(kind, id);
    const rel = this.relPath(kind, nid);
    const before = (await fs.readFile(this.absPath(kind, nid), "utf8").catch(() => null)) ?? "";
    const normalized = after.endsWith("\n") ? after : `${after}\n`;
    const patch = createTwoFilesPatch(rel, rel, before, normalized, "", "", { context: 3 });
    const title = this.toHeader(kind, nid, normalized).title;
    return { kind, id: nid, path: rel, title, isNew: before === "", before, after: normalized, patch };
  }

  /**
   * 落盘。传了 expectBefore 就要求磁盘上现在还是这份内容（预览时读到的那份），
   * 不是就抛 StaleWriteError——审批悬着的时候作者手改了同一篇，不能被 approve 静默盖掉。
   */
  async write(kind: DocKindId, id: string, raw: string, opts: { expectBefore?: string } = {}): Promise<DocHeader> {
    this.assertWritable(raw);
    // 和 previewWrite 一致：自动编号类型传空 id 就分配下一个编号
    const nid = DOC_KINDS[kind].autoId && id.trim() === "" ? await this.nextId(kind) : this.normalizeId(kind, id);
    const abs = this.absPath(kind, nid);
    if (opts.expectBefore !== undefined) {
      const current = (await fs.readFile(abs, "utf8").catch(() => null)) ?? "";
      if (current !== opts.expectBefore) throw new StaleWriteError(this.relPath(kind, nid));
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const normalized = raw.endsWith("\n") ? raw : `${raw}\n`;
    await writeAtomic(abs, normalized);
    return this.toHeader(kind, nid, normalized);
  }

  // ───────────── 内部 ─────────────

  private assertWritable(raw: string) {
    const problem = frontmatterProblem(raw);
    if (problem) throw new Error(problem);
  }

  private toHeader(kind: DocKindId, id: string, raw: string): DocHeader {
    const { frontmatter } = parseFrontmatter(raw);
    const { title, summary, keywords, status, ...extra } = frontmatter;
    const header: DocHeader = {
      kind,
      id,
      path: this.relPath(kind, id),
      title: asString(title, id),
      summary: asString(summary),
      keywords: asStringArray(keywords),
      status: asString(status, "draft"),
      extra,
    };
    return header;
  }
}

/** 每类一个目录；单例（dir 为空）不建目录 */
async function ensureKindDirs(root: string) {
  for (const k of DOC_KIND_IDS) {
    const dir = DOC_KINDS[k].dir;
    if (dir !== "") await fs.mkdir(path.join(root, dir), { recursive: true });
  }
}

/** 英文目录 → 中文目录、英文守则文件名 → 中文；只在老目录存在且新目录为空时搬 */
async function migrateLegacyLayout(root: string) {
  const exists = (p: string) => fs.access(p).then(() => true, () => false);
  for (const k of DOC_KIND_IDS) {
    const legacy = LEGACY_DIRS[k];
    if (legacy === undefined) continue;
    const from = path.join(root, legacy);
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
  const guideDir = path.join(root, DOC_KINDS.rules.dir);
  for (const [en, zh] of Object.entries(LEGACY_GUIDE_IDS)) {
    const from = path.join(guideDir, `${en}.md`);
    const to = path.join(guideDir, `${zh}.md`);
    if ((await exists(from)) && !(await exists(to))) await fs.rename(from, to);
  }
  await migrateGuide(root);
}

/** 旧守则四份 → 简介.md + 守则/ 一条一卡 */
const LEGACY_GUIDE_RULES: Record<string, { level: string; scope: string }> = {
  铁律: { level: "必须", scope: "全局" },
  偏好: { level: "尽量", scope: "全局" },
  文风: { level: "尽量", scope: "文字" },
};

/**
 * 守则/立项.md 搬到项目根 简介.md；铁律 / 偏好 / 文风 三份按行拆成守则条目。
 * 只在旧文件存在时动，搬过就不再重复。
 */
async function migrateGuide(root: string) {
  const exists = (p: string) => fs.access(p).then(() => true, () => false);
  const rulesDir = path.join(root, DOC_KINDS.rules.dir);
  const legacyBrief = path.join(rulesDir, "立项.md");
  const brief = path.join(root, `${DOC_KINDS.brief.normalizeId("")}.md`);
  if (await exists(legacyBrief)) {
    if (!(await exists(brief))) {
      const raw = await fs.readFile(legacyBrief, "utf8");
      await fs.writeFile(brief, raw.replace(/^title:\s*立项简报\s*$/m, "title: 简介"), "utf8");
    }
    await fs.unlink(legacyBrief);
  }
  let next = 1;
  for (const n of (await fs.readdir(rulesDir).catch(() => [] as string[])).filter((n) => /^\d+\.md$/.test(n))) {
    next = Math.max(next, Number(n.slice(0, -3)) + 1);
  }
  for (const [name, meta] of Object.entries(LEGACY_GUIDE_RULES)) {
    const file = path.join(rulesDir, `${name}.md`);
    if (!(await exists(file))) continue;
    const { body } = parseFrontmatter(await fs.readFile(file, "utf8"));
    for (const item of legacyGuideItems(body)) {
      const id = DOC_KINDS.rules.normalizeId(String(next++));
      const raw = `---\ntitle: ${yamlScalar(item)}\nsummary: 待填\nkeywords: []\nstatus: draft\nlevel: ${meta.level}\nscope: ${meta.scope}\nsource: 迁移自旧 守则/${name}\n---\n`;
      await fs.writeFile(path.join(rulesDir, `${id}.md`), raw, "utf8");
    }
    await fs.unlink(file);
  }
}

/** 旧守则正文里的条目：列表项和普通文字行都算一条，标题 / 空行 / 「待定」「待填」不算 */
function legacyGuideItems(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim())
    .filter((l) => l !== "" && !l.startsWith("#") && l !== "待定" && l !== PLACEHOLDER);
}

function yamlScalar(s: string): string {
  return /^[\p{L}\p{N}][^#:\[\]{}"'`]*$/u.test(s) ? s : JSON.stringify(s);
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
