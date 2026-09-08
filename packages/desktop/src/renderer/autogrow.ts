/** textarea 随内容长高，到 maxPx 后转成内部滚动 */
export function autoGrow(el: HTMLTextAreaElement, maxPx = Math.round(window.innerHeight * 0.4)) {
  // 祖先被 display:none 隐藏时（提问 / 审批 dock 顶掉输入框）量不到真实布局，
  // scrollHeight 是 0，写下去就把框压扁，等 dock 撤了也回不来。此时什么都不做，
  // 保留上一次可见时算出的高度。
  if (el.offsetParent === null) return;
  el.style.height = "auto";
  const h = Math.min(el.scrollHeight, maxPx);
  el.style.height = `${h}px`;
  el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
}
