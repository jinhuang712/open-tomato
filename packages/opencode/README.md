# @opentomato/opencode

OpenTomato 的 opencode v2 插件：把 App 里的写作方法搬进 opencode（终端、网页、桌面端都能用）。
装在一本书的目录上，这个目录就是一个 OpenTomato 项目，和 App 同一套目录结构，两边都能打开。

## 装到一本书上

```bash
# 在本仓库里装依赖、编译 core（插件直接引用 core 的 dist）
bun install
bun run --filter @opentomato/core build
```

在书的目录里放一份 `opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/绝对路径/open-tomato/packages/opencode"]
}
```

用 opencode 桌面端打开这个目录。第一次加载时，不是项目的目录会按 App 的结构建好（`.opentomato/`、`简介.md` 和八个材料目录）。
默认 agent 是「主编」，直接跟它说话。

**把这个项目的自动批准关掉。** 写入审批走的是 opencode 的权限请求，开着自动批准，作者这道门就形同虚设。

## 有什么

| App 里                         | 插件里                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 主编 + 八个角色                | 同名 agent：主编（primary，默认），策划、编剧、写手、运营、读者、文编、校对、裁决（subagent）                                                                       |
| 角色提示词                     | core 的原文，后面拼一段 opencode 对照（`prompts/host.md`、`prompts/host-lead.md`）                                                                                  |
| read_doc、run_check 等材料工具 | core 的同一份实现：project_overview、list_docs、read_doc、search_docs、doc_template、run_check、list_open、load_capability、read_review、save_review、volume_rhythm |
| write_doc / edit_doc + 审批门  | opencode 自带的 write / edit，插件挂钩子把关：只写材料、按角色收边界、只改 frontmatter 不过门、落盘附机检                                                           |
| ask_user                       | opencode 的 question                                                                                                                                                |
| spawn_agents / continue_agent  | opencode 的 subagent（后台跑用 background，续派传 sessionID）                                                                                                       |
| 能力集                         | 权限规则：评审不能写、不联网；子角色不能问作者、不能派单；写作角色没有 shell、patch、skill                                                                          |

## 和 App 不一样的地方

- 没有 App 的界面：侧栏、红黄点、能力按钮、引用批注、⌘E 自己动手改都没有。opencode 桌面端还没有开放界面插件（`./gui` 入口的 PR 未合并），能用的只有它自带的对话、diff 和审批。
- 审批门上没有「自己改了再放行」，只有批准 / 拒绝；拒绝时作者写的理由会原样交给 agent。
- 派单没有 propose / commit 两种模式，也没有 fork、list_agents、archive_agent，主编按 `host-lead.md` 里的对照用任务书说清楚。
- 没有 read_marks：作者的放行、退回不记成批。

## 开发

```bash
bun run --filter @opentomato/opencode test
bun run --filter @opentomato/opencode typecheck
```

- 入口在包根的 `server.ts`：opencode 加载本地目录插件只找包根下的 `server` / `index` 文件，不读 `exports`。
- 改插件自己的源码，opencode 会热重载；改了 core，要重新 build core 并重启 opencode（已加载的 core 模块不会换）。
- core 里给插件用的入口是 `@opentomato/core/headless`，那里导出的模块运行时都不能加载 pi。
