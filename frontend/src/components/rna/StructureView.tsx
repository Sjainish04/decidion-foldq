"use client";

import { useId } from "react";
import { forceLayoutStructure } from "@/lib/rna/force-layout";
import { layoutStructure } from "@/lib/rna/layout";

const BASE_COLORS: Record<string, string> = {
  A: "var(--rna-a)",
  U: "var(--rna-u)",
  C: "var(--rna-c)",
  G: "var(--rna-g)",
};

type PairKind = "gc" | "au" | "gu" | "other";

/** Pair chemistry, read straight off the two bases. G–C carries three hydrogen
 *  bonds, A–U two, and G–U is the wobble pair; anything else is non-canonical. */
function pairKind(a: string, b: string): PairKind {
  const key = [a, b].sort().join("");
  if (key === "CG") return "gc";
  if (key === "AU") return "au";
  if (key === "GU") return "gu";
  return "other";
}

const PAIR_STYLE: Record<PairKind, { color: string; width: number; dash?: string; label: string }> = {
  gc: { color: "var(--quantum-inspired)", width: 2.6, label: "G–C pair" },
  au: { color: "var(--classical)", width: 2.2, label: "A–U pair" },
  gu: { color: "var(--quantum)", width: 1.8, dash: "3 2.5", label: "G–U wobble" },
  other: { color: "var(--text-secondary)", width: 1.4, dash: "1.5 2.5", label: "Non-canonical pair" },
};

/** Indices of pairs that cross another pair, i < k < j < l. These are the
 *  pseudoknotted contacts nested dot-bracket notation cannot express. */
function crossingPairs(pairs: [number, number][]): Set<number> {
  const crossing = new Set<number>();
  for (let p = 0; p < pairs.length; p += 1) {
    const [i, j] = pairs[p][0] < pairs[p][1] ? pairs[p] : [pairs[p][1], pairs[p][0]];
    for (let q = p + 1; q < pairs.length; q += 1) {
      const [k, l] = pairs[q][0] < pairs[q][1] ? pairs[q] : [pairs[q][1], pairs[q][0]];
      if ((i < k && k < j && j < l) || (k < i && i < l && l < j)) {
        crossing.add(p);
        crossing.add(q);
      }
    }
  }
  return crossing;
}

