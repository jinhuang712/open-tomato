import type { AgentSession, SessionFactory, SessionFactoryArgs } from "../src/agent/kernel/types.js";

/**
 * 测试用会话工厂：不碰真模型。打开 / 创建项目会顺手建主编会话，
 * 有了它，测试环境不需要任何 API key。返回的假会话满足 Kernel 用到的那几个接口。
 */
export function fakeSessionFactory() {
  const created: SessionFactoryArgs[] = [];
  const factory: SessionFactory = async (args) => {
    created.push(args);
    const session = {
      isStreaming: false,
      messages: [] as unknown[],
      // 真会话的 sessionFile 来自 SessionManager；这里同源，chat.sessionFile 才有东西可返回
      sessionFile: args.sessionManager.getSessionFile() ?? `${args.sessionManager.getSessionDir()}/fake.jsonl`,
      prompt: async () => {},
      abort: async () => {},
      dispose: () => {},
      clearQueue: () => ({ steering: [], followUp: [] }),
      subscribe: () => () => {},
      setModel: async () => {},
      setThinkingLevel: () => {},
      setActiveToolsByName: () => {},
    };
    return session as unknown as AgentSession;
  };
  return { factory, created };
}
