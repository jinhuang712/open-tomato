# @opentomato/opencode

OpenTomato 的 opencode v2 插件：把 App 里的写作方法搬进 opencode（终端、网页、桌面端都能用）。
只有一个入口 `/open-tomato`：在哪个目录里输入，哪个目录就作为一本书打开，和 App 同一套目录结构，两边都能打开。

## 安装

```bash
# 在本仓库里装依赖、编译 core（插件直接引用 core 的 dist）
bun install
bun run --filter @opentomato/core build
```

在全局配置 `~/.config/opencode/opencode.json` 的 `plugins` 里加上本包（只想给某本书用，就写进那本书目录的 `opencode.json`）：

```json
{
  "plugins": ["/绝对路径/open-tomato/packages/opencode"]
}
```

装上以后插件平时不出声：不碰磁盘、不改默认 agent，主编和八个角色在选择器、@ 提及里都看不到，别的 agent 也用不了写作工具。

## 使用

在 opencode 里打开书的目录，输入：

```text
/open-tomato
/open-tomato 我想写一个退役刑警找失踪妹妹的故事
```

目录还不是项目，就按 App 的结构建好（`.opentomato/`、`简介.md` 和八个材料目录）；然后当前会话交给主编，命令后面的话原样转给它。之后在这个会话里直接说话就行。新开会话要接着写，再输入一次 `/open-tomato`。

**写作角色的权限以插件为准。** 全局配置里的 `permission`（比如 `"*": "allow"`）排在 agent 规则后面，本来会把写作角色的审批和禁用全盖掉；插件在权限钩子里按自己的规则重算，写入照样问作者，被禁的工具也从清单里拿掉。插件规则管不到的（读文件、查资料）照你的配置走。

## 有什么

| App 里                         | 插件里                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 主编 + 八个角色                | 同名的隐藏 agent：主编（primary，由 /open-tomato 切入），策划、编剧、写手、运营、读者、文编、校对、裁决（subagent，主编派）                                         |
| 角色提示词                     | core 的原文，后面拼一段 opencode 对照（`prompts/host.md`、`prompts/host-lead.md`）                                                                                  |
| read_doc、run_check 等材料工具 | core 的同一份实现：project_overview、list_docs、read_doc、search_docs、doc_template、run_check、list_open、load_capability、read_review、save_review、volume_rhythm |
| write_doc / edit_doc + 审批门  | opencode 自带的 write / edit，插件挂钩子把关：只写材料、按角色收边界、只改 frontmatter 不过门、落盘附机检                                                           |
| ask_user                       | opencode 的 question                                                                                                                                                |
| spawn_agents / continue_agent  | opencode 的 subagent（后台跑用 background，续派传 sessionID）                                                                                                       |
| 能力集                         | 权限规则：评审不能写、不联网；子角色不能问作者、不能派单；写作角色没有 shell、patch、skill                                                                          |

## 和 App 不一样的地方

- 没有 App 的界面：侧栏、红黄点、能力按钮、引用批注、⌘E 自己动手改都没有。opencode 桌面端还没有开放界面插件（`./gui` 入口的 PR 未合并），能用的只有它自带的对话、diff 和审批。
- 审批门上没有「自己改了再放行」。桌面端的审批条只有拒绝、始终允许、允许一次，没有写理由的框：拒绝后这一轮停下，在对话里告诉主编为什么。别点「始终允许」：每次写入都该过作者这道门，而它在插件重算权限之后还起不起作用，没有验证过。
- 通过 API 回复审批时可以带一句理由（`message`），这句话会原样交给写的那个 agent。
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
