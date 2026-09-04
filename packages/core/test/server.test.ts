import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * server stdio 调试模式：stdin 关了也要等在途请求落定、刷完 stdout 再退出。
 * 顺序发四个请求（建项目→写大正文→机检→读回大正文），最后一条发出后立刻关 stdin，
 * 要求 exit 0、每个请求都有响应、每行都是完整 JSON（尾巴没被截断）。
 * 注意：stdio 一次只发一条等回包再发下一条——并发请求的顺序本接口不保证（见 P2-6）。
 */
describe("server stdio", () => {
  test("关 stdin 后所有响应落定且完整", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "ot-srv-home-"));
    const root = path.join(os.tmpdir(), `ot-srv-proj-${Date.now()}`);
    const big = `---\ntitle: 大章\nsummary: s\nkeywords: []\nstatus: draft\nwords: 100000\n---\n\n${"啊".repeat(60_000)}\n`;
    const proc = Bun.spawn(["bun", "src/server.ts"], {
      cwd: path.join(import.meta.dir, ".."),
      env: { ...process.env, OPENTOMATO_HOME: home },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const writer = proc.stdin;
    const pending = new Map<string, (v: any) => void>();
    const lines: string[] = [];
    let buf = "";
    const pump = (async () => {
      const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          lines.push(line);
          // 截断的行在这里直接抛错，就是要测的
          const msg = JSON.parse(line);
          if (msg.kind === "response" && pending.has(msg.id)) {
            pending.get(msg.id)!(msg);
            pending.delete(msg.id);
          }
        }
      }
      if (buf.trim() !== "") JSON.parse(buf);
    })();

    const send = (id: string, method: string, params: unknown) =>
      new Promise<any>((resolve) => {
        pending.set(id, resolve);
        writer.write(`${JSON.stringify({ kind: "request", id, method, params })}\n`);
      });

    try {
      const r1: any = await send("1", "project.create", { root, name: "t" });
      expect(r1.ok).toBe(true);
      const r2: any = await send("2", "doc.write", { kind: "manuscript", id: "1", raw: big });
      expect(r2.ok).toBe(true);
      const r3: any = await send("3", "check.run", {});
      expect(r3.ok).toBe(true);
      // 最后一条不等待：发出就关 stdin，让它走 drain 路径
      const r4 = send("4", "doc.read", { kind: "manuscript", id: "1" });
      await writer.end();
      const read: any = await r4;
      expect(read.ok).toBe(true);
      expect((read.result?.raw as string | undefined)?.length).toBeGreaterThan(60_000);

      const [code] = await Promise.all([proc.exited, pump]);
      const err = await new Response(proc.stderr).text();
      expect(err).not.toContain("uncaught");
      expect(code).toBe(0);
      expect(lines.length).toBeGreaterThan(4);
    } finally {
      await fs.rm(home, { recursive: true, force: true });
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 60_000);
});
