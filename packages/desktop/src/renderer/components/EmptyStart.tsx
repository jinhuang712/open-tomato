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

  const primary = () => plan().cards.find((c) => c.primary);
  const secondary = () => plan().cards.filter((c) => !c.primary);
  const disabled = () => !state.models?.current;

  return (
    <div class="flex-1 flex items-center justify-center px-8 py-10">
      <div class="w-full max-w-[560px] text-center">
        <div class="inline-block px-2 py-0.5 rounded-full bg-paper-3 text-ink-3 text-[11px] tracking-wider mb-3">{plan().stage}阶段</div>
        <div class="font-serif text-[28px] leading-tight mb-2">{state.project?.name}</div>
        <div class="text-ink-2 mb-7 leading-relaxed">{plan().line}</div>

        <Show when={disabled()}>
          <div class="mb-4 px-3 py-2 rounded-lg bg-warn-soft text-warn text-[12px]">先在右上角选一个模型，下面的按钮才能点。</div>
        </Show>

        <Show when={primary()}>
          {(c) => (
            <button
              class="w-full text-left px-5 py-4 rounded-2xl bg-accent text-white shadow-lg hover:brightness-110 transition disabled:opacity-40 flex items-center gap-4"
              disabled={disabled()}
              onClick={c().run}
            >
              <span class="flex-1">
                <span class="block text-[16px] font-medium">{c().title}</span>
                <span class="block text-[12px] opacity-80 mt-0.5">{c().desc}</span>
              </span>
              <span class="text-xl opacity-80">→</span>
            </button>
          )}
        </Show>

        <div class="grid grid-cols-3 gap-2 mt-3">
          <For each={secondary()}>
            {(c) => (
              <button
                class="text-left px-3.5 py-3 rounded-xl border border-line bg-paper-2 hover:border-accent hover:bg-accent-soft/40 transition-colors disabled:opacity-40"
                disabled={disabled()}
                onClick={c.run}
              >
                <div class="font-medium text-[13px]">{c.title}</div>
                <div class="text-[11.5px] text-ink-3 mt-0.5 leading-snug">{c.desc}</div>
              </button>
            )}
          </For>
        </div>

        <div class="mt-6 text-[12px] text-ink-3">或者直接在下面和主编说话</div>
      </div>
    </div>
  );
}
