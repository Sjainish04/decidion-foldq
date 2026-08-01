import { describe, expect, it } from "vitest";
import { layoutStructure } from "@/lib/rna/layout";

describe("layoutStructure", () => {
  const sequence = "GGGAAAUCCCU";
  const pairs: [number, number][] = [
    [0, 9],
    [1, 8],
    [2, 7],
  ];

  it("places one node per nucleotide", () => {
    const { nodes } = layoutStructure(sequence, pairs);
    expect(nodes).toHaveLength(11);
    expect(nodes.map((n) => n.base).join("")).toBe(sequence);
  });

  it("marks paired nucleotides", () => {
    const { nodes } = layoutStructure(sequence, pairs);
    expect(nodes[0].paired).toBe(true);
    expect(nodes[4].paired).toBe(false);
  });

  it("emits a backbone link between consecutive bases and one per pair", () => {
    const { links } = layoutStructure(sequence, pairs);
    expect(links.filter((l) => l.kind === "backbone")).toHaveLength(10);
    expect(links.filter((l) => l.kind === "pair")).toHaveLength(3);
  });

  it("is deterministic", () => {
    const first = layoutStructure(sequence, pairs);
    const second = layoutStructure(sequence, pairs);
    expect(first.nodes).toEqual(second.nodes);
  });

  it("lays out crossing pairs without error", () => {
    // A pseudoknot has no nested layout; the renderer must still place every base.
    const { nodes, links } = layoutStructure("GGGGAAAACCCCAAAA", [
      [0, 9],
      [4, 13],
    ]);
    expect(nodes).toHaveLength(16);
    expect(links.filter((l) => l.kind === "pair")).toHaveLength(2);
  });

  it("keeps every coordinate finite", () => {
    const { nodes } = layoutStructure(sequence, pairs);
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });
});
