import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { CAPABILITY_IDS, capabilityEntry, capabilityRoster, isCapabilityId } from "../capabilities.js";
import { text, type ToolContext } from "./shared.js";

/**
 * 主编自己进场一条能力。作者点按钮走 capability.run，内核以主编身份送进同一份正文；
 * 加载说明不算选定创作方案，也不算获得写入授权。
 */
export function makeLoadCapabilityTool(_ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "load_capability",
    label: "进入能力",
    description:
      "读取一项能力的说明，了解要做到什么、最后交出什么结果，以及哪些事不在它的范围内。根据当前对话和已有授权安排工作。加载说明本身不会创作或写入文件。清单：\n" +
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
