# 运行文本

共用规则只维护一份。工具接口与宿主操作单独组装，禁止用替换工具名称的方式把 App 指令改成 opencode 指令。

```text
packages/core/text/
├── shared/                 共用纯文本：协作、角色、能力、评审与标准
├── tools/                  两端复用的工具说明、材料格式与操作指引
├── messages/               共用材料工具的返回与错误消息
└── app/
    ├── instructions.md     App 提问、派单、写入与批注
    ├── status.md           App 状态行
    ├── tools/              App 独有工具的说明与参数文案
    └── messages/           App 内核事件与工具返回

packages/opencode/text/
├── instructions.md         opencode 原生工具、会话与写入方式
└── messages.yaml           插件事件、命令与错误消息
```

## 内容归属

- `shared/` 说明怎样协作、角色贡献什么、怎样判断创作质量。不写工具调用、文件路径、接口参数或宿主界面行为。
- `tools/` 只描述两端确实复用的接口。`materials-schema.yaml` 是材料字段和段落的解释；字段名、枚举、必填条件与校验仍由代码定义。
- App 的 `ask_user`、`spawn_agents`、`write_doc` 等说明留在 `app/`。
- opencode 的 `question`、`subagent`、`write`、`edit` 等说明留在插件包内。插件不读取 core 的 `app/` 文本。
- 同一路评审的写作判断在 `shared/reviews/`；`save_review` 的参数和 `.opentomato/reviews/` 保存位置在 `tools/instructions.md`。
- 修改工具参数或材料结构时，先改接口定义，再改解释文本，不在资源中另维护一套 schema。

两端注册清单分别在 [App 工具注册](../src/agent/tools/index.ts)、[插件工具注册](../../opencode/src/tools.ts)和[插件权限](../../opencode/src/agents.ts)。文本资源存在，不等于工具对当前角色可用。

## 加载入口

- [共用组装器](../src/text/compose.ts)独立提供纯文本与共用工具说明，按角色选取 `section`。
- [App 组装器](../src/text/app.ts)加入 App 操作和状态行，由 `rolePrompt(id)` 调用。
- [插件组装器](../../opencode/src/text.ts)加入插件本地操作，由 `/open-tomato` 切入角色后使用。
- 能力正文仅在按需加载时提供。App 和插件各自加入候选阶段的操作要求。
- `messages/` 和两端消息目录中的内容，仅在对应事件发生时使用。

`section` 标记不进入最终提示词。共享正文中的 `{{STANDARDS}}`、`{{GUIDE}}` 只插入创作内容；工具指引中的 `{{KIND_TABLE}}`、`{{CAPABILITIES}}` 由代码根据已注册定义生成。纯文本中不使用宿主占位符。

资源加载器以各自包内的 `text/` 为根目录，不允许路径越界。缺资源、缺键、缺参数、重复键或非字符串 YAML 值均报错。

## 预览与验证

仓库根目录执行：

```bash
bun run preview --host opencode --role director
bun run preview --host app --role writer
bun run preview --host opencode --role director --capability design
bun run typecheck
bun run test
```

预览使用两端真实组装入口，不保存另一份生成稿。`shared/` 的边界测试检查注册工具名和宿主机制，插件测试检查 App 内容泄漏、角色权限对应的操作指引，以及资源引用。

core 包及桌面安装包包含 `dist/`、`text/`；插件包包含 `server.ts`、`src/`、`text/`。修改 core 后需要重启加载它的 App 或 opencode；开发环境下 core 的编译由现有监听进程完成。
