"use client";

import { GRID_COLS, ROWS, isOffPlate, type Card } from "@/lib/pitch/engine";

// A wristband card, drawn in inches so it prints at true size. Used for both
// the pitch card (P pitch / L location) and the signs card (B batter / R
// runner). Two simple grids side by side. Each has
// 1-5 across the top and 0-9 down the side. Every other row shaded if asked.
// The card ID sits small along the bottom so the phone and card can be matched.

const RN = 0.65; // row-number column, in cell widths
const GAP = 0.45; // space between the two grids, in cell widths
const FOOT = 0.55; // footer (card ID), in row heights
const SHADE = "#d6e6f5"; // every other row: soft blue, prints light on any printer
const HEADER = "#1f2937"; // column-number row: dark, with white digits

export interface CardGrids {
  left: string[][];
  right: string[][];
  leftKey: string;
  rightKey: string;
  /** Footer text, e.g. "CARD 4703-PKH" or "SIGNS 5821-KPT". */
  label: string;
  id: string;
}

export function CardSvg({
  card,
  grids: given,
  width,
  height,
  shade,
  className,
  printSize,
  printScale = 100,
  leftColors,
  rightColors,
}: {
  card?: Card;
  grids?: CardGrids;
  width: number;
  height: number;
  shade: boolean;
  className?: string;
  printSize?: boolean;
  /** Percent to scale the printed size by, to correct a printer that does not print at true size. */
  printScale?: number;
  /** Text colour per value on the left grid (e.g. one colour per pitch type). */
  leftColors?: Record<string, string>;
  /** Text colour per value on the right grid (e.g. one colour per runner play). */
  rightColors?: Record<string, string>;
}) {
  const nCols = GRID_COLS.length;
  const units = 2 * (RN + nCols) + GAP;
  const u = width / units;
  const rowH = height / (ROWS + 1 + FOOT);
  const font = Math.min(u * 0.5, rowH * 0.72);
  const small = Math.min(font * 0.62, rowH * FOOT * 0.8);

  const g0: CardGrids = given ?? {
    left: card!.pitchGrid,
    right: card!.locGrid,
    leftKey: "P",
    rightKey: "L",
    label: `CARD ${card!.id}`,
    id: card!.id,
  };
  const grids = [
    { key: g0.leftKey, x0: 0, grid: g0.left, colors: leftColors },
    { key: g0.rightKey, x0: (RN + nCols + GAP) * u, grid: g0.right, colors: rightColors },
  ];

  const text = (tx: number, ty: number, value: string, opts: { fill?: string; size?: number; fit?: boolean } = {}) => {
    const size = opts.size ?? font;
    const squeeze = opts.fit && value.length >= 3 && value.length * size * 0.66 > u * 0.9;
    return (
      <text
        x={tx}
        y={ty}
        fontSize={size}
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
        fill={opts.fill ?? "#000"}
        textLength={squeeze ? u * 0.9 : undefined}
        lengthAdjust={squeeze ? "spacingAndGlyphs" : undefined}
      >
        {value}
      </text>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={printSize ? `${(width * printScale) / 100}in` : "100%"}
      height={printSize ? `${(height * printScale) / 100}in` : undefined}
      className={className}
      style={{ background: "#fff", display: "block" }}
      role="img"
      aria-label={`Wristband card ${g0.id}`}
      data-card-id={g0.id}
    >
      <rect x={0} y={0} width={width} height={height} fill="#fff" />
      {grids.map((g) => {
        const cellX = (c: number) => g.x0 + (RN + c) * u;
        const rowY = (r: number) => rowH * (1 + r);
        const right = cellX(nCols);
        return (
          <g key={g.key} data-grid={g.key}>
            {shade &&
              Array.from({ length: ROWS }, (_, r) =>
                r % 2 === 1 ? <rect key={r} x={g.x0} y={rowY(r)} width={right - g.x0} height={rowH} fill={SHADE} /> : null
              )}
            <rect x={g.x0} y={0} width={right - g.x0} height={rowH} fill={HEADER} />
            {text(g.x0 + (RN * u) / 2, rowH / 2, g.key, { size: font * 0.8, fill: "#fff" })}
            {GRID_COLS.map((label, c) => (
              <g key={label}>{text(cellX(c) + u / 2, rowH / 2, String(label), { fill: "#fff" })}</g>
            ))}
            {Array.from({ length: ROWS }, (_, r) => (
              <g key={r}>{text(g.x0 + (RN * u) / 2, rowY(r) + rowH / 2, String(r))}</g>
            ))}
            {g.grid.map((col, c) =>
              col.map((v, r) => (
                <g key={`${c}-${r}`} data-code={`${GRID_COLS[c]}${r}`} data-value={v}>
                  {text(cellX(c) + u / 2, rowY(r) + rowH / 2, v, { fill: isOffPlate(v) ? "#d40000" : g.colors?.[v] ?? "#000", fit: true })}
                </g>
              ))
            )}
          </g>
        );
      })}
      {text(width / 2, height - (rowH * FOOT) / 2, g0.label, { size: small })}
    </svg>
  );
}
