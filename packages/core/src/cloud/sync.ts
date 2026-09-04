import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CloudCheck, CloudProject, CloudProjectRow, ProjectInfo } from "../protocol.js";
import type { CloudConfig } from "./config.js";
import { fingerprint, listSnapshotFiles, pack, unpack } from "./snapshot.js";
import { SupabaseStorage, type FetchLike } from "./storage.js";

/**
 * bucket 内布局：
 *   <slug>/manifest.json      最近一次上传的元信息
 *   <slug>/latest.tar.gz      最近一次快照
 *   <slug>/history/<ts>.tar.gz 历史快照，只留最近 HISTORY_KEEP 份
 * slug 由项目名 hash 得来（对象名不吃中文），真名放 manifest 里。
 */
const MANIFEST_FORMAT = 1;
const HISTORY_KEEP = 5;

interface Manifest {
  format: number;
  name: string;
  fingerprint: string;
  uploadedAt: string;
  size: number;
  host: string;
  /** 上传时项目在那台机器上的路径，只作展示参考 */
  root: string;
}

export function projectSlug(name: string): string {
  return `p-${createHash("sha1").update(name.normalize("NFC")).digest("hex").slice(0, 16)}`;
}

export class CloudSync {
  readonly storage: SupabaseStorage;

  constructor(config: CloudConfig, fetchImpl?: FetchLike) {
    this.storage = new SupabaseStorage(config, fetchImpl);
  }

  /** 校验凭据可用：能建 / 看到 bucket 就算通 */
  async verify(): Promise<void> {
    await this.storage.ensureBucket();
    await this.storage.list("");
  }

  async list(): Promise<CloudProject[]> {
    const dirs = await this.storage.list("");
    const out: CloudProject[] = [];
    for (const d of dirs) {
      if (!d.name.startsWith("p-")) continue;
      const m = await this.readManifest(d.name);
      if (m) out.push(toProject(d.name, m));
    }
    out.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
    return out;
  }

  /**
   * 云端列表按项目名对上本机项目：readLocalName 给出某个本地根目录的项目名（不是项目返回 null）。
   * 对上的再算指纹判断本机是不是最新。
   */
  async listWithLocals(localRoots: string[], readLocalName: (root: string) => Promise<string | null>): Promise<CloudProjectRow[]> {
    const remote = await this.list();
    const byName = new Map<string, string>();
    for (const root of localRoots) {
      const name = await readLocalName(root).catch(() => null);
      if (name && !byName.has(name)) byName.set(name, root);
    }
    const rows: CloudProjectRow[] = [];
    for (const r of remote) {
      const root = byName.get(r.name);
      if (!root) {
        rows.push({ ...r, local: null });
        continue;
      }
      const synced = await fingerprint(root)
        .then((fp) => fp === r.fingerprint)
        .catch(() => false);
      rows.push({ ...r, local: { root, synced } });
    }
    return rows;
  }

  /** 本地与云端是否一致；云端没有则 remote 为 null */
  async check(info: ProjectInfo): Promise<CloudCheck> {
    const slug = projectSlug(info.name);
    const [local, manifest] = await Promise.all([fingerprint(info.root), this.readManifest(slug)]);
    return {
      slug,
      localFingerprint: local,
      remote: manifest ? toProject(slug, manifest) : null,
      synced: manifest?.fingerprint === local,
    };
  }

