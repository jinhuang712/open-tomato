import { DOC_KIND_IDS, DOC_KINDS, resolveKind } from "../../../project/kinds.js";
import { contentHash } from "../../../project/records.js";
import { stubPrompt } from "../../../protocol.js";
import type { DocKindId } from "../../../protocol.js";
import { fill, loadPrompt } from "../../prompt-text.js";
import { zhPath } from "../../tools/shared.js";
import { LEAD_ID } from "../types.js";
import type { HandlerMap, KernelApi } from "./shared.js";

/** 作者手改完，交主编复核改动范围与一致性 */
const AUTHOR_EDIT_CHECK = loadPrompt("kernel/author-edit-check");

/** 送给主编的 diff 上限：整章重写的 patch 能有上千行，超了就截断，够它判断范围就行 */
const PATCH_LIMIT = 8000;

/** 界面 / 外部调用传来的 kind 先过一遍校验，别让 undefined 一路漏到 DOC_KINDS[kind] 上炸出 TypeError */
function kindOf(v: unknown): DocKindId {
  const k = resolveKind(v);
  if (!k) throw new Error(`未知的 kind：${String(v)}，可选 ${DOC_KIND_IDS.map((x) => `${x}（${DOC_KINDS[x].dir}）`).join(" / ")}`);
  return k;
}

const clip = (patch: string) => (patch.length <= PATCH_LIMIT ? patch : `${patch.slice(0, PATCH_LIMIT)}\n…（diff 太长，后面截断了，要看全文自己 read_doc）`);

export function docHandlers(api: KernelApi): Pick<HandlerMap, "doc.read" | "doc.write" | "doc.template" | "search.query"> {
  return {
    "doc.read": async ({ kind, id }) => api.requireStore().read(kindOf(kind), id),
    "doc.write": async ({ kind, id, raw, expectBefore }) => {
      // 作者在阅读界面手改：不走审批门，但改动是全系统最高信号的一条批，patch 随批落盘
      const store = api.requireStore();
      const k = kindOf(kind);
      const preview = await store.previewWrite(k, id, raw);
      const header = await store.write(k, preview.id, preview.after, expectBefore === undefined ? {} : { expectBefore });
      if (preview.before !== preview.after) {
        await store.records.appendMark({
          kind: k,
          id: preview.id,
          type: "edit",
          by: "author",
          before: contentHash(preview.before),
          version: contentHash(preview.after),
          patch: preview.patch,
        });
        // 落完盘把 diff 交给主编 double check：牵连了别的材料、或跟已定的东西对不上，由它说出来
        if (await api.ensureLead()) {
          api.sendTo(LEAD_ID, stubPrompt("作者手改", fill(AUTHOR_EDIT_CHECK, { PATH: zhPath(k, preview.id), PATCH: clip(preview.patch) })), "followUp");
        }
      }
      await api.emitDocsChanged();
      return header;
    },
    "doc.template": async ({ kind }) => api.requireStore().template(kindOf(kind)),
    "search.query": async ({ query, limit }) => (await api.searchIndex()).query(query, limit),
  };
}
