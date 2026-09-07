# GITFLOW

单主干 + 小步提交。`main` 是唯一常驻分支，直接在上面小步快跑。

## 分支

- 日常开发直接在 `main` 上改，一个可验证的小步即一提交。
- 实验性、重构、并行任务才开分支：用 worktree，分支名 `wt-<一句话>`，做完合回 `main` 后删除，不长期养分支。
- 不要 `dev` / `release` / 个人前缀分支。远端出现 `claude/*` 这类历史分支不再新建。
- `push` 即发布：`main` 永远可构建、可运行（见 CLAUDE.md「小步快跑」）。

## 提交格式

```
<type>(<scope>): <subject>
<空一行>
<body>
```

- 第一行是标题，唯一必填。冒号统一用半角 `: `，后面一个空格。
- 标题写不下就拆：标题只说「做了什么」，「为什么 / 怎么做的」放 body。
- 全中文。英文专有名词（组件名、字段名、工具名）保留原文，不翻译。
- 历史上三种混用风格（`feat(core): …` / 裸中文长句 / 裸英文短句）统一收敛到这一种。

## type

| type | 用途 | 例子 |
|---|---|---|
| `feat` | 新功能、新行为（含提示词行为变化） | 新工具、新能力、主编新规则 |
| `fix` | 修 bug（含 UI 错位、文案误导、逻辑错误） | 徽章折行、审批覆盖、状态行漏进正文 |
| `refactor` | 重构，行为不变 | 拆文件、抽模块、提示词去重 |
| `docs` | 只改文档，不碰行为 | README、CLAUDE.md、docs/ |
| `test` | 只加/改测试 | 补单测、锁基线 |
| `style` | 纯样式，无逻辑变化 | 颜色、间距、字阶 |
| `chore` | 构建、依赖、脚本、CI | 锁版本、install.sh、Actions |

- 提示词（`packages/core/prompts/**`）改的是 agent 行为，按 `feat` / `fix` / `refactor` 算，不算 `docs`。
- `docs` 只留给真正的手册文档。

## scope

| scope | 范围 |
|---|---|
| `core` | `packages/core/**`（内核、工具、提示词、测试） |
| `desktop` | `packages/desktop/**`（主进程、渲染层） |
| 不写 | 跨包、根目录（CI、脚本、全局文档、双包联动） |

- 只允许 `core` / `desktop` / 省略三种。历史上的 `agent`、`cloud`、`claude` 等 scope 停用，一律归到 `core`。
- 禁止 `fix(core,desktop)` 这种多 scope：按「一次只做一件事」拆成两个提交；实在拆不开就不写 scope。
- `test(core)` / `style(desktop)` 这类组合保留：type 照实写，scope 照路径写。

## 标题（subject）

- 中文陈述，动词开头，≤ 50 字，句尾不加句号。
- 好动词：新增、支持、改成、去掉、收窄、拆分、修复、对齐、补上。
- 烂标题：过程描述（「改了下」「顺手」「WIP」）、英文裸句（`Allow natural editor conversation endings`）、全角冒号（`xxx：yyy`）。
- 标题里不写 hash、不写文件清单，那是 body / diff 的事。

## 正文（body）

- 可选，但凡标题一句话说不清「为什么」就要写，2–5 行。
- 写三件事的顺序：原来什么问题 → 现在改成什么样 → 有什么代价或后续（有才写）。
- 关联前置提交用短 hash，如 `61fcb96 把 no-drag 收窄后，菜单落在拖拽区`。
- 不复述 diff 能看到的文件名罗列，不写「详见代码」。

## 改写示例

历史标题 → 规范写法：

```
侧栏已收束的卡淡出：status 落进 SETTLED_STATUS 的线索 / 里程碑用组名那档灰显示，能点开但不跟在跑的线抢眼
→ style(desktop): 已收束的卡片淡出，不跟在跑的线抢眼

能力改成主编的打包工作流并进 loop：正文只写目标 / 交付物 / 边界不写步骤、去掉参数由主编看盘面定范围；新增 load_capability 工具与主编系统提示的能力清单，作者点按钮与主编自己进场收到同一份正文
→ feat(core): 能力改成主编的打包工作流，进 loop 共用正文

Allow natural editor conversation endings
→ feat(core): 主编允许只说不问，自然收尾

项目菜单下拉容器补 no-drag：61fcb96 把 no-drag 收窄到触发按钮后，弹出的菜单落在顶栏拖拽区，点菜单项变成拖窗口
→ fix(desktop): 项目菜单下拉容器补 no-drag
  61fcb96 把 no-drag 收窄到触发按钮后，菜单落在顶栏拖拽区，点菜单项变成拖窗口。
```

## 提交前

1. 一提交只做一件事，顺手发现的问题另起提交。
2. `bun run typecheck` + `bun run test` 通过再 commit（就是 `tsc` + `packages/core/test`）。
3. `git diff --check` 无空白错误再 push。`main` 超前远端是常态，直接 `git push origin main`。
