/** 附件按 markdown 围栏拼进消息末尾，主编一眼看出哪段是作者说的、哪段是带来的材料 */
export function inlineAttachments(atts: { name: string; content: string }[]): string[] {
  return atts.map((a) => `附件「${a.name}」：\n\n\`\`\`\`markdown\n${a.content.trim()}\n\`\`\`\``);
}

const ATTACHMENT_RE = /附件「([^」\n]+)」：\n\n````markdown\n([\s\S]*?)\n````(?=\n\n|$)/g;

/**
 * inlineAttachments 的逆操作：把消息末尾的附件围栏拆回来，界面上正文照常显示、附件折叠成小卡。
 * 发给模型的字符串不变，只是不再把几千字原文直接打印在气泡里。
 */
export function splitAttachments(text: string): { body: string; attachments: { name: string; content: string }[] } {
  const attachments: { name: string; content: string }[] = [];
  const body = text
    .replace(ATTACHMENT_RE, (_m, name: string, content: string) => {
      attachments.push({ name, content });
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { body, attachments };
}
