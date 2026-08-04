import { describe, expect, it } from "vitest";
import { toBpseq, toCt, toDotBracket } from "@/lib/foldq/structure-formats";
import type { FoldResponse } from "@/lib/api/schemas";

/** 12 nt, nested hairpin: positions 0-2 pair with 11-9. */
function nested(): FoldResponse {
  return {
    run_id: "abc123",
    sequence: "GGGAAAAACCCU",
    solver: "simulated_annealing",
    seed: 42,
    candidate: {
      dot_bracket: "(((.......)))".slice(0, 12),
      energy: -4.25,
      base_pairs: [
        [0, 11],
        [1, 10],
        [2, 9],
      ],
    },
    reference: { dot_bracket: "", energy: null, base_pairs: [] },
    gates: {},
    problem: {},
  } as unknown as FoldResponse;
}

/** A crossing pair: (0,6) and (3,9) interleave, which no plain dot-bracket
 *  string can express. This is the case the pair-list formats exist for. */
function pseudoknotted(): FoldResponse {
  return {
    run_id: "pk001",
    sequence: "GCGCAUAUGCUA",
    solver: "simulated_annealing",
    seed: 42,
    candidate: {
      dot_bracket: "((..[[..))]]",
      energy: null,
      base_pairs: [
        [0, 8],
        [1, 9],
        [4, 10],
        [5, 11],
      ],
    },
    reference: { dot_bracket: "", energy: null, base_pairs: [] },
    gates: {},
    problem: {},
  } as unknown as FoldResponse;
}

describe("BPSEQ", () => {
  it("writes one line per nucleotide with 1-based pair indices", () => {
    const lines = toBpseq(nested())
      .trimEnd()
      .split("\n")
      .filter((line) => !line.startsWith("#"));

    expect(lines).toHaveLength(12);
    expect(lines[0]).toBe("1 G 12");
    expect(lines[11]).toBe("12 U 1");
  });

  it("writes 0 for an unpaired position", () => {
    const lines = toBpseq(nested()).trimEnd().split("\n");
    expect(lines.find((line) => line.startsWith("5 "))).toBe("5 A 0");
  });

  it("represents a pseudoknot, which dot-bracket cannot", () => {
    const lines = toBpseq(pseudoknotted())
      .trimEnd()
      .split("\n")
      .filter((line) => !line.startsWith("#"));

    // Crossing pairs (1,9) and (5,11) in 1-based terms, both present and
    // symmetric — the format has no notion of nesting to violate.
    expect(lines[0]).toBe("1 G 9");
    expect(lines[8]).toBe("9 G 1");
    expect(lines[4]).toBe("5 A 11");
    expect(lines[10]).toBe("11 U 5");
  });
});

describe("CT", () => {
  it("writes the six spec columns in order", () => {
    const lines = toCt(nested()).trimEnd().split("\n");
    expect(lines[0]).toContain("12");
    expect(lines[0]).toContain("ENERGY = -4.25");

    // index, base, previous, next, pair, natural numbering
    expect(lines[1].split("\t")).toEqual(["1", "G", "0", "2", "12", "1"]);
    expect(lines[2].split("\t")).toEqual(["2", "G", "1", "3", "11", "2"]);
  });

  it("terminates the chain with 0, not an index past the end", () => {
    const lines = toCt(nested()).trimEnd().split("\n");
    const last = lines[lines.length - 1].split("\t");
    expect(last[0]).toBe("12");
    expect(last[3]).toBe("0"); // no next nucleotide
    expect(last[4]).toBe("1"); // paired with position 1
  });

  it("omits the energy rather than writing NaN when the candidate is pseudoknotted", () => {
    // A pseudoknotted candidate has no ViennaRNA energy. Writing "NaN" into the
    // header breaks parsers that expect a number there.
    const header = toCt(pseudoknotted()).split("\n")[0];
    expect(header).not.toContain("NaN");
    expect(header).not.toContain("ENERGY");
    expect(header).toContain("12");
  });
});

describe("dot-bracket", () => {
  it("writes FASTA with the sequence and structure on separate lines", () => {
    const lines = toDotBracket(nested()).trimEnd().split("\n");
    expect(lines[0]).toBe(">foldq_abc123");
    expect(lines[1]).toBe("GGGAAAAACCCU");
    expect(lines[2]).toHaveLength(12);
  });
});

describe("out-of-range pairs", () => {
  it("are dropped rather than written as a silently wrong file", () => {
    const broken = nested();
    (broken.candidate.base_pairs as number[][]).push([0, 99]);
    const lines = toBpseq(broken)
      .trimEnd()
      .split("\n")
      .filter((line) => !line.startsWith("#"));
    expect(lines).toHaveLength(12);
    // Position 1 keeps its valid partner; the impossible pair never lands.
    expect(lines[0]).toBe("1 G 12");
  });
});
