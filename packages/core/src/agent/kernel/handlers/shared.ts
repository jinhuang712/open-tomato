import type { Gate } from "../../gate.js";
import type { ModelsFacade } from "../../models.js";
import type { ProjectStore } from "../../../project/store.js";
import type { SearchIndex } from "../../../project/search.js";
import type { CheckIssue, KernelEvent, RequestMap, RequestMethod } from "../../../protocol.js";
import type { CloudManager } from "../cloud-manager.js";
import type { LiveAgent } from "../types.js";

/** handle() 整表的类型：protocol 加新请求却没注册 handler，构建直接红 */
export type HandlerMap = {
  [K in RequestMethod]: (params: RequestMap[K]["params"]) => Promise<RequestMap[K]["result"]>;
};

/**
 * 各域 handler 能碰的 Kernel 能力，白名单制。
 * handle() 里用闭包组装，Kernel 的 private 一个不拓宽。
 */
export interface KernelApi {
  getStore(): ProjectStore | null;
  setStore(s: ProjectStore | null): void;
  requireStore(): ProjectStore;
  closeProject(): Promise<void>;
  afterOpen(mode: "new" | "continue"): Promise<void>;
  disposeAgents(retire: boolean): Promise<void>;
  createLead(mode: "new" | "continue"): Promise<void>;
  sendTo(agentId: string, text: string, deliverAs?: "steer" | "followUp"): void;
  requireLive(agentId: string): LiveAgent;
  authorActed(live: LiveAgent | undefined): void;
  emitQueue(live: LiveAgent): void;
  searchIndex(): Promise<SearchIndex>;
  emitDocsChanged(): Promise<CheckIssue[]>;
  models: ModelsFacade;
  gate: Gate;
  clouds: CloudManager;
  agents: Map<string, LiveAgent>;
  emit(event: KernelEvent): void;
}
