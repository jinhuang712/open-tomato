# 运行文本

这里是 App 和 opencode 插件共用的运行文本来源。Markdown 保存连贯的工作指令，YAML 保存按名称取用的说明和消息模板。修改前先找到内容归属，不要在角色、能力和工具中重复补同一条规则。

| 内容 | 修改位置 |
|---|---|
| 作者、主编和子角色怎样合作 | `collaboration.md`，按与作者合作、分工与派单、报告与评审、材料写入四章组织 |
| 角色独有的职责和工作要求 | `roles/<角色>.md`；名称和简介在 `roles.yaml` |
| 一项工作的目标、结果和范围 | `capabilities/<能力>.md`；名称、说明和使用时机在 `capabilities.yaml` |
| 各路评审独有的检查方法 | `reviews/` |
| 写作标准的表述 | `standards.yaml` |
| 材料类型、字段和段落说明 | `materials.yaml` |
| 工具用途和参数解释 | `tools/`，按材料、评审、角色协作、对话分组 |
| 返回给模型的结果、错误和通知 | `messages/` |
| 宿主的工具名称、界面和派单方式 | `hosts/app.yaml`、`hosts/opencode.yaml` |

代码保留字段名、枚举、必填条件、角色权限、标准归属、工具注册和校验逻辑。不要将这些定义复制进文本资源维护第二份。

协作文件中的 `section` 标记让组装器按角色选取章节，标记不会进入最终提示词。宿主说明在组装时选入，不先附上 App 的做法再让 opencode 覆盖。候选阶段等宿主差异也适用于按需加载的能力正文。

模板使用 `{{参数名}}`。缺少参数、资源、键或章节会报错；YAML 的重复键和非字符串值也会报错。插入的动态内容不会再次作为模板解析。YAML 中的键是稳定引用，不要只改键名而漏改调用处。

## 预览

在仓库根目录执行：

```bash
bun run preview --host opencode --role director
bun run preview --host app --role writer
bun run preview --host opencode --role director --capability design
```

输出直接使用运行时组装函数。能力正文会附在角色提示词后，便于检查角色和能力规则是否一致。预览是诊断工具，不在仓库中保存另一份生成稿。

## 验证

```bash
bun run typecheck
bun run test
```

测试覆盖两种宿主的全部角色和能力、占位符、共享章节次数、App 专属工具残留、权限和资源清单。core 包发布及桌面打包都必须包含 `dist/` 和 `text/`。
