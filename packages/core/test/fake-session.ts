import type {
  AgentSession,
  SessionFactory,
  SessionFactoryArgs,
} from "../src/agent/kernel/types.js";

/**
 * 测试用会话工厂：不碰真模型。打开 / 创建项目会顺手建主编会话，
 * 有了它，测试环境不需要任何 API key。返回的假会话满足 Kernel 用到的那几个接口。
 */
export function fakeSessionFactory(opts: { ready?: () => boolean; messages?: unknown[]; onPrompt?: (text: string) => void } = {}) {
  const created: SessionFactoryArgs[] = [];
  const factory: SessionFactory = {
    ready: opts.ready ?? (() => true),
    create: async (args) => {
      created.push(args);
      const session = {
        isStreaming: false,
        // 模拟「上次留下的会话」：接着开时主编能从这里读到历史
        messages: [...(opts.messages ?? [])] as unknown[],
        // 真会话的 sessionFile 来自 SessionManager；这里同源，chat.sessionFile 才有东西可返回
        sessionFile:
          args.sessionManager.getSessionFile() ??
          `${args.sessionManager.getSessionDir()}/fake.jsonl`,
        prompt: async (text: string) => {
          opts.onPrompt?.(text);
        },
        abort: async () => {},
        dispose: () => {},
        clearQueue: () => ({ steering: [], followUp: [] }),
        subscribe: () => () => {},
        setModel: async () => {},
        setThinkingLevel: () => {},
        setActiveToolsByName: () => {},
      };
      return session as unknown as AgentSession;
    },
  };
  return { factory, created };
}
