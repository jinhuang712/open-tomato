import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { ModelInfo, ModelsState, ProviderInfo, ThinkingLevel } from "../protocol.js";

interface Persisted {
  model: { provider: string; id: string } | null;
  thinkingLevel: ThinkingLevel;
  recentProjects: string[];
}

const DEFAULT_PERSISTED: Persisted = { model: null, thinkingLevel: "off", recentProjects: [] };

/**
 * 模型选择器底座：包一层 pi 的 ModelRuntime。
 * 凭据、自定义 provider、模型目录缓存全部沿用 pi 自己的 ~/.pi/agent；
 * 本应用只在 <home>/state.json 记模型选择和最近项目。
 */
export class ModelsFacade {
  private persisted: Persisted = { ...DEFAULT_PERSISTED };
  private availableIds = new Set<string>();

  private constructor(
    public readonly runtime: ModelRuntime,
    private readonly statePath: string,
  ) {}

  /** pi 自己的配置目录：凭据与自定义 provider 直接用 pi 的 */
  static piAgentDir(): string {
    return path.join(os.homedir(), ".pi", "agent");
  }

  static async create(home: string): Promise<ModelsFacade> {
    await fs.mkdir(home, { recursive: true });
    const runtime = await ModelRuntime.create();
    const facade = new ModelsFacade(runtime, path.join(home, "state.json"));
    await facade.load();
    await facade.refreshAvailability();
    return facade;
  }

  // ───────────── 状态 ─────────────

  get thinkingLevel(): ThinkingLevel {
    return this.persisted.thinkingLevel;
  }

  get recentProjects(): string[] {
    return [...this.persisted.recentProjects];
  }

  async rememberProject(root: string) {
    this.persisted.recentProjects = [root, ...this.persisted.recentProjects.filter((r) => r !== root)].slice(0, 10);
    await this.save();
  }

  /** 当前选中的模型；没选或选的已不可用时退到第一个可用的 */
  currentModel(): Model<Api> | undefined {
    const want = this.persisted.model;
    if (want) {
      const m = this.runtime.getModel(want.provider, want.id);
      if (m) return m;
    }
    const first = this.runtime.getAvailableSnapshot()[0];
    return first;
  }

  state(): ModelsState {
    const providers: ProviderInfo[] = this.runtime.getProviders().map((p) => ({
      id: p.id,
      name: p.name,
      configured: this.runtime.hasConfiguredAuth(p.id),
      modelCount: this.runtime.getModels(p.id).length,
    }));
    const models: ModelInfo[] = this.runtime.getModels().map((m) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      contextWindow: m.contextWindow,
      available: this.availableIds.has(`${m.provider}/${m.id}`),
    }));
    const cur = this.currentModel();
    return {
      providers,
      models,
      current: cur ? { provider: cur.provider, id: cur.id } : null,
      thinkingLevel: this.persisted.thinkingLevel,
    };
  }

  // ───────────── 操作 ─────────────

  async select(provider: string, id: string, thinkingLevel?: ThinkingLevel): Promise<Model<Api>> {
    const m = this.runtime.getModel(provider, id);
    if (!m) throw new Error(`没有这个模型：${provider}/${id}`);
    this.persisted.model = { provider, id };
    if (thinkingLevel) this.persisted.thinkingLevel = m.reasoning ? thinkingLevel : "off";
    await this.save();
    return m;
  }

  async setApiKey(provider: string, apiKey: string) {
    const key = apiKey.trim();
    if (key === "") throw new Error("API key 为空");
    await this.runtime.login(provider, "api_key", {
      prompt: async () => key,
      notify: () => {},
    });
    await this.refreshAvailability();
  }

  async refresh() {
    await this.runtime.refresh({ allowNetwork: true, signal: AbortSignal.timeout(15_000) });
    await this.refreshAvailability();
  }

  // ───────────── 内部 ─────────────

  private async refreshAvailability() {
    const avail = await this.runtime.getAvailable();
    this.availableIds = new Set(avail.map((m) => `${m.provider}/${m.id}`));
  }

  private async load() {
    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<Persisted>;
      this.persisted = {
        model: parsed.model ?? null,
        thinkingLevel: parsed.thinkingLevel ?? "off",
        recentProjects: Array.isArray(parsed.recentProjects) ? parsed.recentProjects.filter((x) => typeof x === "string") : [],
      };
    } catch {
      this.persisted = { ...DEFAULT_PERSISTED };
    }
  }

  private async save() {
    await fs.writeFile(this.statePath, `${JSON.stringify(this.persisted, null, 2)}\n`, "utf8");
  }
}
