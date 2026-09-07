import { isSettled } from "@opentomato/core/protocol";
import type { DocHeader, DocKindId, PinRef } from "@opentomato/core/protocol";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { bridge } from "../bridge";
import { actions, state } from "../state";

/**
 * 侧栏分五个工作分区，按作者的工作分，不按文件类型分：综述（简介 + 守则）、设定（人物 + 世界设定）、大纲（卷 → 里程碑 + 章纲）、线索、正文。
 * 左侧 40px 竖条放单字，顺序是综 设 纲 线 文：先是全书的底子（这本书是什么、里面有谁有什么），再是结构（怎么排、哪些线在跑），最后是落到纸上的字。
 * 右侧 232px 面板只装当前分区。
 * 打开一张卡时竖条自动切到它所在的分区；作者手点竖条则以他为准，直到下一次打开卡。
 * 机检结果只在有问题的卡旁点一个点；竖条上聚合成一个点，收在别的分区里的问题不会被藏掉。
 * 已收束（done / retired）的卡从组里挪走，收进「已收束 · n」一行，默认折叠，不计入数量；打开的正是一张已收束的卡时自动展开。
 * 竖条最上面是「置顶」：作者顶上来的几张卡，跨分区。它是作者的工作台状态，不是故事内容：存项目的 settings.json，不进卡、不过审批门、模型不看。
 */

type SectionId = "pinned" | "overview" | "setting" | "outline" | "threads" | "manuscript";
interface Section {
  id: SectionId;
  glyph: string;
  label: string;
  kinds: DocKindId[];
}
const SECTIONS: Section[] = [
  { id: "overview", glyph: "综", label: "综述", kinds: ["brief", "rules"] },
  { id: "setting", glyph: "设", label: "设定", kinds: ["characters", "world"] },
  { id: "outline", glyph: "纲", label: "大纲", kinds: ["volumes", "milestones", "chapters"] },
  { id: "threads", glyph: "线", label: "线索", kinds: ["threads"] },
  { id: "manuscript", glyph: "文", label: "正文", kinds: ["manuscript"] },
];
const sectionOf = (kind: DocKindId) => SECTIONS.find((s) => s.kinds.includes(kind))!;

const UNTYPED = "未分类";

