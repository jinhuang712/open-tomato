import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import type { CloudCheck, CloudProject, ProjectInfo } from "../protocol.js";
import type { CloudConfig } from "./config.js";
import { fingerprint, pack, unpack } from "./snapshot.js";
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
   * 返回项目根（就是 dest）。
   */
  async download(slug: string, dest: string): Promise<{ root: string; project: CloudProject }> {
    const manifest = await this.readManifest(slug);
    if (!manifest) throw new Error("云端没有这个项目的快照");
    const bytes = await this.storage.download(`${slug}/latest.tar.gz`);
    if (!bytes) throw new Error("云端快照文件缺失，请重新上传一次");
    await ensureEmptyDir(dest);
    await unpack(bytes, dest);
    return { root: dest, project: toProject(slug, manifest) };
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

async function ensureEmptyDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
  const entries = (await fs.readdir(dir)).filter((n) => n !== ".DS_Store");
  if (entries.length > 0) throw new Error(`目录不为空：${dir}`);
}
