"use client";

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
  size = 360,
}: {
  sequence: string;
  pairs: [number, number][];
  label: string;
  highlight?: number[];
  size?: number;
}) {
  const layout = layoutStructure(sequence, pairs);
  const highlighted = new Set(highlight);
  const showBases = sequence.length <= 120;

  return (
    <figure className="m-0">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={size}
        height={size}
        className="max-w-full"
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
