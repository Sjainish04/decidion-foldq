import { describe, expect, it } from "vitest";
import { EXPERIMENTS, loadExperiment } from "@/lib/results";

describe("bundled experiment results", () => {
  it("exposes every committed experiment", () => {
    expect(EXPERIMENTS).toEqual([
      "e1_formulation",
      "e2_encoding",
      "e3_solvers",
      "e4_qaoa",
      "e5_pseudoknot",
      "e6_surrogate",
    ]);
  });

  it("loads e6 with the row count the manifest declares", () => {
    const rows = loadExperiment("e6_surrogate");
    expect(rows.length).toBe(30);
    expect(rows[0]).toHaveProperty("spearman");
    expect(rows[0]).toHaveProperty("regret_kcal_mol");
  });

  it("loads e3 with the expected row count and columns", () => {
    const rows = loadExperiment("e3_solvers");
    expect(rows.length).toBe(450);
    expect(rows[0]).toHaveProperty("solver");
    expect(rows[0]).toHaveProperty("base_pair_f1");
    expect(rows[0]).toHaveProperty("energy_gap");
  });

  it("parses numeric columns as numbers, not strings", () => {
    const rows = loadExperiment("e3_solvers");
    expect(typeof rows[0].base_pair_f1).toBe("number");
    expect(typeof rows[0].num_variables).toBe("number");
  });

  it("preserves nulls for legitimately absent values", () => {
    // found_ground_state is null where the instance exceeds the exact-solver cap
    const rows = loadExperiment("e3_solvers");
    const indeterminate = rows.filter((r) => r.found_ground_state === null);
    expect(indeterminate.length).toBe(270);
  });

  it("keeps the columns that follow an empty one", () => {
    // Regression guard. The first parser used a regex whose match list lost
    // alignment at the first empty field, so every column AFTER `found_ground_state`
    // silently became null on exactly the 270 rows where that field is empty --
    // including `attribution`, this project's central diagnostic output, and
    // `runtime_seconds`, which Number(null) would have coerced to 0 and dragged
    // every mean-runtime figure toward zero. Row counts stayed correct throughout.
    const indeterminate = loadExperiment("e3_solvers").filter(
      (r) => r.found_ground_state === null,
    );
    for (const row of indeterminate) {
      expect(row.attribution).toBeTypeOf("string");
      expect(row.attribution).not.toBe("");
      expect(row.runtime_seconds).toBeTypeOf("number");
      expect(row.was_repaired).toBeTypeOf("boolean");
    }
  });

  it("gives every row the full set of columns, never a short record", () => {
    for (const name of EXPERIMENTS) {
      const rows = loadExperiment(name);
      const width = Object.keys(rows[0]).length;
      for (const row of rows) expect(Object.keys(row).length).toBe(width);
    }
  });

  it("recovers the measured solver runtimes rather than zeros", () => {
    // Cross-check against the README's published figures, which are computed over
    // all 75 runs per solver: simulated annealing 0.19 s, tabu 10.5 s.
    const rows = loadExperiment("e3_solvers");
    const meanRuntime = (solver: string) => {
      const group = rows.filter((r) => r.solver === solver);
      expect(group.length).toBe(75);
      return group.reduce((s, r) => s + Number(r.runtime_seconds), 0) / group.length;
    };
    expect(meanRuntime("simulated_annealing")).toBeCloseTo(0.191, 2);
    expect(meanRuntime("tabu")).toBeCloseTo(10.52, 1);
  });

  it("exposes e1's mixed overlap_penalty column as number | 'adaptive'", () => {
    // Documented shape, not an accident. The column holds the sentinel "adaptive"
    // beside 5.0 and 20.0, so numeric values arrive as numbers: a consumer must
    // compare numerically or against the sentinel. `=== "5.0"` silently matches
    // nothing, which would drop two thirds of the sweep from a filtered chart.
    const values = new Set(loadExperiment("e1_formulation").map((r) => r.overlap_penalty));
    expect(values).toEqual(new Set(["adaptive", 5, 20]));
  });

  it("loads e5 including the pseudoknot rows", () => {
    const rows = loadExperiment("e5_pseudoknot");
    expect(rows.length).toBe(8);
    expect(rows.some((r) => r.has_pseudoknot === true)).toBe(true);
  });
});
