import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import * as tar from "tar";

/**
 * 项目快照：把项目根目录打成 tar.gz，或从 tar.gz 解回目录。
 * 会话记录（.opentomato/sessions）一起带走，在家能接着聊；.git 与系统垃圾不带。
 */

/** 跳过的顶层 / 任意层目录与文件 */
const SKIP_DIRS = new Set([".git", "node_modules"]);
const SKIP_FILES = new Set([".DS_Store", "Thumbs.db"]);
/** ProjectStore.writeAtomic 留下的临时文件形如 .xxx.<pid>.<ts>.tmp */
const TMP_PATTERN = /^\..*\.\d+\.\d+\.tmp$/;

export interface SnapshotEntry {
  /** 相对项目根、正斜杠分隔 */
  rel: string;
  size: number;
}

function shouldSkip(name: string): boolean {
  return SKIP_DIRS.has(name) || SKIP_FILES.has(name) || TMP_PATTERN.test(name);
}

/** 列出快照会包含的文件，按路径排序保证指纹稳定 */
export async function listSnapshotFiles(root: string): Promise<SnapshotEntry[]> {
  const out: SnapshotEntry[] = [];
  async function walk(dir: string, relBase: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (shouldSkip(ent.name)) continue;
      const abs = path.join(dir, ent.name);
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      if (ent.isDirectory()) await walk(abs, rel);
      else if (ent.isFile()) out.push({ rel, size: (await fs.stat(abs)).size });
    }
  }
  await walk(root, "");
  out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return out;
}

/**
 * 内容指纹：所有包含文件的 (路径, sha256) 再整体 sha256。
 * 两台机器同一份内容算出来一样，与 mtime 无关；用它判断「本地最新是否已经在云端」。
 */
export async function fingerprint(root: string): Promise<string> {
  const files = await listSnapshotFiles(root);
  const h = createHash("sha256");
  for (const f of files) {
    const fh = createHash("sha256").update(await fs.readFile(path.join(root, f.rel))).digest("hex");
    h.update(`${f.rel}\0${fh}\n`);
  }
  return h.digest("hex");
}

/** 打包成 tar.gz 字节 */
export async function pack(root: string): Promise<Uint8Array> {
  const files = await listSnapshotFiles(root);
  const stream = tar.c({ gzip: true, cwd: root, portable: true, follow: false }, files.map((f) => f.rel)) as unknown as Readable;
  return collect(stream);
}

/** 解到 dest（必须已存在且为空目录，或由调用方保证可覆盖）；拒绝任何越界路径 */
export async function unpack(bytes: Uint8Array, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const resolvedDest = path.resolve(dest);
  const extractor = tar.x({
    cwd: dest,
    filter: (p) => {
      const target = path.resolve(dest, p);
      return target === resolvedDest || target.startsWith(`${resolvedDest}${path.sep}`);
    },
  });
  await new Promise<void>((resolve, reject) => {
    extractor.on("error", reject);
    extractor.on("finish", () => resolve());
    const input = new PassThrough();
    input.end(Buffer.from(bytes));
    input.pipe(extractor as unknown as NodeJS.WritableStream);
  });
}

async function collect(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  const all = Buffer.concat(chunks);
  return new Uint8Array(all.buffer, all.byteOffset, all.byteLength);
}
