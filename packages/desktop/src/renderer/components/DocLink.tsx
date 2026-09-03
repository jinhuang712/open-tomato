import type { DocKindId } from "@opentomato/core/protocol";
import { displayPath, resolveLegacyRef } from "../doclink";
import { actions } from "../state";

/** 一个可点的文档引用，按钮形态，显示给人看的路径（中文目录/名字） */
export function DocLink(props: { kind: DocKindId | string; id: string; class?: string }) {
  const ref = () => resolveLegacyRef(props.kind as DocKindId, props.id);
  const shown = () => displayPath(ref().kind, ref().id);
  return (
    <button
      class={`doc-link ${props.class ?? ""}`}
      title={`打开 ${shown()}`}
      onClick={(e) => {
        e.stopPropagation();
        actions.openDoc(ref().kind, ref().id);
      }}
    >
      {shown()}
    </button>
  );
}
