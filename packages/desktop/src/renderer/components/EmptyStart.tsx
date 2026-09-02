import type { CapabilityId } from "@opentomato/core/protocol";
import { createMemo, For, Show } from "solid-js";
import { actions, setState, state } from "../state";

interface Card {
  title: string;
  desc: string;
  run: () => void;
  primary?: boolean;
}

/**
 * 空会话的起手面板：按项目现状判断处在哪个阶段，把下一步做成按钮。
 * 阶段判断只看文档数量，不调模型。
 */
export function EmptyStart() {
  const count = (kind: string) => state.docs.filter((d) => d.kind === kind).length;
  const maxNo = (kind: string) =>
    state.docs
      .filter((d) => d.kind === kind)
      .map((d) => Number(d.id))
      .filter((n) => Number.isFinite(n))
      .reduce((a, b) => Math.max(a, b), 0);

  const runCap = (id: CapabilityId, params?: Record<string, string>) => {
    const cap = state.capabilities.find((c) => c.id === id);
    if (!cap) return;
    if (params || cap.params.length === 0) void actions.runCapability(id, params ?? {});
    else setState("capabilityDialog", cap);
  };
  const say = (text: string) => setState("composerDraft", text);

  const plan = createMemo(() => {
    const cards = count("characters") + count("world") + count("threads");
    const outlines = count("milestones") + count("volumes") + count("chapters");
    const chapters = maxNo("chapters");
    const written = maxNo("manuscript");
    const talk: Card = { title: "先聊聊我的想法", desc: "还没成形也行，主编会边聊边记", run: () => say("我有个想法，先和你聊聊：") };
    const adopt: Card = {
      title: "我有现成的材料",
      desc: "已有设定 / 大纲 / 旧稿，贴进来整理成卡片",
      run: () => say("我有一些现成的材料，先贴给你，帮我整理进对应的卡片，不确定的先问我：\n\n"),
    };

    if (cards === 0 && outlines === 0 && written === 0) {
      return {
        stage: "立项",
        line: "这本书还是一张白纸。先把书名、一句话故事、读者是谁这几件事定下来。",
        cards: [
          { title: "立项访谈", desc: "主编逐个问你 7 个问题，答案落进守则/立项", run: () => runCap("interview"), primary: true },
          talk,
          adopt,
          { title: "直接设卡", desc: "跳过访谈，先建人物和世界设定", run: () => runCap("design") },
        ] as Card[],
      };
    }
    if (outlines === 0) {
      return {
        stage: "设卡",
        line: `已有 ${cards} 张卡。卡够了就该排结构了，不够可以继续补。`,
        cards: [
          { title: "大纲编排", desc: "先排全书里程碑，再到卷纲、章纲", run: () => runCap("outline"), primary: true },
          { title: "继续设卡", desc: "补人物 / 世界设定 / 线索", run: () => runCap("design") },
          { title: "一致性机检", desc: "看看卡片有没有缺字段、断链", run: () => runCap("check") },
          talk,
        ] as Card[],
      };
    }
    if (written < chapters) {
      const next = written + 1;
      return {
        stage: "写正文",
        line: `章纲排到第 ${chapters} 章，正文写到第 ${written} 章。`,
        cards: [
          { title: `写第 ${next} 章`, desc: "执笔按章纲写，写完你看 diff 再落盘", run: () => runCap("draft", { chapter: String(next) }), primary: true },
          ...(written > 0
            ? [{ title: `审第 ${written} 章`, desc: "四路评审并行看上一章", run: () => runCap("review", { chapter: String(written) }) }]
            : []),
          { title: "继续排章纲", desc: "把后面几章的施工单排出来", run: () => runCap("outline") },
          talk,
        ] as Card[],
      };
    }
    return {
      stage: "审稿",
      line: `正文写到第 ${written} 章，章纲也排到这里了。`,
      cards: [
        ...(written > 0
          ? [{ title: `审第 ${written} 章`, desc: "市场 / 读者 / 文风 / 连续性四路并行", run: () => runCap("review", { chapter: String(written) }), primary: true }]
          : []),
        { title: "排下一批章纲", desc: "结构师接着往后排", run: () => runCap("outline") },
        { title: "一致性机检", desc: "机械对账，报断链断档", run: () => runCap("check") },
        talk,
      ] as Card[],
    };
  });

  return (
    <div class="h-full flex items-center justify-center px-8">
      <div class="w-full max-w-[640px]">
        <div class="text-[11px] uppercase tracking-wider text-ink-3 mb-1">当前阶段 · {plan().stage}</div>
        <div class="font-serif text-2xl mb-1">{state.project?.name}</div>
        <div class="text-ink-2 mb-6">{plan().line}</div>
        <Show when={!state.models?.current}>
          <div class="mb-4 px-3 py-2 rounded-lg bg-warn-soft text-warn text-[12px]">先在右上角选一个模型，按钮才能点。</div>
        </Show>
        <div class="grid grid-cols-2 gap-2">
          <For each={plan().cards}>
            {(c) => (
              <button
                class={`text-left px-4 py-3 rounded-xl border transition-colors disabled:opacity-40 ${
                  c.primary
                    ? "col-span-2 border-accent bg-accent-soft/60 hover:bg-accent-soft"
                    : "border-line bg-paper-2 hover:border-accent hover:bg-accent-soft/40"
                }`}
                disabled={!state.models?.current}
                onClick={c.run}
              >
                <div class={`font-medium ${c.primary ? "text-[15px]" : ""}`}>{c.title}</div>
                <div class="text-[12px] text-ink-2 mt-0.5">{c.desc}</div>
              </button>
            )}
          </For>
        </div>
        <div class="mt-5 text-[12px] text-ink-3">也可以直接在下面输入框和主编说话。</div>
      </div>
    </div>
  );
}
