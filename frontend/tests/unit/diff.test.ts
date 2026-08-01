import { describe, expect, it } from "vitest";
import { comparePairs } from "@/lib/foldq/diff";

describe("comparePairs", () => {
  it("partitions pairs into shared and exclusive sets", () => {
    const result = comparePairs("(((....))).", "((......)).");
    expect(result.shared).toEqual([
      [0, 9],
      [1, 8],
    ]);
    expect(result.onlyA).toEqual([[2, 7]]);
    expect(result.onlyB).toEqual([]);
  });

  it("reports every pair as exclusive when nothing matches", () => {
    const result = comparePairs("((....))..", "..((....))");
    expect(result.shared).toEqual([]);
    expect(result.onlyA).toHaveLength(2);
    expect(result.onlyB).toHaveLength(2);
  });

  it("returns empty sets for two unpaired structures", () => {
    const result = comparePairs("....", "....");
    expect(result).toEqual({ shared: [], onlyA: [], onlyB: [], f1: 0 });
  });

  it("computes the F1 between the two structures", () => {
    // Two of three A-pairs are shared with two of two B-pairs:
    // precision 2/3, recall 2/2 -> F1 0.8
    const result = comparePairs("(((....))).", "((......)).");
    expect(result.f1).toBeCloseTo(0.8);
  });

  it("throws on an unparseable structure rather than reporting a false match", () => {
    expect(() => comparePairs("(((", "...")).toThrow(/unclosed/i);
  });
});
