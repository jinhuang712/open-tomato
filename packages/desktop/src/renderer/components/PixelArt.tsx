import { For } from "solid-js";

type Cell = { color: string };

/** 按行主序铺一组色块。columns 是 grid-template-columns 的字面量，行高由 rowHeight 定 */
export function PixelGrid(props: { cells: Cell[]; columns: string; rowHeight: number }) {
  return (
    <div style={{ display: "grid", "grid-template-columns": props.columns, "grid-auto-rows": `${props.rowHeight}px` }}>
      <For each={props.cells}>{(c) => <div style={{ background: c.color }} />}</For>
    </div>
  );
}

/** 5 列 × 6 行的大写位图字形，1 = 实心 */
const GLYPHS: Record<string, string[]> = {
  o: ["11111", "10001", "10001", "10001", "10001", "11111"],
  p: ["11110", "10001", "10001", "11110", "10000", "10000"],
  e: ["11111", "10000", "10000", "11111", "10000", "11111"],
  n: ["10001", "11001", "10101", "10011", "10001", "10001"],
  t: ["11111", "00100", "00100", "00100", "00100", "00100"],
  m: ["10001", "11011", "10101", "10001", "10001", "10001"],
  a: ["01110", "10001", "10001", "11111", "10001", "10001"],
};

const GLYPH_COLS = 5;
const GLYPH_ROWS = 6;
const EMPTY_GLYPH = Array.from({ length: GLYPH_ROWS }, () => "0".repeat(GLYPH_COLS));

type Segment = { until: number; base: string; hi: string };

/** 字母下标落在哪一段就用哪一段的颜色：OPEN 灰 · TOMA 红 · TO 绿 */
const SEGMENTS: Segment[] = [
  { until: 4, base: "var(--color-pixel-gray)", hi: "var(--color-pixel-gray-hi)" },
  { until: 8, base: "var(--color-pixel-red)", hi: "var(--color-pixel-red-hi)" },
  { until: 10, base: "var(--color-pixel-green)", hi: "var(--color-pixel-green-hi)" },
];
const LAST_SEGMENT: Segment = SEGMENTS[SEGMENTS.length - 1] ?? { until: 0, base: "transparent", hi: "transparent" };

const filled = (rows: string[], r: number, c: number) => rows[r]?.[c] === "1";

export function PixelWordmark(props: { cellWidth?: number; cellHeight?: number; gap?: number }) {
  const word = "opentomato";
  const cellWidth = props.cellWidth ?? 14;
  const cellHeight = props.cellHeight ?? 18;
  const gap = props.gap ?? 8;
  const stride = GLYPH_COLS + 1;

  const bitRows: string[] = [];
  for (let r = 0; r < GLYPH_ROWS; r++) {
    let line = "";
    for (let i = 0; i < word.length; i++) {
      const glyph = GLYPHS[word[i] ?? ""] ?? EMPTY_GLYPH;
      line += glyph[r] ?? "0".repeat(GLYPH_COLS);
      if (i < word.length - 1) line += "0";
    }
    bitRows.push(line);
  }
  const cols = word.length * stride - 1;

  // 上方或左侧是空格的实心块当受光面，其余当底色，做出浮雕感
  const cells: Cell[] = [];
  for (let r = 0; r < GLYPH_ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      if (!filled(bitRows, r, c)) {
        cells.push({ color: "transparent" });
        continue;
      }
      const topEmpty = r === 0 || !filled(bitRows, r - 1, c);
      const leftEmpty = c === 0 || !filled(bitRows, r, c - 1);
      const letterIdx = Math.floor(c / stride);
      const seg = SEGMENTS.find((s) => letterIdx < s.until) ?? LAST_SEGMENT;
      cells.push({ color: topEmpty || leftEmpty ? seg.hi : seg.base });
    }
  }

  const tracks: string[] = [];
  for (let c = 0; c < cols; c++) tracks.push(c % stride === GLYPH_COLS ? `${gap}px` : `${cellWidth}px`);

  return <PixelGrid cells={cells} columns={tracks.join(" ")} rowHeight={cellHeight} />;
}
