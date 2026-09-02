/** textarea 随内容长高，到 maxPx 后转成内部滚动 */
export function autoGrow(el: HTMLTextAreaElement, maxPx = Math.round(window.innerHeight * 0.4)) {
  el.style.height = "auto";
  const h = Math.min(el.scrollHeight, maxPx);
  el.style.height = `${h}px`;
  el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
}
