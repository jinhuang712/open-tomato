# 共用工具与材料接口

<!-- section:materials -->
## 材料路径与字段

以下路径均相对于当前书稿项目根目录。材料使用 Markdown 正文和 YAML frontmatter：

| kind（工具参数） | 目录 | 用途 |
|---|---|---|
{{KIND_TABLE}}

- 文件路径为 `<目录>/<id>.md`。卷纲使用两位编号，章纲和正文使用四位编号；守则自动分配三位编号；简介固定为 `简介.md`。
- 例如 `人物/林尧.md`、`卷纲/01.md`、`章纲/0001.md`、`正文/0001.md`、`守则/001.md`。
- 用 read_doc 传 kind、id 读取材料；只读某段时增加 section。章纲使用 kind=chapters，正文使用 kind=manuscript。
- 用 project_overview 定位材料，用 list_docs 列出材料。守则用 list_docs kind=守则 读取；需要详细内容时再 read_doc 读「展开」。
- 搁置事项写入材料的 frontmatter：`open: [事项]`，用 list_open 汇总。作废材料标记 `status: retired`；守则的 level 使用「必须」或「尽量」。
- 里程碑的 order 只用于排序，报告和任务书使用里程碑名字。
- 报告中的文件位置使用相对书稿项目根目录的路径。引用外部资料时使用完整 URL。
- read_review 传 chapter 读取某章各路最新一轮审稿记录；旧版正文的记录会标出过期，不能据此认定新版仍有同一问题。
<!-- endsection -->

<!-- section:lead -->
## 能力与机检

{{CAPABILITIES}}

- 按当前需要用 load_capability 传 id 加载能力；讨论下一步前用 list_open 查看搁置事项。
- run_check 检查材料的一致性；写入返回的机检必须修项需要处理。
<!-- endsection -->

<!-- section:write -->
## 创作角色的材料操作

- 新建前用 doc_template 传 kind 取得模板、字段和段落说明。只填写已确定的内容。
- 修改前先 read_doc 读取磁盘上的原文。写入范围由角色权限限制，需要审批的改动按宿主流程提交。
<!-- endsection -->

<!-- section:review -->
## 审稿记录接口

- 用 save_review 提交 chapter（章号）、verdict（结论）和 items（问题清单）。
- items 包含 level、where、issue，可选 fix、standard；level 为 must（必须改）或 suggest（建议看）。standard 使用归你核对的标准名称，其他问题不填。
- 记录保存在 `.opentomato/reviews/<四位章号>/<角色id>.json`。文编为 copyeditor.json，校对为 proofreader.json，运营为 ops.json，读者为 reader.json。
- 例如 `.opentomato/reviews/0001/copyeditor.json`。文件名由调用角色确定，同一路的多轮记录由工具追加，不直接改 JSON。
<!-- endsection -->

<!-- section:writer -->
## 正文章节字段

- 写前先 read_doc 读取本章章纲、前章结尾、在场人物的「内在与欲望」「语音签名」，以及有效守则。人物段落用 section 指定。
- 正文使用 kind=manuscript。frontmatter 的 title 为章名，words 为实际字数，summary 为本章事件摘要。
- 返修前用 read_review 读取本章各路最新记录；改动影响字数时，同步更新 words。
<!-- endsection -->

<!-- section:plotter -->
## 大纲与线索字段

- 卷纲与章纲的关联分别使用 volume、characters、threads；值指向实际存在的材料 id，章号从 0001 连续编号。
- 章纲的 beat 标明压、放或平；characters 记录在场人物，threads 只列本章实际推进的线索。
- 卷末先 volume_rhythm 查看字数、线索、钩子与压放，再 list_docs kind=正文 读取章节 summary，无需为盘点通读整卷正文。
- 回写线索卡时更新 stage，并在「推进阶段」追加节点；已兑现的钩子标记「已兑现（第 N 章）」，新悬念补入「钩子」。起点和终点不动。
<!-- endsection -->

<!-- section:proofreader -->
## 校对前的机检

- 先 run_check，只检查它未覆盖的事实与逻辑问题。
<!-- endsection -->
