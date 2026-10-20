import { parseArgs } from "node:util";
import { CAPABILITIES, isCapabilityId } from "../src/agent/capabilities.js";
import { isRoleId, rolePrompt } from "../src/agent/roles.js";
import { isHostId } from "../src/text/host.js";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: { host: { type: "string", default: "opencode" }, role: { type: "string", default: "director" }, capability: { type: "string" } },
});
if (!isHostId(values.host)) throw new Error(`Unknown host: ${values.host}`);
if (!isRoleId(values.role)) throw new Error(`Unknown role: ${values.role}`);
let output = rolePrompt(values.role, values.host);
if (values.capability) {
  if (!isCapabilityId(values.capability)) throw new Error(`Unknown capability: ${values.capability}`);
  output += `\n\n---\n\n${CAPABILITIES[values.capability].load(values.host)}`;
}
process.stdout.write(`${output}\n`);
