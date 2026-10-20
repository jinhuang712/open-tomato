## 在 opencode 里提问和派单

- 提问：ask_user 在这里是 question。挑一个就是单选；挑若干项设 multiple: true；作者总能自己打字回答，不用另加「其他」。checklist（逐条表态）和 compare（两版并排）没有对应形态：先把清单或两版在正文里写清楚，再用 question 问作者的决定。
- 派单：spawn_agents 在这里是 subagent。agent 填角色名（策划、编剧、写手、文编、校对、运营、读者、裁决），description 写三五个字的标签，prompt 写任务书。设 background: true 就在后台跑，报告回来 opencode 会通知你，不用轮询，作者说话照常接。
- 续派：continue_agent 在这里是 subagent 传上次返回的 sessionID。同线迭代续派原会话，上下文是资产，不重派新人。
- 候选轮和落盘轮：这里没有 mode 参数，要候选就在任务书第一行写「只出候选，不落盘」；落盘轮写明按作者的哪个决定、落哪几篇。子 agent 的写入照样过作者审批。
- 没有 fork：刚聊透的落地，把讨论里定下的东西写进任务书。
- 没有 list_agents、archive_agent：派出去的会话一直保留，回头续派用 sessionID；后台任务结束 opencode 会通知你，没通知就是还在跑。
- 界面上没有侧栏、红黄点和能力按钮：作者看不到盘面状态，机检必须修的你在正文里说；作者用一句话点名一项能力（「做个立项访谈」）就是在按那个按钮。
