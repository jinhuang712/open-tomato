import { appCapabilityEntry as capabilityEntry } from "../src/text/app.js";
import { parseArgs } from "node:util";
import { isCapabilityId } from "../src/agent/capabilities.js";
import { isRoleId, rolePrompt } from "../src/agent/roles.js";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: { host: { type: "string", default: "opencode" }, role: { type: "string", default: "director" }, capability: { type: "string" } },
});
if (values.host !== "app" && values.host !== "opencode") throw new Error(`Unknown host: ${values.host}`);
if (!isRoleId(values.role)) throw new Error(`Unknown role: ${values.role}`);
if (values.capability && !isCapabilityId(values.capability)) throw new Error(`Unknown capability: ${values.capability}`);
// 插件自己的包负责组装；core 运行时不会反向依赖插件。
const plugin = values.host === "opencode" ? await import("../../opencode/src/text.ts") : undefined;
let output = plugin ? plugin.rolePrompt(values.role) : rolePrompt(values.role);
if (values.capability) {
  const id = values.capability as Parameters<typeof capabilityEntry>[0];
  output += `\n\n---\n\n${plugin ? plugin.capabilityPrompt(id) : capabilityEntry(id, "lead")}`;
}
process.stdout.write(`${output}\n`);
