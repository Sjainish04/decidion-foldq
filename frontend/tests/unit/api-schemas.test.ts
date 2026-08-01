import { describe, expect, it } from "vitest";
import { foldResponseSchema, type FoldResponse } from "@/lib/api/schemas";

const valid: FoldResponse = {
  run_id: "abc123",
  sequence: "GGGAAAUCCCU",
  solver: "exact",
  seed: 42,
  reference: { dot_bracket: "(((....))).", energy: -3.7, base_pairs: [[0, 9]] },
  candidate: {
    dot_bracket: "(((....))).",
    energy: -3.7,
    base_pairs: [[0, 9]],
    stems: [{ i: 0, j: 9, k: 3 }],
    qubo_energy: -6.8,
    was_repaired: false,
    repair_count: 0,
    is_pseudoknotted: false,
  },
  gates: {
    representable: true,
    representable_fraction: 1,
    is_qubo_ground_state: true,
    solver_found_ground_state: true,
    energy_gap: 0,
    base_pair_f1: 1,
    is_pseudoknotted: false,
    attribution: "no failure: all gates passed",
    notes: [],
  },
  problem: {
    num_variables: 5,
    num_quadratic_terms: 10,
    density: 1,
    overlap_penalty: 14.6,
    forbid_crossing: true,
  },
  stages: [{ name: "reference", seconds: 0.01 }],
  runtime_seconds: 0.05,
  decision_card_html: "<html></html>",
};

describe("fold response schema", () => {
  it("accepts a well-formed response", () => {
    expect(() => foldResponseSchema.parse(valid)).not.toThrow();
  });

  it("accepts null gates where exact ground truth is unavailable", () => {
    const indeterminate = structuredClone(valid);
    indeterminate.gates.is_qubo_ground_state = null;
    indeterminate.gates.solver_found_ground_state = null;
    expect(() => foldResponseSchema.parse(indeterminate)).not.toThrow();
  });

  it("accepts a null energy for a pseudoknotted candidate", () => {
    const pk = structuredClone(valid);
    pk.candidate.energy = null;
    pk.candidate.is_pseudoknotted = true;
    pk.gates.energy_gap = null;
    expect(() => foldResponseSchema.parse(pk)).not.toThrow();
  });

  it("rejects a response missing the attribution", () => {
    const broken = structuredClone(valid);
    delete (broken.gates as Record<string, unknown>).attribution;
    expect(() => foldResponseSchema.parse(broken)).toThrow(/attribution/);
  });

  it("rejects a wrongly typed f1", () => {
    const broken = structuredClone(valid);
    (broken.gates as Record<string, unknown>).base_pair_f1 = "1.0";
    expect(() => foldResponseSchema.parse(broken)).toThrow();
  });
});
