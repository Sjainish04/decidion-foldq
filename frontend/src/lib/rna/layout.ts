export interface LayoutNode {
  index: number;
  base: string;
  x: number;
  y: number;
  paired: boolean;
}

export interface LayoutLink {
  source: number;
  target: number;
  kind: "backbone" | "pair";
}

export interface Layout {
  nodes: LayoutNode[];
  links: LayoutLink[];
  width: number;
  height: number;
}

/** Circular backbone with chords for base pairs.
 *
 *  A radial-loop layout (the ViennaRNA/R2DT look) is the eventual goal, but it has
 *  no meaning for crossing pairs — and pseudoknots are the result this project is
 *  built to show. A circle places every base deterministically regardless of
 *  topology, so nested and crossing structures render through one code path.
 */
export function layoutStructure(
  sequence: string,
  pairs: [number, number][],
  options: { radius?: number; padding?: number } = {},
): Layout {
  const radius = options.radius ?? Math.max(90, sequence.length * 4.2);
  const padding = options.padding ?? 28;
  const size = radius * 2 + padding * 2;
  const centre = size / 2;

  const pairedIndices = new Set<number>();
  for (const [i, j] of pairs) {
    pairedIndices.add(i);
    pairedIndices.add(j);
  }

  // Start at the top and run clockwise, leaving a gap so 5' and 3' ends are distinct.
  const arc = (Math.PI * 2 * 0.94) / Math.max(1, sequence.length - 1);
  const start = -Math.PI / 2 + Math.PI * 0.03;

  const nodes: LayoutNode[] = [...sequence].map((base, index) => {
    const angle = start + arc * index;
    return {
      index,
      base,
      x: centre + radius * Math.cos(angle),
      y: centre + radius * Math.sin(angle),
      paired: pairedIndices.has(index),
    };
  });

  const links: LayoutLink[] = [];
  for (let index = 1; index < sequence.length; index += 1) {
    links.push({ source: index - 1, target: index, kind: "backbone" });
  }
  for (const [i, j] of pairs) {
    links.push({ source: i, target: j, kind: "pair" });
  }

  return { nodes, links, width: size, height: size };
}
