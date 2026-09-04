import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * 云端存储凭据，落在 <home>/cloud.json。
 * home 在本机用户目录下，不在任何仓库里；service key 只在内核进程里用，不发给渲染层。
 */
export interface CloudConfig {
  /** Supabase 项目地址，形如 https://xxxx.supabase.co */
  url: string;
  /** service_role key；单用户不做 Auth，直接用它读写私有 bucket */
  serviceKey: string;
  /** 存快照的 bucket 名 */
  bucket: string;
}

export const CLOUD_CONFIG_FILE = "cloud.json";
export const DEFAULT_BUCKET = "projects";

export function cloudConfigPath(home: string): string {
  return path.join(home, CLOUD_CONFIG_FILE);
}

/** 文件不存在、坏掉、字段缺失都视为「未配置」，返回 null */
export async function readCloudConfig(file: string): Promise<CloudConfig | null> {
  try {
    return normalize(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    return null;
  }
}

export async function writeCloudConfig(file: string, config: CloudConfig): Promise<CloudConfig> {
  const next = normalizeCloudConfig(config);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(file, 0o600).catch(() => {});
  return next;
}

export async function clearCloudConfig(file: string): Promise<void> {
  await fs.rm(file, { force: true });
}

/** 校验并整理；不合格直接抛，给 UI 一句能读的话 */
export function normalizeCloudConfig(input: unknown): CloudConfig {
  const next = normalize(input);
  if (!next) throw new Error("云端配置不完整：Project URL 要是 https://xxx.supabase.co 这样的地址，Secret key 不能为空");
  if (/^sb_publishable_/.test(next.serviceKey)) {
    throw new Error("这是 Publishable key，只能公开读。要 Project Settings → API Keys 里的 Secret key（sb_secret_…）");
  }
  return next;
}

function normalize(input: unknown): CloudConfig | null {
  const obj = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const url = typeof obj.url === "string" ? obj.url.trim().replace(/\/+$/, "") : "";
  const serviceKey = typeof obj.serviceKey === "string" ? obj.serviceKey.trim() : "";
  const bucket = typeof obj.bucket === "string" && obj.bucket.trim() ? obj.bucket.trim() : DEFAULT_BUCKET;
  if (!/^https?:\/\/[^\s/]+$/.test(url) || !serviceKey) return null;
  return { url, serviceKey, bucket };
}
