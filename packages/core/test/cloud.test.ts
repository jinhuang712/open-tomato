import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cloudConfigPath, readCloudConfig, writeCloudConfig } from "../src/cloud/config.js";
import { fingerprint, listSnapshotFiles, pack, unpack } from "../src/cloud/snapshot.js";
import { CloudSync, projectSlug } from "../src/cloud/sync.js";
import { SupabaseStorage, type FetchLike } from "../src/cloud/storage.js";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "opentomato-cloud-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function seedProject(root: string) {
  await fs.mkdir(path.join(root, ".opentomato", "sessions", "lead"), { recursive: true });
  await fs.mkdir(path.join(root, "人物"), { recursive: true });
  await fs.mkdir(path.join(root, ".git"), { recursive: true });
  await fs.writeFile(path.join(root, ".opentomato", "project.json"), '{"name":"测试"}\n');
  await fs.writeFile(path.join(root, ".opentomato", "sessions", "lead", "a.jsonl"), '{"x":1}\n');
  await fs.writeFile(path.join(root, "人物", "主角.md"), "---\ntitle: 主角\n---\n正文");
  await fs.writeFile(path.join(root, ".git", "HEAD"), "ref: x");
  await fs.writeFile(path.join(root, ".DS_Store"), "junk");
  await fs.writeFile(path.join(root, ".主角.md.123.456.tmp"), "half");
}

describe("cloud config", () => {
  test("未配置时为 null，写入后读回一致且去掉尾斜杠，文件权限 600", async () => {
    const file = cloudConfigPath(dir);
    expect(await readCloudConfig(file)).toBeNull();
    await writeCloudConfig(file, { url: "https://abc.supabase.co/", serviceKey: "k", bucket: "" });
    expect(await readCloudConfig(file)).toEqual({ url: "https://abc.supabase.co", serviceKey: "k", bucket: "projects" });
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
  });

  test("url 不合法就拒绝", async () => {
    await expect(writeCloudConfig(cloudConfigPath(dir), { url: "abc", serviceKey: "k", bucket: "" })).rejects.toThrow();
  });
});

describe("snapshot", () => {
  test("跳过 .git / .DS_Store / 临时文件，带上会话记录", async () => {
    await seedProject(dir);
    const files = (await listSnapshotFiles(dir)).map((f) => f.rel);
    expect(files).toEqual([".opentomato/project.json", ".opentomato/sessions/lead/a.jsonl", "人物/主角.md"]);
  });

  test("打包后解包内容一致，指纹一致；改动后指纹变化", async () => {
    await seedProject(dir);
    const bytes = await pack(dir);
    const dest = path.join(dir, "..", `${path.basename(dir)}-out`);
    try {
      await unpack(bytes, dest);
      expect(await fs.readFile(path.join(dest, "人物", "主角.md"), "utf8")).toBe("---\ntitle: 主角\n---\n正文");
      expect(await fingerprint(dest)).toBe(await fingerprint(dir));
      await fs.writeFile(path.join(dest, "人物", "主角.md"), "改了");
      expect(await fingerprint(dest)).not.toBe(await fingerprint(dir));
    } finally {
      await fs.rm(dest, { recursive: true, force: true });
    }
  });
});

/** 内存版 Storage REST：只实现本项目用到的几条路径 */
function fakeSupabase() {
  const objects = new Map<string, Uint8Array>();
  const buckets = new Set<string>();
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (input, init = {}) => {
    const url = new URL(input);
    const method = (init.method ?? "GET").toUpperCase();
    calls.push(`${method} ${url.pathname}`);
    if ((init.headers as Record<string, string>).authorization !== "Bearer secret") return new Response("nope", { status: 401 });
    const m = url.pathname.match(/^\/storage\/v1\/(bucket|object)(?:\/(list))?(?:\/([^/]+))?(?:\/(.*))?$/);
    if (!m) return new Response("bad", { status: 404 });
    const [, kind, isList, name, rest] = m;
    if (kind === "bucket") {
      if (method === "GET") return buckets.has(name ?? "") ? Response.json({ id: name }) : new Response("Bucket not found", { status: 404 });
      const body = JSON.parse(init.body as string) as { id: string };
      // 真实 Supabase 对重复建返回 400 + 一句措辞不固定的话；这里故意用一句代码没匹配的，逼 ensureBucket 走 GET 判断
      if (buckets.has(body.id)) return new Response(JSON.stringify({ message: "Bucket name taken" }), { status: 400 });
      buckets.add(body.id);
      return new Response("{}", { status: 200 });
    }
    if (isList) {
      const { prefix } = JSON.parse(init.body as string) as { prefix: string };
      const base = prefix ? `${prefix.replace(/\/$/, "")}/` : "";
      const names = new Set<string>();
      for (const key of objects.keys()) {
        if (!key.startsWith(base)) continue;
        names.add(key.slice(base.length).split("/")[0]!);
      }
      return Response.json([...names].map((name) => ({ name, updated_at: null, metadata: { size: 1 } })));
    }
    const key = decodeURIComponent(rest ?? "");
    if (method === "POST") {
      const body = init.body;
      const bytes = typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(await (body as Blob).arrayBuffer());
      objects.set(key, bytes);
      return new Response("{}", { status: 200 });
    }
    if (method === "GET") {
      const v = objects.get(key);
      return v ? new Response(v as Uint8Array<ArrayBuffer>, { status: 200 }) : new Response("not found", { status: 404 });
    }
    if (method === "DELETE") {
      for (const p of (JSON.parse(init.body as string) as { prefixes: string[] }).prefixes) objects.delete(p);
      return new Response("[]", { status: 200 });
    }
    return new Response("bad", { status: 400 });
  };
  return { objects, calls, fetchImpl };
}

