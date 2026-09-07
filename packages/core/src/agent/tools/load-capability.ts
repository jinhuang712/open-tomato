import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { CAPABILITY_IDS, capabilityEntry, capabilityRoster, isCapabilityId } from "../capabilities.js";
import { text, type ToolContext } from "./shared.js";

/**
 * 主编自己进场一条能力。作者点按钮走 capability.run，内核以主编身份送进同一份正文；
 * 加载说明不产生创作选择或写入授权。
 */
export function makeLoadCapabilityTool(_ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "load_capability",
    label: "进入能力",
    description:
      "读取一项能力的目标、交付物和边界，按当前对话与已有授权开展工作。加载说明本身不执行创作或写入。清单：\n" +
      capabilityRoster(),
    parameters: Type.Object({
      id: Type.String({ description: `能力 id，可选：${CAPABILITY_IDS.join(" / ")}` }),
    }),
    execute: async (_id, params) => {
      if (!isCapabilityId(params.id)) throw new Error(`未知能力：${params.id}，可选 ${CAPABILITY_IDS.join(" / ")}`);
      return text(capabilityEntry(params.id, "lead"));
    },
  });
}
