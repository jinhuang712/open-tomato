/** frontmatter 里引用别的卡时写的是名字，跟内核 normalizeId 的 slug 规则对齐后才能和 id 比 */
export function refId(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
