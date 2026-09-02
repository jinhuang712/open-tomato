import type { DocKindId } from "@opentomato/core/protocol";
import { displayPath } from "../doclink";
import { actions } from "../state";

/** 一个可点的文档引用，按钮形态，显示中文目录/id */
export function DocLink(props: { kind: DocKindId | string; id: string; class?: string }) {
  return (
    <button
      class={`doc-link ${props.class ?? ""}`}
      title={`打开 ${displayPath(props.kind, props.id)}`}
      onClick={(e) => {
        e.stopPropagation();
        actions.openDoc(props.kind as DocKindId, props.id);
      }}
    >
      {displayPath(props.kind, props.id)}
    </button>
  );
}
