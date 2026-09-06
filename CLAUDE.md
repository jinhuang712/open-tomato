# 协作约定

## 小步快跑

- 每次改动只做一件事，改完立刻验证（类型检查 / 测试 / 跑起来看一眼），再进行下一步。
- 一个功能拆成多个可独立提交的小步，每步都保持仓库可构建、可运行。
- 优先交付能用的最小版本，再迭代；不要为了"顺手"扩大改动范围。
- 发现顺带想改的东西，先记下来，单独提出，不夹带进当前改动。
- 提交粒度小、信息清楚，方便回退任意一步。

## 不记录 memory

- 本项目不允许向 Claude 的持久 memory 目录写任何内容（含 MEMORY.md 索引）。
- 需要跨会话保留的约定、原则、决策，一律写进仓库：协作约定放 CLAUDE.md，设计原则放 docs/设计思想.md。

## 开发模式下改动怎么生效

作者平时后台跑着 `bun run dev`（core `tsc -w` + `electron-vite dev`）。改完代码先判断要不要重启，不要默认说"需要重新 build"：

| 改动位置 | 生效方式 |
|---|---|
| `packages/desktop/src/renderer/**` | vite HMR 热更新，什么都不用做 |
| `packages/desktop/src/main/**`、`preload/**` | electron-vite 重编译并自动重启 Electron 进程 |
| `packages/core/**` | `tsc -w` 会更新 dist，但主进程已加载的 core 不会换，需要 Ctrl+C 后重新 `bun run dev` |

注意 HMR 会保留 renderer 的 store 状态：修的是"某个状态卡住"这类 bug 时，已经卡着的旧状态不会被热更新清掉，要在 app 里 Cmd+R 刷一下 renderer 或等状态重新产生。
