import { describe, expect, it } from "vitest";
import { forceLayoutStructure } from "@/lib/rna/force-layout";
import { layoutStructure } from "@/lib/rna/layout";

describe("forceLayoutStructure", () => {
  const sequence = "GGGAAAUCCCU";
  const pairs: [number, number][] = [
    [0, 9],
    [1, 8],
    [2, 7],
  ];

  it("places one node per nucleotide", () => {
    const { nodes } = forceLayoutStructure(sequence, pairs);
    expect(nodes).toHaveLength(11);
    expect(nodes.map((n) => n.base).join("")).toBe(sequence);
  });

  it("marks paired nucleotides", () => {
    const { nodes } = forceLayoutStructure(sequence, pairs);
    expect(nodes[0].paired).toBe(true);
    expect(nodes[4].paired).toBe(false);
  });

  it("emits a backbone link between consecutive bases and one per pair", () => {
    const { links } = forceLayoutStructure(sequence, pairs);
    expect(links.filter((l) => l.kind === "backbone")).toHaveLength(10);
    expect(links.filter((l) => l.kind === "pair")).toHaveLength(3);
  });

  it("keeps every coordinate finite", () => {
    const { nodes } = forceLayoutStructure(sequence, pairs);
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  // DETERMINISM IS REQUIRED: d3-force's internal tie-breaking jiggle falls
  // back to Math.random unless a random source is fixed, and its default
  // node placement is unrelated to sequence topology unless seeded — the
  // layout must reproduce byte-for-byte on every call.
  it("is deterministic", () => {
    const first = forceLayoutStructure(sequence, pairs);
    const second = forceLayoutStructure(sequence, pairs);
    expect(first.nodes).toEqual(second.nodes);
    expect(first.links).toEqual(second.links);
    expect(first.width).toBe(second.width);
    expect(first.height).toBe(second.height);
  });

  it("is deterministic across a larger structure with more simulation ticks to converge", () => {
    // Built programmatically (not hand-counted) so the pair indices are
    // guaranteed in bounds: 80 nucleotides, indices 0-79.
    const longSequence = "GC".repeat(40);
    const longPairs: [number, number][] = [
      [0, 79],
      [1, 78],
      [2, 77],
      [3, 76],
      [10, 69],
      [11, 68],
      [12, 67],
    ];
    const first = forceLayoutStructure(longSequence, longPairs);
    const second = forceLayoutStructure(longSequence, longPairs);
    expect(first).toEqual(second);
  });

  // Pseudoknots are this project's headline result — a layout that only
  // handles nested pairs would drop them, so a crossing pair must place
  // every base without error, same as the circular layout's guarantee.
  it("lays out crossing pairs without error", () => {
    const { nodes, links } = forceLayoutStructure("GGGGAAAACCCCAAAA", [
      [0, 9],
      [4, 13],
    ]);
    expect(nodes).toHaveLength(16);
    expect(links.filter((l) => l.kind === "pair")).toHaveLength(2);
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it("is still deterministic when pairs cross", () => {
    const crossingSequence = "GGGGAAAACCCCAAAA";
    const crossingPairs: [number, number][] = [
      [0, 9],
      [4, 13],
    ];
    const first = forceLayoutStructure(crossingSequence, crossingPairs);
    const second = forceLayoutStructure(crossingSequence, crossingPairs);
    expect(first).toEqual(second);
  });

  // This is the actual mechanism forna relies on: a shorter rest length on
  // pair links than backbone links is what pulls a helix into a ladder
  // rather than leaving it as loose as the rest of the loop.
  it("converges with base-pair links shorter than backbone links, on average", () => {
    const hairpinSequence = "GGGGAAAACCCC";
    const hairpinPairs: [number, number][] = [
      [0, 11],
      [1, 10],
      [2, 9],
      [3, 8],
    ];
    const { nodes, links } = forceLayoutStructure(hairpinSequence, hairpinPairs);
    const distance = (a: number, b: number) => {
      const nodeA = nodes[a];
      const nodeB = nodes[b];
      return Math.hypot(nodeA.x - nodeB.x, nodeA.y - nodeB.y);
    };
    const average = (kind: "backbone" | "pair") => {
      const matching = links.filter((l) => l.kind === kind);
      const total = matching.reduce((sum, l) => sum + distance(l.source, l.target), 0);
      return total / matching.length;
    };
    expect(average("pair")).toBeLessThan(average("backbone"));
  });

  // Same qualitative check as above, from the other direction: paired bases
  // should end up closer together than the topology-agnostic circular seed
  // placed them, which is the whole point of running the simulation at all.
  it("pulls base-paired nucleotides closer together than the circular seed placed them", () => {
    const hairpinSequence = "GGGGAAAACCCC";
    const hairpinPairs: [number, number][] = [
      [0, 11],
      [1, 10],
      [2, 9],
      [3, 8],
    ];
    const seeded = layoutStructure(hairpinSequence, hairpinPairs);
    const forced = forceLayoutStructure(hairpinSequence, hairpinPairs);
    const distance = (nodes: { x: number; y: number }[], i: number, j: number) =>
      Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
    for (const [i, j] of hairpinPairs) {
      expect(distance(forced.nodes, i, j)).toBeLessThan(distance(seeded.nodes, i, j));
    }
  });

  it("accepts a lower tick count for a cheaper, still-deterministic layout", () => {
    const first = forceLayoutStructure(sequence, pairs, { ticks: 10 });
    const second = forceLayoutStructure(sequence, pairs, { ticks: 10 });
    expect(first).toEqual(second);
  });
});
