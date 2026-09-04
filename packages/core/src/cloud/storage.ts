import type { CloudConfig } from "./config.js";

/**
 * Supabase Storage 的最小 REST 客户端：建 bucket、列对象、上传、下载、删除。
 * 只用 fetch，不引 supabase-js；fetch 可注入方便测试。
 */
export interface StorageObject {
  name: string;
  updatedAt: string | null;
  size: number | null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class StorageError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export class SupabaseStorage {
  constructor(
    private readonly config: CloudConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  get bucket(): string {
    return this.config.bucket;
  }

  /**
   * bucket 已存在就直接过；不存在才建成私有的。
   * 先 GET 再 POST，不靠「重复建」的报错文案判断，Supabase 各版本这句话不一样。
   */
  async ensureBucket(): Promise<void> {
    const got = await this.request("GET", `/storage/v1/bucket/${enc(this.config.bucket)}`);
    if (got.ok) return;
    if (got.status === 401 || got.status === 403) {
      throw new StorageError(got.status, `查 bucket 被拒（${got.status}）：service key 不对或没权限`);
    }
    const res = await this.request("POST", "/storage/v1/bucket", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: this.config.bucket, name: this.config.bucket, public: false }),
    });
    if (res.ok || res.status === 409) return;
    const text = await res.text();
    if (/already exists|duplicate/i.test(text)) return;
    throw new StorageError(res.status, `建 bucket 失败（${res.status}）：${short(text)}`);
  }

  /** 列出某前缀（目录）下的直接子项，翻页拿全 */
  async list(prefix: string): Promise<StorageObject[]> {
    const out: StorageObject[] = [];
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
      const res = await this.request("POST", `/storage/v1/object/list/${enc(this.config.bucket)}`, {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefix, limit, offset, sortBy: { column: "name", order: "asc" } }),
      });
      await this.assertOk(res, "列目录");
      const items = (await res.json()) as Array<{ name: string; updated_at?: string | null; metadata?: { size?: number } | null }>;
      for (const it of items) {
        out.push({ name: it.name, updatedAt: it.updated_at ?? null, size: it.metadata?.size ?? null });
      }
      if (items.length < limit) break;
    }
    return out;
  }

  async upload(objectPath: string, body: Uint8Array | string, contentType: string): Promise<void> {
    const res = await this.request("POST", `/storage/v1/object/${enc(this.config.bucket)}/${encPath(objectPath)}`, {
      headers: { "content-type": contentType, "x-upsert": "true" },
      body: typeof body === "string" ? body : new Blob([body as Uint8Array<ArrayBuffer>]),
    });
    await this.assertOk(res, `上传 ${objectPath}`);
  }

  /** 不存在返回 null */
  async download(objectPath: string): Promise<Uint8Array | null> {
    const res = await this.request("GET", `/storage/v1/object/${enc(this.config.bucket)}/${encPath(objectPath)}`);
    if (res.status === 404 || res.status === 400) return null;
    await this.assertOk(res, `下载 ${objectPath}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async downloadText(objectPath: string): Promise<string | null> {
    const bytes = await this.download(objectPath);
    return bytes ? new TextDecoder().decode(bytes) : null;
  }

  async remove(objectPaths: string[]): Promise<void> {
    if (objectPaths.length === 0) return;
    const res = await this.request("DELETE", `/storage/v1/object/${enc(this.config.bucket)}`, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefixes: objectPaths }),
    });
    await this.assertOk(res, "删除对象");
  }

  private async request(method: string, pathname: string, init: RequestInit = {}): Promise<Response> {
    const headers = {
      authorization: `Bearer ${this.config.serviceKey}`,
      apikey: this.config.serviceKey,
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };
    try {
      return await this.fetchImpl(`${this.config.url}${pathname}`, { ...init, method, headers });
    } catch (e) {
      throw new StorageError(0, `连不上 Supabase：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async assertOk(res: Response, what: string) {
    if (res.ok) return;
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new StorageError(res.status, `${what}被拒（${res.status}）：service key 不对或没权限`);
    throw new StorageError(res.status, `${what}失败（${res.status}）：${short(text)}`);
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

function encPath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

function short(s: string): string {
  return s.replace(/\s+/g, " ").slice(0, 200);
}
