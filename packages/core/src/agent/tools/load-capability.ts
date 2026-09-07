import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { CAPABILITY_IDS, capabilityEntry, capabilityRoster, isCapabilityId } from "../capabilities.js";
import { text, type ToolContext } from "./shared.js";

/**
 * 主编自己进场一条能力。作者点按钮走 capability.run，内核以主编身份送进同一份正文；
 * 主编自己想到了就调这个；拿不准作者要不要，先 ask_user 问一句再调。
 */
export function makeLoadCapabilityTool(_ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "load_capability",
    label: "进入能力",
    description:
      "进入一条打包好的工作流，拿到它的目标、交付物和边界。看盘面觉得该做了就直接进；拿不准作者此刻要不要，先 ask_user 问一句。进场后怎么走你自己定，缺的信息从盘面读，读不到再问作者。清单：\n" +
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
