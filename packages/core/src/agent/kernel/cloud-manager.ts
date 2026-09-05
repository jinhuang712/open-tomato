import { cloudConfigPath, clearCloudConfig, normalizeCloudConfig, readCloudConfig, writeCloudConfig, type CloudConfig } from "../../cloud/config.js";
import { CloudSync } from "../../cloud/sync.js";
import type { CloudStatus, KernelEvent, ProjectInfo } from "../../protocol.js";

/** 定期云端同步间隔：10 分钟 */
const CLOUD_SYNC_INTERVAL_MS = 10 * 60_000;

/**
 * 云端快照状态机：配置、定时器、忙闲、同步位全收拢在这里。
 * 不碰 Kernel 的私有状态：当前项目以参数进（info），存活判断由调用方给 isCurrent，
 * 事件经构造时注入的 emit 发出去。
 */
export class CloudManager {
  private config: CloudConfig | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  /** 当前项目本地内容是否已在云端：null = 未知（没配云端 / 还没比对） */
  private synced: boolean | null = null;

  constructor(
    private readonly home: string,
    private readonly emit: (event: KernelEvent) => void,
  ) {}

  /** 启动时读一次已存配置 */
  async load() {
    this.config = await readCloudConfig(cloudConfigPath(this.home));
  }

  status(): CloudStatus {
    return { configured: this.config !== null, url: this.config?.url ?? null, bucket: this.config?.bucket ?? null };
  }

  requireCloud(): CloudSync {
    if (!this.config) throw new Error("还没有配置云端存储");
    return new CloudSync(this.config);
  }

  /** 先连一次再落盘：连不上就不留下坏配置，旧配置原样保留 */
  async configure(url: string, serviceKey: string, bucket: string): Promise<CloudStatus> {
    const next = normalizeCloudConfig({ url, serviceKey, bucket });
    await new CloudSync(next).verify();
    await writeCloudConfig(cloudConfigPath(this.home), next);
    this.config = next;
    return this.status();
  }

  async clear(): Promise<CloudStatus> {
    await clearCloudConfig(cloudConfigPath(this.home));
    this.config = null;
    this.stop();
    return this.status();
  }

  /** 上传当前项目；同一时刻只跑一份，进度用 cloud.sync 事件广播 */
  async upload(info: ProjectInfo, force: boolean) {
    const cloud = this.requireCloud();
    if (this.busy) throw new Error("上一次同步还没结束");
    this.busy = true;
    this.emit({ type: "cloud.sync", phase: "uploading", message: null, last: null, synced: this.synced });
    try {
      const last = await cloud.upload(info, { force });
      this.synced = true;
      this.emit({ type: "cloud.sync", phase: "idle", message: null, last, synced: true });
      return last;
    } catch (e) {
      this.emit({ type: "cloud.sync", phase: "error", message: e instanceof Error ? e.message : String(e), last: null, synced: this.synced });
      throw e;
    } finally {
      this.busy = false;
    }
  }

  /** 项目打开时和云端比一次；项目切走后回来的晚结果直接丢掉（isCurrent 说了算） */
  async recheck(info: ProjectInfo, isCurrent: () => boolean) {
    if (!this.config) return;
    try {
      const check = await new CloudSync(this.config).check(info);
      if (!isCurrent()) return;
      this.synced = check.synced;
      this.emit({ type: "cloud.sync", phase: "idle", message: null, last: check.remote, synced: check.synced });
    } catch (e) {
      if (!isCurrent()) return;
      this.emit({ type: "cloud.sync", phase: "error", message: e instanceof Error ? e.message : String(e), last: null, synced: null });
    }
  }

  /** 文档落盘 / 会话有新内容：本地肯定比云端新了 */
  markDirty() {
    if (!this.config || this.synced === false) return;
    this.synced = false;
    this.emit({ type: "cloud.sync", phase: "idle", message: null, last: null, synced: false });
  }

  /** 云端快照被删：本地肯定不在云端了，无条件广播一次 */
  markUnsynced() {
    this.synced = false;
    this.emit({ type: "cloud.sync", phase: "idle", message: null, last: null, synced: false });
  }

  /** 项目打开且配好云端时，每 CLOUD_SYNC_INTERVAL_MS 静默同步一次；内容没变不会真的上传 */
  start(getInfo: () => ProjectInfo | null) {
    this.stop();
    if (!this.config) return;
    this.timer = setInterval(() => {
      const info = getInfo();
      if (!info || this.busy) return;
      void this.upload(info, false).catch(() => {});
    }, CLOUD_SYNC_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** 关项目：同步状态回到未知，不广播（界面随 project.closed 重置） */
  reset() {
    this.synced = null;
  }
}
