# OpenTomato

macOS 桌面小说写作工具。

- 内核：[pi](https://github.com/badlogic/pi-mono) agent harness，50+ 模型提供方统一接入
- 方法论：立项访谈 → 卡片库（世界 / 人物 / 线索）→ 三层大纲（里程碑 → 卷纲 → 章纲）→ 章节写作 → 多路审稿 → 一致性机检
- 交互：所有落盘改动先以 diff 呈现，approve 后才写入；子 agent 运行过程实时可见

## 开发

```bash
bun install
bun run dev
```

```bash
bun run test        # core 单测
bun run typecheck   # 全部包类型检查
bun run dist        # 打 macOS .app
```

## 许可证

MIT
