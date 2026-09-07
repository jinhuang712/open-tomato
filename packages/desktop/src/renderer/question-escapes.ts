import type { QuestionRequest } from "@opentomato/core/protocol";

export interface Escape {
  label: string;
  hint: string;
  /** 回给主编的话，写成它能直接执行的指令 */
  answer: string;
}

/**
 * 逃生口按提问形态（kind）变：
 * - open：要一份选择题，或让主编先想几个
 * - single / multi：都不对就换一批；也可以把这个决定交给主编
 * - compare：可以混搭、可以换思路
 * 「先放一放」永远都有：不确定的段不落盘，搁置的决定记进卡的 open 清单。
 */
export function escapesFor(req: QuestionRequest): Escape[] {
  const n = req.options.length;
  const list: Escape[] = [];
  if (req.kind === "open") {
    // 两条都是要候选，前提不一样：一条是我有想法只是不想打字，一条是我确实没想法。
    // 主编常把候选排在问句里（「A、B 还是 C」）却标 open，这时点「我还没想好」是撒谎
    list.push({ label: "给我选择题", hint: "把这问题摆成候选让我点", answer: "这个给我做成选择题：把你想到的方向摆成候选让我点，别让我自己组织一段话。" });
    list.push({ label: "我还没想好", hint: "让主编先给几个候选", answer: "我还没想好，你先替我想 3 个不同方向的候选，我来选。" });
  } else if (req.kind === "checklist") {
    // checklist 的逃生口要带上当前表态，由 QuestionDock 内的 checklistEscapes 给，这里不管
    return [];
  } else if (req.kind === "compare") {
    if (n >= 2) list.push({ label: "混搭", hint: "把几版的优点合成一版", answer: "这几版各有可取之处，帮我把优点合成一版再给我看。" });
    list.push({ label: "都不太对", hint: "换个思路再给两版", answer: `这${n > 1 ? "几版" : "版"}方向都不太对，换个思路再给我两版。` });
  } else {
    list.push({ label: "换一批", hint: "这几个方向都不太对，再来 3 个", answer: "这几个都不太对，换 3 个不同方向再给我一批。" });
    if (n >= 2) list.push({ label: "你替我定", hint: "主编从这几个里挑一个，说明理由", answer: "这个你替我定，从这几个里挑一个，说清为什么，然后接着往下。" });
  }
  list.push({ label: "先放一放", hint: "记进这张卡的 open 清单，不为它停下", answer: "这一项先放一放，记进对应卡的 open 清单，不为它停下，接着往下。" });
  return list;
}