export function StructureView({
  sequence,
  pairs,
  label,
  highlight = [],
  size = 430,
  layout: layoutMode = "circular",
  plate = true,
  legend = true,
  animate = true,
}: {
  sequence: string;
  pairs: [number, number][];
  label: string;
  highlight?: number[];
  /** Budget for the drawing's longest edge, in px. The shorter edge follows the
   *  layout's aspect ratio, so this bounds the drawing rather than forcing a
   *  square. `max-w-full` still shrinks it on narrow viewports. */
  size?: number;
  /** "circular" (default) places every base on a circle with chords for
   *  pairs, meaning-preserving for any topology, including pseudoknots.
   *  "force" is the forna-style ladders-and-loops drawing; it still
   *  handles crossing pairs (they're just springs), but reads more like
   *  conventional secondary-structure diagrams for nested structure. */
  layout?: "circular" | "force";
  /** Draw on the dotted figure plate. Off where the host already frames it. */
  plate?: boolean;
  /** Show the colour key under the caption. */
  legend?: boolean;
  /** Draw the backbone and pop the bases in on first render. */
  animate?: boolean;
}) {
  const id = useId();
  const raw =
    layoutMode === "force" ? forceLayoutStructure(sequence, pairs) : layoutStructure(sequence, pairs);
  // Rounded to 0.01 of a layout unit. The drawing renders on the server and
  // again in the browser, and the two engines' trigonometry can differ in the
  // last floating-point digit; unrounded, that mismatch fails hydration.
  const round = (value: number) => Math.round(value * 100) / 100;
  const layout = {
    ...raw,
    width: round(raw.width),
    height: round(raw.height),
    nodes: raw.nodes.map((node) => ({ ...node, x: round(node.x), y: round(node.y) })),
  };
  const highlighted = new Set(highlight);
  const showBases = sequence.length <= 120;
  const crossing = crossingPairs(pairs);
  const partner = new Map<number, number>();
  for (const [i, j] of pairs) {
    partner.set(i, j);
    partner.set(j, i);
  }
  const kinds = pairs.map(([i, j]) => pairKind(sequence[i], sequence[j]));

  // A square element was right for the circular layout, which is square by
  // construction, and wrong for the force layout, whose aspect ratio depends on
  // the structure. Boxing a tall drawing (a tRNA cloverleaf is roughly 2:1)
  // into a square makes `preserveAspectRatio` letterbox it, so it rendered at
  // about half the size the panel had room for. Deriving the box from the
  // layout's own bounds makes the drawing fill it. Circular layouts are 1:1, so
  // this is a no-op for them.
  const aspect = layout.height > 0 ? layout.width / layout.height : 1;
  const width = aspect >= 1 ? size : Math.round(size * aspect);
  const height = aspect >= 1 ? Math.round(size / aspect) : size;

  const nodes = layout.nodes;
  const radius = showBases ? (layoutMode === "force" ? 6.6 : 7.2) : 4;
  const centre = { x: layout.width / 2, y: layout.height / 2 };
  const circleRadius =
    nodes.length > 0 ? round(Math.hypot(nodes[0].x - centre.x, nodes[0].y - centre.y)) : 0;

  // The backbone as one continuous path, so it can be drawn in 5' to 3'. On the
  // circular layout it follows the circle itself rather than cutting chords.
  const backbone = nodes
    .map((node, index) => {
      if (index === 0) return `M${node.x.toFixed(2)} ${node.y.toFixed(2)}`;
      return layoutMode === "circular"
        ? `A${circleRadius.toFixed(2)} ${circleRadius.toFixed(2)} 0 0 1 ${node.x.toFixed(2)} ${node.y.toFixed(2)}`
        : `L${node.x.toFixed(2)} ${node.y.toFixed(2)}`;
    })
    .join(" ");

  // Chords bow toward the centre on the circular layout, the convention for
  // circle plots; on the force layout a pair is a short straight rung.
  const pairPath = ([i, j]: [number, number]) => {
    const a = nodes[i];
    const b = nodes[j];
    if (!a || !b) return "";
    if (layoutMode !== "circular") return `M${a.x} ${a.y} L${b.x} ${b.y}`;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const cx = (centre.x + (mid.x - centre.x) * 0.3).toFixed(2);
    const cy = (centre.y + (mid.y - centre.y) * 0.3).toFixed(2);
    return `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`;
  };

  // 5' and 3' labels, pushed outward from their end so they never sit on a base.
  const endLabel = (index: number, neighbour: number) => {
    const node = nodes[index];
    if (!node) return null;
    let dx: number;
    let dy: number;
    if (layoutMode === "circular") {
      dx = node.x - centre.x;
      dy = node.y - centre.y;
    } else {
      const other = nodes[neighbour] ?? centre;
      dx = node.x - other.x;
      dy = node.y - other.y;
    }
    const length = Math.hypot(dx, dy) || 1;
    const offset = radius + Math.max(9, layout.width / 60);
    return {
      x: round(node.x + (dx / length) * offset),
      y: round(node.y + (dy / length) * offset),
    };
  };
  // End labels grow with the drawing so they stay readable once it is scaled
  // down to fit its panel.
  const endLabelSize = Math.max(10, layout.width / 48);
  const fivePrime = endLabel(0, 1);
  const threePrime = endLabel(nodes.length - 1, nodes.length - 2);

  const presentKinds = (Object.keys(PAIR_STYLE) as PairKind[]).filter((kind) => kinds.includes(kind));
  const presentBases = ["A", "U", "C", "G"].filter((base) => sequence.includes(base));
  const pairDelay = 0.9;

  return (
    <figure className="m-0">
      <div className={plate ? "figure-plate p-2 sm:p-3" : ""}>
        <svg
          key={layoutMode}
          role="img"
          aria-label={label}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={width}
          height={height}
          className="mx-auto block h-auto max-w-full overflow-visible"
        >
          <defs>
            <filter id={`${id}-shadow`} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0.8" stdDeviation="0.9" floodColor="#0a1628" floodOpacity="0.25" />
            </filter>
            <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
          </defs>

          {/* Everything inside is presentational: the svg's own label and the
              caption below carry the description. */}
          <g aria-hidden="true">
            {layoutMode === "circular" && nodes.length > 0 && (
              <circle
                cx={centre.x}
                cy={centre.y}
                r={circleRadius}
                fill="none"
                stroke="var(--border)"
                strokeDasharray="2 5"
                strokeOpacity={0.7}
              />
            )}

            <path
              d={backbone}
              pathLength={1}
              fill="none"
              stroke="var(--text-secondary)"
              strokeOpacity={0.45}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={animate ? "svg-draw" : undefined}
            />

            {/* Crossing pairs get a soft halo first, so it sits under the line. */}
            {pairs.map((pair, index) =>
              crossing.has(index) ? (
                <path
                  key={`halo-${index}`}
                  d={pairPath(pair)}
                  fill="none"
                  stroke="var(--danger)"
                  strokeOpacity={0.45}
                  strokeWidth={7}
                  strokeLinecap="round"
                  filter={`url(#${id}-glow)`}
                  className={animate ? "svg-fade" : undefined}
                  style={animate ? { animationDelay: `${pairDelay + 0.3}s` } : undefined}
                />
              ) : null,
            )}

            {pairs.map((pair, index) => {
              const style = PAIR_STYLE[kinds[index]];
              return (
                <path
                  key={`pair-${index}`}
                  d={pairPath(pair)}
                  fill="none"
                  stroke={style.color}
                  strokeWidth={crossing.has(index) ? style.width + 0.6 : style.width}
                  strokeDasharray={style.dash}
                  strokeLinecap="round"
                  strokeOpacity={0.92}
                  className={animate ? "svg-fade" : undefined}
                  style={
                    animate
                      ? { animationDelay: `${pairDelay + Math.min(index * 0.015, 0.6)}s` }
                      : undefined
                  }
                />
              );
            })}

            {nodes.map((node) => {
              const color = BASE_COLORS[node.base] ?? "var(--text-secondary)";
              const isHighlighted = highlighted.has(node.index);
              const r = isHighlighted ? radius + 2.2 : radius;
              const mate = partner.get(node.index);
              return (
                <g
                  key={node.index}
                  className={animate ? "svg-pop" : undefined}
                  style={
                    animate
                      ? { animationDelay: `${0.15 + Math.min(node.index * 0.012, 0.9)}s` }
                      : undefined
                  }
                >
                  <title>
                    {`${node.base}${node.index + 1}${
                      mate === undefined
                        ? " · unpaired"
                        : ` · paired with ${sequence[mate]}${mate + 1}`
                    }`}
                  </title>
                  {isHighlighted && (
                    <circle cx={node.x} cy={node.y} r={r + 3.5} fill="var(--text-primary)" fillOpacity={0.12} />
                  )}
                  {showBases ? (
                    <>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={r}
                        fill={`color-mix(in srgb, ${color} 24%, var(--figure-bg))`}
                        stroke={isHighlighted ? "var(--text-primary)" : color}
                        strokeWidth={isHighlighted ? 2 : 1.6}
                        filter={`url(#${id}-shadow)`}
                      />
                      <text
                        x={node.x}
                        y={node.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={radius * 1.15}
                        fontWeight={700}
                        fill="var(--text-primary)"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {node.base}
                      </text>
                    </>
                  ) : (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      fill={color}
                      stroke={isHighlighted ? "var(--text-primary)" : "var(--figure-bg)"}
                      strokeWidth={isHighlighted ? 1.5 : 0.8}
                    />
                  )}
                </g>
              );
            })}

            {fivePrime && (
              <text
                x={fivePrime.x}
                y={fivePrime.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={endLabelSize}
                fontWeight={700}
                fill="var(--text-secondary)"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                5′
              </text>
            )}
            {threePrime && nodes.length > 1 && (
              <text
                x={threePrime.x}
                y={threePrime.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={endLabelSize}
                fontWeight={700}
                fill="var(--text-secondary)"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                3′
              </text>
            )}
          </g>
        </svg>
      </div>
      <figcaption className="mt-2 text-xs text-[var(--text-secondary)]">
        {label}: {sequence.length} nucleotides, {pairs.length} base{" "}
        {pairs.length === 1 ? "pair" : "pairs"}
        {crossing.size > 0 && `, ${crossing.size} of them crossing`}.
      </figcaption>
      {/* Swatches are styled spans, not SVG: the figure is the only svg here. */}
      {legend && (presentBases.length > 0 || presentKinds.length > 0) && (
        <ul
          aria-label="Colour key"
          className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px] text-[var(--text-secondary)]"
        >
          {presentBases.map((base) => (
            <li key={base} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-full border-[1.6px]"
                style={{
                  borderColor: BASE_COLORS[base],
                  background: `color-mix(in srgb, ${BASE_COLORS[base]} 24%, var(--figure-bg))`,
                }}
              />
              {base}
            </li>
          ))}
          {presentKinds.map((kind) => (
            <li key={kind} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block w-4"
                style={{
                  borderTop: `2px ${PAIR_STYLE[kind].dash ? "dashed" : "solid"} ${PAIR_STYLE[kind].color}`,
                }}
              />
              {PAIR_STYLE[kind].label}
            </li>
          ))}
          {crossing.size > 0 && (
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-4 rounded-full"
                style={{
                  background: "var(--danger)",
                  boxShadow: "0 0 0 2px color-mix(in srgb, var(--danger) 35%, transparent)",
                }}
              />
              Crossing pair (pseudoknot)
            </li>
          )}
        </ul>
      )}
    </figure>
  );
}
