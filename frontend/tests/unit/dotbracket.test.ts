import { describe, expect, it } from "vitest";
import { describeStructure, parseDotBracket } from "@/lib/rna/dotbracket";

describe("parseDotBracket", () => {
  it("extracts nested pairs", () => {
    const result = parseDotBracket("(((....))).");
    expect(result.isValid).toBe(true);
    expect(result.pairs).toEqual([
      [0, 9],
      [1, 8],
      [2, 7],
    ]);
    expect(result.unpaired).toEqual([3, 4, 5, 6, 10]);
  });

  it("reports an unbalanced structure rather than throwing", () => {
    const result = parseDotBracket("(((...");
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/unclosed/i);
    expect(result.pairs).toEqual([]);
  });

  it("reports an unmatched closing bracket", () => {
    const result = parseDotBracket("..)..");
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/unmatched/i);
  });

  it("rejects an unknown character", () => {
    const result = parseDotBracket("((x))");
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/unexpected character/i);
  });

  it("handles a fully unpaired structure", () => {
    const result = parseDotBracket(".....");
    expect(result.isValid).toBe(true);
    expect(result.pairs).toEqual([]);
    expect(result.unpaired).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("describeStructure", () => {
  it("counts helices and loop regions", () => {
    const stats = describeStructure("(((....))).");
    expect(stats.pairCount).toBe(3);
    expect(stats.helixCount).toBe(1);
    expect(stats.hairpinCount).toBe(1);
    expect(stats.unpairedCount).toBe(5);
    expect(stats.pairedFraction).toBeCloseTo(6 / 11);
  });

  it("counts two separate helices in a two-hairpin structure", () => {
    const stats = describeStructure("((..))..((..))");
    expect(stats.helixCount).toBe(2);
    expect(stats.hairpinCount).toBe(2);
  });
});