const config = { url: "https://abc.supabase.co", serviceKey: "secret", bucket: "projects" };

describe("storage", () => {
  test("key 不对时报可读错误", async () => {
    const fake = fakeSupabase();
    const s = new SupabaseStorage({ ...config, serviceKey: "wrong" }, fake.fetchImpl);
    await expect(s.list("")).rejects.toThrow(/service key 不对/);
  });

  test("bucket 已存在视为成功，且不再重复 POST 建", async () => {
    const fake = fakeSupabase();
    const s = new SupabaseStorage(config, fake.fetchImpl);
    await s.ensureBucket();
    await s.ensureBucket();
    expect(fake.calls.filter((c) => c === "POST /storage/v1/bucket")).toHaveLength(1);
  });
});

describe("cloud sync", () => {
  test("上传 → 列表 → 校验一致 → 内容不变不重传 → 改动后重传 → 下载还原", async () => {
    const root = path.join(dir, "book");
    await seedProject(root);
    const info = { root, name: "测试", createdAt: "2026-01-01T00:00:00.000Z" };
    const fake = fakeSupabase();
    const cloud = new CloudSync(config, fake.fetchImpl);

    const first = await cloud.upload(info);
    expect(first.name).toBe("测试");
    expect(first.slug).toBe(projectSlug("测试"));
    expect([...fake.objects.keys()].filter((k) => k.endsWith(".tar.gz"))).toHaveLength(2);

    const listed = await cloud.list();
    expect(listed.map((p) => p.name)).toEqual(["测试"]);

    expect((await cloud.check(info)).synced).toBe(true);

    const isUpload = (c: string) => c.startsWith("POST /storage/v1/object/projects/");
    const uploadsBefore = fake.calls.filter(isUpload).length;
    await cloud.upload(info);
    expect(fake.calls.filter(isUpload).length).toBe(uploadsBefore);

    await fs.writeFile(path.join(root, "人物", "主角.md"), "改了");
    expect((await cloud.check(info)).synced).toBe(false);
    const second = await cloud.upload(info);
    expect(second.fingerprint).not.toBe(first.fingerprint);

    const dest = path.join(dir, "home-copy");
    const { root: got } = await cloud.download(second.slug, dest);
    expect(got).toBe(dest);
    expect(await fs.readFile(path.join(dest, "人物", "主角.md"), "utf8")).toBe("改了");
    expect((await cloud.check({ ...info, root: dest })).synced).toBe(true);
  });

  test("目标目录非空时拒绝下载", async () => {
    const root = path.join(dir, "book");
    await seedProject(root);
    const fake = fakeSupabase();
    const cloud = new CloudSync(config, fake.fetchImpl);
    const up = await cloud.upload({ root, name: "测试", createdAt: "" });
    await expect(cloud.download(up.slug, root)).rejects.toThrow(/不为空/);
  });

  test("历史快照只留 5 份", async () => {
    const root = path.join(dir, "book");
    await seedProject(root);
    const fake = fakeSupabase();
    const cloud = new CloudSync(config, fake.fetchImpl);
    const info = { root, name: "测试", createdAt: "" };
    for (let i = 0; i < 7; i++) {
      await fs.writeFile(path.join(root, "人物", "主角.md"), `v${i}`);
      await cloud.upload(info);
      await new Promise((r) => setTimeout(r, 2));
    }
    expect([...fake.objects.keys()].filter((k) => k.includes("/history/"))).toHaveLength(5);
  });
});

describe("cloud sync · 本机关系与覆盖", () => {
  test("listWithLocals 按名字对上本机项目并给出是否最新", async () => {
    const root = path.join(dir, "book");
    await seedProject(root);
    const fake = fakeSupabase();
    const cloud = new CloudSync(config, fake.fetchImpl);
    await cloud.upload({ root, name: "测试", createdAt: "" });
    const other = path.join(dir, "other");
    await seedProject(other);
    await cloud.upload({ root: other, name: "别的", createdAt: "" });
    await fs.writeFile(path.join(other, "人物", "主角.md"), "改了");

    const names: Record<string, string> = { [root]: "测试", [other]: "别的" };
    const rows = await cloud.listWithLocals([root, other, path.join(dir, "nope")], async (r) => names[r] ?? null);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.local]));
    expect(byName["测试"]).toEqual({ root, synced: true });
    expect(byName["别的"]).toEqual({ root: other, synced: false });
  });

  test("replace 覆盖已有项目：快照范围内文件被替换，.git 保留", async () => {
    const root = path.join(dir, "book");
    await seedProject(root);
    const fake = fakeSupabase();
    const cloud = new CloudSync(config, fake.fetchImpl);
    const up = await cloud.upload({ root, name: "测试", createdAt: "" });
    await fs.writeFile(path.join(root, "人物", "主角.md"), "本地乱改");
    await fs.writeFile(path.join(root, "人物", "多出来的.md"), "本地新增");
    await cloud.download(up.slug, root, { replace: true });
    expect(await fs.readFile(path.join(root, "人物", "主角.md"), "utf8")).toBe("---\ntitle: 主角\n---\n正文");
    await expect(fs.access(path.join(root, "人物", "多出来的.md"))).rejects.toThrow();
    expect(await fs.readFile(path.join(root, ".git", "HEAD"), "utf8")).toBe("ref: x");
  });
});
