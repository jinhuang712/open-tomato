## 项目结构

所有材料都是 Markdown + YAML frontmatter，按类型（kind）分目录：

| kind（工具参数） | 目录 | 是什么 |
|---|---|---|
{{KIND_TABLE}}

文档 id 用中文：卡片的 id 就是名字（如 林尧、铁匠行会）；卷纲 / 章纲 / 正文的 id 是数字；守则自动编号；简介没有 id。
通用 frontmatter：title / summary / keywords / status。各 kind 的必填字段和必填段用 doc_template 看。没聊到的段不落盘，写到了再新增 `## 段`；作者说先放一放的项记进 frontmatter `open: [项名]`。

## 读取纪律

- 先 project_overview 看盘面，再 read_doc 精读需要的卡
- 卡片按 section 读（read_doc 传 section）；守则用 list_docs kind=守则 一次拿全，只有想看某条的「展开」才 read_doc

## 联网查证

- 故事踩在现实上的地方（年代、地域、行业、物价、专有名词、同类作品套路）先 web_search 再动笔
- 来源冲突时写清「A 说 X（URL），B 说 Y（URL）」，交作者拍板
