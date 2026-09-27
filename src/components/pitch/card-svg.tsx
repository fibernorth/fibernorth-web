"use client";

import { GRID_COLS, ROWS, isOffPlate, type Card } from "@/lib/pitch/engine";

// The player's wristband card, drawn in inches so it prints at true size.
// Two simple grids side by side: pitch (left) and location (right). Each has
// 1-5 across the top and 0-9 down the side. Every other row shaded if asked.
// The card ID sits small along the bottom so the phone and card can be matched.

const RN = 0.65; // row-number column, in cell widths
const GAP = 0.45; // space between the two grids, in cell widths
const FOOT = 0.55; // footer (card ID), in row heights

export function CardSvg({
  card,
  width,
  height,
  shade,
  className,
  printSize,
}: {
  card: Card;
  width: number;
  height: number;
  shade: boolean;
  className?: string;
  printSize?: boolean;
}) {
  const nCols = GRID_COLS.length;
  const units = 2 * (RN + nCols) + GAP;
  const u = width / units;
  const rowH = height / (ROWS + 1 + FOOT);
  const font = Math.min(u * 0.5, rowH * 0.72);
  const small = Math.min(font * 0.62, rowH * FOOT * 0.8);

  const grids = [
    { key: "P", x0: 0, grid: card.pitchGrid },
    { key: "L", x0: (RN + nCols + GAP) * u, grid: card.locGrid },
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
      width={printSize ? `${width}in` : "100%"}
      height={printSize ? `${height}in` : undefined}
      className={className}
      style={{ background: "#fff", display: "block" }}
      role="img"
      aria-label={`Wristband card ${card.id}`}
      data-card-id={card.id}
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
                r % 2 === 1 ? <rect key={r} x={g.x0} y={rowY(r)} width={right - g.x0} height={rowH} fill="#e3e3e3" /> : null
              )}
            <rect x={g.x0} y={0} width={right - g.x0} height={rowH} fill="#c8c8c8" />
            {text(g.x0 + (RN * u) / 2, rowH / 2, g.key, { size: font * 0.8 })}
            {GRID_COLS.map((label, c) => (
              <g key={label}>{text(cellX(c) + u / 2, rowH / 2, String(label))}</g>
            ))}
            {Array.from({ length: ROWS }, (_, r) => (
              <g key={r}>{text(g.x0 + (RN * u) / 2, rowY(r) + rowH / 2, String(r))}</g>
            ))}
            {g.grid.map((col, c) =>
              col.map((v, r) => (
                <g key={`${c}-${r}`} data-code={`${GRID_COLS[c]}${r}`} data-value={v}>
                  {text(cellX(c) + u / 2, rowY(r) + rowH / 2, v, { fill: isOffPlate(v) ? "#d40000" : "#000", fit: true })}
                </g>
              ))
            )}
          </g>
        );
      })}
      {text(width / 2, height - (rowH * FOOT) / 2, `CARD ${card.id}`, { size: small })}
    </svg>
  );
}
