"use client";

import { COLS, ROWS, isOffPlate, type Card } from "@/lib/pitch/engine";

// The wristband card, drawn in inches so it prints at true size.
//
// Row 0 is the column header (P / L corner cells in black, digits shaded),
// rows 0-9 below with row numbers at the left of each block. The pitch and
// location blocks sit apart with a wide gap and each is split down the middle
// by a narrow gap. A thin strip between rows 4 and 5 carries "CARD <id>".
// No inner gridlines; every other row shaded.

const RN = 0.7; // row-number column, in cell widths
const NARROW = 0.22;
const WIDE = 0.6;
const STRIP = 0.45; // in row heights

export function CardSvg({
  card,
  width,
  height,
  shade,
  className,
  printSize,
}: {
  card: Card;
  width: number; // inches
  height: number; // inches
  shade: boolean;
  className?: string;
  /** true: size the SVG in inches (print). false: fill the container (preview). */
  printSize?: boolean;
}) {
  const pc = card.pitchCols;
  const lc = COLS - pc;
  const units = RN + pc + NARROW + WIDE + RN + lc + NARROW;
  const u = width / units;
  const rowH = height / (ROWS + 1 + STRIP);
  const font = Math.min(u * 0.46, rowH * 0.78);
  const small = font * 0.55;

  // x position of each column's left edge, plus row-number column per block.
  const pitchRnX = 0;
  const colX: number[] = [];
  let x = RN * u;
  const pitchHalf = Math.ceil(pc / 2);
  for (let c = 0; c < pc; c++) {
    if (c === pitchHalf) x += NARROW * u;
    colX.push(x);
    x += u;
  }
  if (pitchHalf >= pc) x += NARROW * u;
  x += WIDE * u;
  const locRnX = x;
  x += RN * u;
  const locHalf = Math.ceil(lc / 2);
  for (let c = 0; c < lc; c++) {
    if (c === locHalf) x += NARROW * u;
    colX.push(x);
    x += u;
  }

  // y of header and each data row (strip sits between rows 4 and 5).
  const rowY = (r: number) => rowH * (1 + r + (r >= 5 ? STRIP : 0));
  const blocks = [
    { rnX: pitchRnX, first: 0, last: pc - 1, corner: "P" },
    { rnX: locRnX, first: pc, last: COLS - 1, corner: "L" },
  ];
  const blockRight = (b: (typeof blocks)[number]) => colX[b.last] + u;

  // Three-letter codes (HOx, HMx) are squeezed to fit their cell if needed.
  const fitWidth = (value: string, size: number) =>
    value.length >= 3 && value.length * size * 0.66 > u * 0.9 ? u * 0.9 : undefined;
  const text = (
    tx: number,
    ty: number,
    value: string,
    opts: { fill?: string; size?: number; fit?: boolean } = {}
  ) => (
    <text
      textLength={opts.fit ? fitWidth(value, opts.size ?? font) : undefined}
      lengthAdjust={opts.fit ? "spacingAndGlyphs" : undefined}
      x={tx}
      y={ty}
      fontSize={opts.size ?? font}
      fontFamily="Arial, Helvetica, sans-serif"
      fontWeight={700}
      textAnchor="middle"
      dominantBaseline="central"
      fill={opts.fill ?? "#000"}
    >
      {value}
    </text>
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={printSize ? `${width}in` : "100%"}
      height={printSize ? `${height}in` : undefined}
      className={className}
      style={{ background: "#fff", display: "block" }}
      role="img"
      aria-label={`Wristband card ${card.id}`}
    >
      <rect x={0} y={0} width={width} height={height} fill="#fff" />
      {blocks.map((b) => (
        <g key={b.corner}>
          {/* Shaded rows */}
          {shade &&
            Array.from({ length: ROWS }, (_, r) =>
              r % 2 === 1 ? (
                <rect key={r} x={b.rnX} y={rowY(r)} width={blockRight(b) - b.rnX} height={rowH} fill="#e3e3e3" />
              ) : null
            )}
          {/* Header row: corner in black, column digits shaded */}
          <rect x={b.rnX} y={0} width={RN * u} height={rowH} fill="#000" />
          {text(b.rnX + (RN * u) / 2, rowH / 2, b.corner, { fill: "#fff" })}
          {Array.from({ length: b.last - b.first + 1 }, (_, i) => b.first + i).map((c) => (
            <g key={c}>
              <rect x={colX[c]} y={0} width={u} height={rowH} fill="#bdbdbd" />
              {text(colX[c] + u / 2, rowH / 2, String(c))}
            </g>
          ))}
          {/* Row numbers */}
          {Array.from({ length: ROWS }, (_, r) => (
            <g key={r}>{text(b.rnX + (RN * u) / 2, rowY(r) + rowH / 2, String(r))}</g>
          ))}
        </g>
      ))}
      {/* Cells */}
      {card.grid.map((col, c) =>
        col.map((v, r) => (
          <g key={`${c}-${r}`}>{text(colX[c] + u / 2, rowY(r) + rowH / 2, v, { fill: isOffPlate(v) ? "#d40000" : "#000", fit: true })}</g>
        ))
      )}
      {/* Middle strip */}
      {text(width / 2, rowY(5) - (STRIP * rowH) / 2, `CARD ${card.id}`, { size: small })}
    </svg>
  );
}