  /** 打包上传；内容与云端一致时直接返回云端记录，不重传 */
  async upload(info: ProjectInfo, opts: { force?: boolean } = {}): Promise<CloudProject> {
    const slug = projectSlug(info.name);
    const local = await fingerprint(info.root);
    const existing = await this.readManifest(slug);
    if (!opts.force && existing && existing.fingerprint === local) return toProject(slug, existing);

    const bytes = await pack(info.root);
    const uploadedAt = new Date().toISOString();
    const manifest: Manifest = {
      format: MANIFEST_FORMAT,
      name: info.name,
      fingerprint: local,
      uploadedAt,
      size: bytes.byteLength,
      host: os.hostname(),
      root: info.root,
    };
    await this.storage.ensureBucket();
    await this.storage.upload(`${slug}/latest.tar.gz`, bytes, "application/gzip");
    await this.storage.upload(`${slug}/history/${uploadedAt.replace(/[:.]/g, "-")}.tar.gz`, bytes, "application/gzip");
    await this.storage.upload(`${slug}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, "application/json");
    await this.pruneHistory(slug).catch(() => {});
    return toProject(slug, manifest);
  }

  /**
   * 下载并解到 dest。dest 不存在会建；已存在则要求为空目录，否则报错让调用方选别处。
   * replace 为 true 时允许 dest 是已有项目：先清掉快照会覆盖范围内的文件（.git 等不动）再解。
   * 返回项目根（就是 dest）。
   */
  async download(slug: string, dest: string, opts: { replace?: boolean } = {}): Promise<{ root: string; project: CloudProject }> {
    const manifest = await this.readManifest(slug);
    if (!manifest) throw new Error("云端没有这个项目的快照");
    const bytes = await this.storage.download(`${slug}/latest.tar.gz`);
    if (!bytes) throw new Error("云端快照文件缺失，请重新上传一次");
    if (opts.replace) await clearSnapshotFiles(dest);
    else await ensureEmptyDir(dest);
    await unpack(bytes, dest);
    return { root: dest, project: toProject(slug, manifest) };
  }

  /** 删掉某个项目在云端的全部对象（manifest、latest、history）；云端本来没有也算成功 */
  async removeProject(slug: string): Promise<void> {
    const paths = await this.storage.listRecursive(slug);
    await this.storage.remove(paths);
  }

  /** 清空整个 bucket 里的项目快照。返回清掉的项目数 */
  async wipe(): Promise<number> {
    const dirs = await this.storage.list("");
    const slugs = dirs.filter((d) => d.name.startsWith("p-")).map((d) => d.name);
    for (const slug of slugs) await this.removeProject(slug);
    return slugs.length;
  }

  private async readManifest(slug: string): Promise<Manifest | null> {
    const text = await this.storage.downloadText(`${slug}/manifest.json`);
    if (!text) return null;
    try {
      const m = JSON.parse(text) as Partial<Manifest>;
      if (typeof m.name !== "string" || typeof m.fingerprint !== "string" || typeof m.uploadedAt !== "string") return null;
      return {
        format: typeof m.format === "number" ? m.format : 1,
        name: m.name,
        fingerprint: m.fingerprint,
        uploadedAt: m.uploadedAt,
        size: typeof m.size === "number" ? m.size : 0,
        host: typeof m.host === "string" ? m.host : "",
        root: typeof m.root === "string" ? m.root : "",
      };
    } catch {
      return null;
    }
  }

  private async pruneHistory(slug: string) {
    const items = await this.storage.list(`${slug}/history`);
    const names = items.map((i) => i.name).sort();
    const stale = names.slice(0, Math.max(0, names.length - HISTORY_KEEP));
    await this.storage.remove(stale.map((n) => `${slug}/history/${n}`));
  }
}

function toProject(slug: string, m: Manifest): CloudProject {
  return { slug, name: m.name, uploadedAt: m.uploadedAt, size: m.size, host: m.host, fingerprint: m.fingerprint };
}

/** 删掉快照会包含的那些文件（与 pack 同一套过滤），.git 与忽略项保留；空目录顺手清掉 */
async function clearSnapshotFiles(root: string) {
  await fs.mkdir(root, { recursive: true });
  const files = await listSnapshotFiles(root);
  for (const f of files) await fs.rm(path.join(root, f.rel), { force: true });
  const dirs = new Set(files.map((f) => path.dirname(f.rel)).filter((d) => d !== "."));
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    await fs.rmdir(path.join(root, d)).catch(() => {});
  }
}

async function ensureEmptyDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
  const entries = (await fs.readdir(dir)).filter((n) => n !== ".DS_Store");
  if (entries.length > 0) throw new Error(`目录不为空：${dir}`);
}
