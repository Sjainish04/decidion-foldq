"use client";

import { forceLayoutStructure } from "@/lib/rna/force-layout";
import { layoutStructure } from "@/lib/rna/layout";

const BASE_COLORS: Record<string, string> = {
  A: "var(--rna-a)",
  U: "var(--rna-u)",
  C: "var(--rna-c)",
  G: "var(--rna-g)",
};

export function StructureView({
  sequence,
  pairs,
  label,
  highlight = [],
  size = 430,
  layout: layoutMode = "circular",
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
   *  pairs — meaning-preserving for any topology, including pseudoknots.
   *  "force" is the forna-style ladders-and-loops drawing; it still
   *  handles crossing pairs (they're just springs), but reads more like
   *  conventional secondary-structure diagrams for nested structure. */
  layout?: "circular" | "force";
}) {
  const layout =
    layoutMode === "force" ? forceLayoutStructure(sequence, pairs) : layoutStructure(sequence, pairs);
  const highlighted = new Set(highlight);
  const showBases = sequence.length <= 120;

  // A square element was right for the circular layout, which is square by
  // construction, and wrong for the force layout, whose aspect ratio depends on
  // the structure. Boxing a tall drawing — a tRNA cloverleaf is roughly 2:1 —
  // into a square makes `preserveAspectRatio` letterbox it, so it rendered at
  // about half the size the panel had room for. Deriving the box from the
  // layout's own bounds makes the drawing fill it. Circular layouts are 1:1, so
  // this is a no-op for them.
  const aspect = layout.height > 0 ? layout.width / layout.height : 1;
  const width = aspect >= 1 ? size : Math.round(size * aspect);
  const height = aspect >= 1 ? Math.round(size / aspect) : size;

  return (
    <figure className="m-0">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={width}
        height={height}
        className="mx-auto block h-auto max-w-full"
      >
        {layout.links.map((link, index) => {
          const a = layout.nodes[link.source];
          const b = layout.nodes[link.target];
          return (
            <line
              key={index}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={link.kind === "pair" ? "var(--quantum-inspired)" : "var(--border)"}
              strokeWidth={link.kind === "pair" ? 1.6 : 2.4}
              strokeOpacity={link.kind === "pair" ? 0.85 : 1}
            />
          );
        })}
        {layout.nodes.map((node) => (
          <g key={node.index}>
            <circle
              cx={node.x}
              cy={node.y}
              r={highlighted.has(node.index) ? 6 : 4}
              fill={BASE_COLORS[node.base] ?? "var(--text-secondary)"}
              stroke={highlighted.has(node.index) ? "var(--text-primary)" : "none"}
              strokeWidth={1.5}
            />
            {showBases && (
              <text
                x={node.x}
                y={node.y - 8}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-secondary)"
              >
                {node.base}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 text-xs text-[var(--text-secondary)]">
        {label}: {sequence.length} nucleotides, {pairs.length} base{" "}
        {pairs.length === 1 ? "pair" : "pairs"}.
      </figcaption>
    </figure>
  );
}
