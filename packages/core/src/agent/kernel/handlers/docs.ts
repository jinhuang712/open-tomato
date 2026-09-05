import { DOC_KIND_IDS, DOC_KINDS, resolveKind } from "../../../project/kinds.js";
import { contentHash } from "../../../project/records.js";
import type { DocKindId } from "../../../protocol.js";
import type { HandlerMap, KernelApi } from "./shared.js";

/** 界面 / 外部调用传来的 kind 先过一遍校验，别让 undefined 一路漏到 DOC_KINDS[kind] 上炸出 TypeError */
function kindOf(v: unknown): DocKindId {
  const k = resolveKind(v);
  if (!k) throw new Error(`未知的 kind：${String(v)}，可选 ${DOC_KIND_IDS.map((x) => `${x}（${DOC_KINDS[x].dir}）`).join(" / ")}`);
  return k;
}

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
      }
      await api.emitDocsChanged();
      return header;
    },
    "doc.template": async ({ kind }) => api.requireStore().template(kindOf(kind)),
    "search.query": async ({ query, limit }) => (await api.searchIndex()).query(query, limit),
  };
}