/** 卷纲 id 是两位数字，章纲 / 正文 id 是四位；引用可以写「1」「01」「第一卷」，一律按数字对 */
const digits = (v: unknown, width: number) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d === "" ? null : d.padStart(width, "0");
};
/** 里程碑 id 是 slug：引用按同样的规则压一遍再对 */
const slug = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v.trim() !== "" ? v.split(/[,，、]/).map((s) => s.trim()) : []);
const orderOf = (d: DocHeader) => {
  const n = Number(d.extra.order);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

export function Sidebar() {
  const [picked, setPicked] = createSignal<SectionId | null>(null);
  const [pins, setPins] = createSignal<PinRef[]>([]);
  createEffect(() => {
    const root = state.project?.root;
    setPins([]);
    if (!root) return;
    void bridge
      .request("project.pins.get", {})
      .then((p) => {
        if (state.project?.root === root) setPins(p);
      })
      .catch(() => {});
  });
  const isPinned = (d: PinRef) => pins().some((p) => p.kind === d.kind && p.id === d.id);
  const togglePin = (d: PinRef) => {
    const next = isPinned(d) ? pins().filter((p) => !(p.kind === d.kind && p.id === d.id)) : [...pins(), { kind: d.kind, id: d.id }];
    setPins(next);
    void bridge.request("project.pins.set", { pins: next }).catch(() => {});
  };
  // 顶上来的卡按顶的顺序排；已经删掉的卡自动消失
  const pinnedDocs = () => pins().flatMap((p) => state.docs.filter((d) => d.kind === p.kind && d.id === p.id));
  // 跟随正在看的卡；作者手点竖条后以他为准，直到下一次打开卡
  createEffect(() => {
    if (state.view.type === "doc") setPicked(sectionOf(state.view.kind).id);
  });
  const active = () => picked() ?? (state.view.type === "doc" ? sectionOf(state.view.kind).id : "overview");

  const activeDoc = () => (state.view.type === "doc" ? `${state.view.kind}/${state.view.id}` : null);
  // 侧栏只为必须修 / 建议改亮点；info 是事实不是判词，不亮
  const issueOf = (kind: string, id: string) => state.issues?.find((i) => i.kind === kind && i.id === id && i.level !== "info");
  const sectionHasIssue = (s: Section) => !!state.issues?.some((i) => i.level !== "info" && s.kinds.includes(i.kind as DocKindId));

  const docsOf = (k: DocKindId) => state.docs.filter((d) => d.kind === k);
  const kindOf = (k: DocKindId) => state.kinds.find((x) => x.id === k);
  const kindLabel = (k: DocKindId) => kindOf(k)?.label ?? k;

  const item = (d: DocHeader, indent = 16, right?: string) => {
    const issue = () => issueOf(d.kind, d.id);
    const on = () => activeDoc() === `${d.kind}/${d.id}`;
    const settled = () => isSettled(d.status);
    return (
      <div class={`group w-full h-7 flex items-center gap-2 pr-1 rounded-md ${on() ? "bg-paper-3 text-ink" : settled() ? "text-ink-3 hover:bg-paper-3 hover:text-ink-2" : "text-ink-2 hover:bg-paper-3 hover:text-ink"}`} style={{ "padding-left": `${indent}px` }}>
        <button class="flex-1 min-w-0 h-full flex items-center gap-2 text-left" onClick={() => actions.openDoc(d.kind, d.id)} title={issue()?.message ?? d.summary}>
          <span class="truncate">{d.title}</span>
          <span class="flex-1" />
          <Show when={right}>
            <span class="shrink-0 text-xs text-ink-3 tabular-nums">{right}</span>
          </Show>
          <Show when={issue()}>{(i) => <span class={`w-1.5 h-1.5 rounded-full shrink-0 ${i().level === "error" ? "bg-danger" : "bg-warn"}`} />}</Show>
        </button>
        <button
          class={`w-5 h-5 shrink-0 flex items-center justify-center rounded hover:bg-paper-4 ${isPinned(d) ? "text-ink-2" : "text-ink-3 opacity-0 group-hover:opacity-100"}`}
          onClick={() => togglePin(d)}
          title={isPinned(d) ? "取消置顶这张卡" : "置顶这张卡"}
        >
          <PinIcon />
        </button>
      </div>
    );
  };

  const heading = (label: string, count: string | number, top = false) => (
    <div class={`h-7.5 flex items-center gap-2 px-2 text-ink ${top ? "" : "mt-3"}`}>
      <span class="flex-1">{label}</span>
      <span class="text-xs text-ink-3 tabular-nums">{count}</span>
    </div>
  );
  const groupLabel = (label: string, count: number | string, indent = 8) => (
    <div class="h-6 flex items-center gap-2 pr-2 text-xs text-ink-3 select-none" style={{ "padding-left": `${indent}px` }}>
      <span class="flex-1">{label}</span>
      <span class="tabular-nums">{count}</span>
    </div>
  );

  /** 已收束的卡：一行折叠，正在看的是其中一张时自动展开 */
  const SettledFold = (props: { docs: DocHeader[]; indent?: number }) => {
    const [open, setOpen] = createSignal(false);
    const forced = () => props.docs.some((d) => activeDoc() === `${d.kind}/${d.id}`);
    const shown = () => open() || forced();
    return (
      <Show when={props.docs.length > 0}>
        <button
          class="w-full h-7 flex items-center gap-1.5 pr-2 rounded-md text-xs text-ink-3 hover:bg-paper-3 hover:text-ink-2"
          style={{ "padding-left": `${props.indent ?? 8}px` }}
          onClick={() => setOpen(!shown())}
        >
          <Chevron down={shown()} />
          <span class="flex-1 text-left">已收束</span>
          <span class="tabular-nums">{props.docs.length}</span>
        </button>
        <Show when={shown()}>
          <For each={props.docs}>{(d) => item(d, (props.indent ?? 8) + 8)}</For>
        </Show>
      </Show>
    );
  };

  /**
   * 通用分组列表：按这类卡声明的 group 字段分组。给了 order 按固定顺序出组；没给的是动态组，这本书里实际写了哪些值就出哪些组，卡多的在前。
   * 字段没填的归「未分类」垫底。已收束的卡不进组，折在末尾。
   */
  const GroupedList = (props: { kind: DocKindId; top?: boolean }) => {
    const groups = createMemo(() => {
      const live = docsOf(props.kind).filter((d) => !isSettled(d.status));
      const spec = kindOf(props.kind)?.group;
      if (!spec) return { live, groups: null as null | { label: string; docs: DocHeader[] }[] };
      const by = new Map<string, DocHeader[]>();
      for (const d of live) {
        const v = d.extra[spec.field];
        const key = typeof v === "string" && v.trim() !== "" ? v.trim() : UNTYPED;
        by.set(key, [...(by.get(key) ?? []), d]);
      }
      const keys = spec.order
        ? [...spec.order, ...[...by.keys()].filter((k) => !(spec.order as readonly string[]).includes(k) && k !== UNTYPED), UNTYPED]
        : [...[...by.keys()].filter((k) => k !== UNTYPED).sort((a, b) => by.get(b)!.length - by.get(a)!.length), UNTYPED];
      return { live, groups: keys.flatMap((k) => (by.has(k) ? [{ label: k, docs: by.get(k)! }] : [])) };
    });
    const settled = () => docsOf(props.kind).filter((d) => isSettled(d.status));
    return (
      <>
        {heading(kindLabel(props.kind), groups().live.length === 0 && settled().length === 0 ? "—" : groups().live.length, props.top)}
        <Show when={groups().groups} fallback={<For each={groups().live}>{(d) => item(d)}</For>}>
          {(gs) => (
            <For each={gs()}>
              {(g) => (
                <>
                  {groupLabel(g.label, g.docs.length)}
                  <For each={g.docs}>{(d) => item(d)}</For>
                </>
              )}
            </For>
          )}
        </Show>
        <SettledFold docs={settled()} />
      </>
    );
  };

  /** 置顶：顶上来的卡按顶的顺序排，行尾标类别，跨分区混排光看名字分不清 */
  const Pinned = () => (
    <>
      {heading("置顶", pinnedDocs().length === 0 ? "—" : pinnedDocs().length, true)}
      <Show when={pinnedDocs().length > 0} fallback={<div class="px-2 pt-1 text-xs text-ink-3 leading-relaxed">正在写的几张卡顶在这里。把鼠标放到任意一张卡上，点右边的图钉。</div>}>
        <For each={pinnedDocs()}>{(d) => item(d, 8, kindLabel(d.kind))}</For>
      </Show>
    </>
  );

  /** 综述：简介一行（单例）+ 守则按必须 / 尽量 */
  const Overview = () => {
    const brief = () => docsOf("brief")[0];
    return (
      <>
        <Show when={brief()} fallback={<div class="h-7.5 flex items-center px-2 text-ink-3">简介</div>}>
          {(b) => (
            <button
              class={`w-full h-7.5 flex items-center px-2 rounded-md text-left ${activeDoc() === `brief/${b().id}` ? "bg-paper-3 text-ink" : "text-ink hover:bg-paper-3"}`}
              onClick={() => actions.openDoc("brief", b().id)}
              title={b().summary}
            >
              简介
            </button>
          )}
        </Show>
        <GroupedList kind="rules" />
      </>
    );
  };

  /** 卷 → 这卷的里程碑 + 章。章按 volume 归卷，里程碑按卷纲的 milestones 列表归卷；没归上的垫底 */
  const volumeTree = createMemo(() => {
    const volumes = [...docsOf("volumes")].sort((a, b) => a.id.localeCompare(b.id));
    const chapters = [...docsOf("chapters")].sort((a, b) => a.id.localeCompare(b.id));
    const milestones = [...docsOf("milestones")].sort((a, b) => orderOf(a) - orderOf(b));
    const manuscripts = [...docsOf("manuscript")].sort((a, b) => a.id.localeCompare(b.id));
    const chapterVolume = new Map<string, string>();
    for (const c of chapters) {
      const v = digits(c.extra.volume, 2);
      if (v && volumes.some((x) => x.id === v)) chapterVolume.set(c.id, v);
    }
    const milestoneVolume = new Map<string, string>();
    for (const v of volumes) for (const m of asList(v.extra.milestones)) milestoneVolume.set(slug(m), v.id);
    const rows = volumes.map((v) => ({
      volume: v,
      milestones: milestones.filter((m) => milestoneVolume.get(m.id) === v.id),
      chapters: chapters.filter((c) => chapterVolume.get(c.id) === v.id),
      // 正文和章纲一章对一章、同一个编号；正文没有 volume 字段，借章纲的归卷
      manuscripts: manuscripts.filter((m) => chapterVolume.get(m.id) === v.id),
    }));
    return {
      rows,
      looseMilestones: milestones.filter((m) => !milestoneVolume.has(m.id)),
      looseChapters: chapters.filter((c) => !chapterVolume.has(c.id)),
      looseManuscripts: manuscripts.filter((m) => !chapterVolume.has(m.id)),
      counts: { volumes: volumes.length, chapters: chapters.length, manuscripts: manuscripts.length },
    };
  });

  /** 哪几卷展开：默认只开正在看的卡所在那卷，没有就开最后一卷（正在写的多半是最后一卷） */
  const [openVolumes, setOpenVolumes] = createSignal<Record<string, boolean>>({});
  const volumeOpen = (vid: string, contains: () => boolean, isLast: boolean) => {
    const o = openVolumes()[vid];
    if (o !== undefined) return o;
    if (contains()) return true;
    return isLast && state.view.type !== "doc";
  };
  const toggleVolume = (vid: string, cur: boolean) => setOpenVolumes((o) => ({ ...o, [vid]: !cur }));

  const VolumeRow = (props: { volume: DocHeader; open: boolean; count: string; onToggle: () => void }) => {
    const on = () => activeDoc() === `volumes/${props.volume.id}`;
    return (
      <div class={`h-7 flex items-center gap-1.5 pl-2 pr-2 rounded-md ${on() ? "bg-paper-3 text-ink" : "text-ink-2 hover:bg-paper-3"}`}>
        <button class="w-4 h-4 -ml-0.5 flex items-center justify-center rounded hover:bg-paper-4" onClick={props.onToggle} title={props.open ? "收起这卷" : "展开这卷"}>
          <Chevron down={props.open} />
        </button>
        <button class="flex-1 min-w-0 flex items-center gap-2 text-left hover:text-ink" onClick={() => actions.openDoc("volumes", props.volume.id)} title={props.volume.summary}>
          <span class="truncate">{props.volume.title}</span>
          <span class="flex-1" />
          <Show when={issueOf("volumes", props.volume.id)}>{(i) => <span class={`w-1.5 h-1.5 rounded-full shrink-0 ${i().level === "error" ? "bg-danger" : "bg-warn"}`} />}</Show>
          <span class="shrink-0 text-xs text-ink-3 tabular-nums">{props.count}</span>
        </button>
      </div>
    );
  };

  const Outline = () => {
    const t = volumeTree;
    const empty = () => t().counts.volumes === 0 && t().counts.chapters === 0 && t().looseMilestones.length === 0;
    return (
      <>
        {heading("大纲", empty() ? "—" : `${t().counts.volumes} 卷 · ${t().counts.chapters} 章`, true)}
        <For each={t().rows}>
          {(r, i) => {
            const contains = () => [...r.milestones, ...r.chapters].some((d) => activeDoc() === `${d.kind}/${d.id}`) || activeDoc() === `volumes/${r.volume.id}`;
            const open = () => volumeOpen(r.volume.id, contains, i() === t().rows.length - 1);
            return (
              <>
                <VolumeRow volume={r.volume} open={open()} count={String(r.volume.extra.chapters ?? "")} onToggle={() => toggleVolume(r.volume.id, open())} />
                <Show when={open()}>
                  <Show when={r.milestones.length > 0}>
                    {groupLabel("里程碑", r.milestones.length, 24)}
                    <For each={r.milestones}>{(d) => item(d, 32)}</For>
                  </Show>
                  <Show when={r.chapters.length > 0}>
                    {groupLabel("章纲", r.chapters.length, 24)}
                    <For each={r.chapters.filter((c) => !isSettled(c.status))}>{(d) => item(d, 32)}</For>
                    <SettledFold docs={r.chapters.filter((c) => isSettled(c.status))} indent={24} />
                  </Show>
                </Show>
              </>
            );
          }}
        </For>
        <Show when={t().looseMilestones.length > 0}>
          {groupLabel(t().counts.volumes === 0 ? "里程碑" : "未分配的里程碑", t().looseMilestones.length)}
          <For each={t().looseMilestones.filter((m) => !isSettled(m.status))}>{(d) => item(d)}</For>
          <SettledFold docs={t().looseMilestones.filter((m) => isSettled(m.status))} />
        </Show>
        <Show when={t().looseChapters.length > 0}>
          {groupLabel(t().counts.volumes === 0 ? "章纲" : "未分卷的章纲", t().looseChapters.length)}
          <For each={t().looseChapters}>{(d) => item(d)}</For>
        </Show>
      </>
    );
  };

  const words = (d: DocHeader) => {
    const n = Number(d.extra.words);
    return Number.isFinite(n) && n > 0 ? (n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : String(n)) : undefined;
  };
  const Manuscript = () => {
    const t = volumeTree;
    const total = () => docsOf("manuscript").reduce((s, d) => s + (Number(d.extra.words) || 0), 0);
    const count = () => (t().counts.manuscripts === 0 ? "—" : `${t().counts.manuscripts} 章 · ${total() >= 10000 ? `${(total() / 10000).toFixed(1)} 万字` : `${total()} 字`}`);
    const withText = () => t().rows.filter((r) => r.manuscripts.length > 0);
    return (
      <>
        {heading("正文", count(), true)}
        <For each={withText()}>
          {(r, i) => {
            const contains = () => r.manuscripts.some((d) => activeDoc() === `manuscript/${d.id}`);
            const open = () => volumeOpen(r.volume.id, contains, i() === withText().length - 1);
            return (
              <>
                <VolumeRow volume={r.volume} open={open()} count={`${r.manuscripts.length} 章`} onToggle={() => toggleVolume(r.volume.id, open())} />
                <Show when={open()}>
                  <For each={r.manuscripts}>{(d) => item(d, 24, words(d))}</For>
                </Show>
              </>
            );
          }}
        </For>
        <Show when={t().looseManuscripts.length > 0}>
          <Show when={t().rows.some((r) => r.manuscripts.length > 0)}>{groupLabel("未分卷", t().looseManuscripts.length)}</Show>
          <For each={t().looseManuscripts}>{(d) => item(d, 16, words(d))}</For>
        </Show>
      </>
    );
  };

  return (
    <div class="h-full flex min-h-0">
      <div class="w-10 shrink-0 border-r border-line flex flex-col items-center gap-1 pt-2">
        <button
          class={`w-8 h-8 rounded-md flex items-center justify-center ${active() === "pinned" ? "bg-paper-3 text-ink" : "text-ink-3 hover:bg-paper-3 hover:text-ink-2"}`}
          onClick={() => setPicked("pinned")}
          title="置顶"
        >
          <PinIcon size={14} />
        </button>
        <div class="w-5 h-px bg-line my-0.5" />
        <For each={SECTIONS}>
          {(s) => (
            <button
              class={`relative w-8 h-8 rounded-md flex items-center justify-center text-[14px] leading-none ${active() === s.id ? "bg-paper-3 text-ink" : "text-ink-3 hover:bg-paper-3 hover:text-ink-2"}`}
              onClick={() => setPicked(s.id)}
              title={s.label}
            >
              {s.glyph}
              <Show when={sectionHasIssue(s)}>
                <span class="absolute top-[5px] right-[5px] w-[5px] h-[5px] rounded-full bg-warn" />
              </Show>
            </button>
          )}
        </For>
      </div>
      <div class="flex-1 min-w-0 h-full overflow-y-auto px-2 py-3">
        <Show when={active() === "pinned"}>
          <Pinned />
        </Show>
        <Show when={active() === "overview"}>
          <Overview />
        </Show>
        <Show when={active() === "setting"}>
          <GroupedList kind="characters" top />
          <GroupedList kind="world" />
        </Show>
        <Show when={active() === "outline"}>
          <Outline />
        </Show>
        <Show when={active() === "threads"}>
          <GroupedList kind="threads" top />
        </Show>
        <Show when={active() === "manuscript"}>
          <Manuscript />
        </Show>
      </div>
    </div>
  );
}

/** 正着画的图钉：帽子、往下张开的身子、一根针。斜着的那版在小尺寸下认不出是什么 */
function PinIcon(props: { size?: number }) {
  return (
    <svg
      width={props.size ?? 13}
      height={props.size ?? 13}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5.5 2h5" />
      <path d="M6.75 2v4L4.5 8h7L9.25 6V2" />
      <path d="M8 8v5" />
    </svg>
  );
}

function Chevron(props: { down: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-ink-3">
      <path d={props.down ? "M2 3l3 3 3-3" : "M3 2l3 3-3 3"} />
    </svg>
  );
}
