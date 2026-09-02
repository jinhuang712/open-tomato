import type { DocKindId } from "@opentomato/core/protocol";
import { actions } from "../state";

/** 一个可点的文档引用，按钮形态，给 tool 卡和 dock 用 */
export function DocLink(props: { kind: DocKindId | string; id: string; class?: string }) {
  return (
    <button
      class={`doc-link font-mono ${props.class ?? ""}`}
      title={`打开 ${props.kind}/${props.id}`}
      onClick={(e) => {
        e.stopPropagation();
        actions.openDoc(props.kind as DocKindId, props.id);
      }}
    >
      {props.kind}/{props.id}
    </button>
  );
}
