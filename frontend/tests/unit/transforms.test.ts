import { describe, expect, it } from "vitest";
import {
  attributionBreakdown,
  encodingSummary,
  noiseComparison,
  objectiveComparison,
  pseudoknotComparison,
  qaoaByLength,
  qaoaByReps,
  qaoaByShots,
  qaoaGrid,
  scalingByLength,
  solverSummary,
} from "@/lib/charts/transforms";

describe("solverSummary", () => {
  const rows = solverSummary();

  it("returns one row per solver in e3", () => {
    expect(rows.map((r) => r.solver).sort()).toEqual([
      "greedy",
      "local_search",
      "path_integral_sqa",
      "random",
      "simulated_annealing",
      "tabu",
    ]);
  });

  it("computes ground-state rate over determinate rows only", () => {
    // 270 of 450 e3 rows have found_ground_state = null (above the exact-solver cap).
    // A null must not count as a failure.
    const sa = rows.find((r) => r.solver === "simulated_annealing")!;
    expect(sa.determinateCount).toBeGreaterThan(0);
    expect(sa.determinateCount).toBeLessThan(75);
    expect(sa.groundStateRate).toBe(1);
  });

  it("ranks random below every heuristic on mean F1", () => {
    const random = rows.find((r) => r.solver === "random")!;
    for (const other of rows.filter((r) => r.solver !== "random")) {
      expect(other.meanF1).toBeGreaterThan(random.meanF1);
    }
  });

  it("reports mean runtime as a positive number of seconds", () => {
    for (const row of rows) expect(row.meanRuntimeSeconds).toBeGreaterThan(0);
  });
});

describe("attributionBreakdown", () => {
  it("partitions e1 rows across attribution categories", () => {
    const breakdown = attributionBreakdown();
    const total = breakdown.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(171);
    expect(breakdown.map((b) => b.category)).toContain("no failure");
    expect(breakdown.map((b) => b.category)).toContain("energy model");
  });
});

describe("encodingSummary", () => {
  it("groups e2 by encoding and min_stem_length", () => {
    const rows = encodingSummary();
    const pair = rows.find((r) => r.encoding === "pair")!;
    expect(pair.meanVariables).toBeGreaterThan(0);
    expect(pair.gateARate).toBe(1);
  });

  it("shows maximal stem encoding at msl=1 using fewer variables than pair encoding", () => {
    // The comparison only holds for stem_mode=maximal. Substems at msl=1 is
    // 1337.5 variables — larger than pair. Naming the mode is load-bearing.
    const rows = encodingSummary();
    const pair = rows.find((r) => r.encoding === "pair")!;
    const stem1 = rows.find(
      (r) => r.encoding === "stem" && r.stemMode === "maximal" && r.minStemLength === 1,
    )!;
    expect(stem1.gateARate).toBe(1);
    expect(pair.gateARate).toBe(1);
    expect(stem1.meanVariables).toBeLessThan(pair.meanVariables);
  });

  it("shows the representability ceiling rising as min_stem_length falls", () => {
    const maximal = encodingSummary()
      .filter((r) => r.stemMode === "maximal")
      .sort((a, b) => a.minStemLength! - b.minStemLength!);
    expect(maximal.map((r) => r.minStemLength)).toEqual([1, 2, 3]);
    expect(maximal.map((r) => r.gateARate)).toEqual([1, 0.75, 0.4]);
  });
});

describe("qaoaByReps", () => {
  it("returns one row per circuit depth", () => {
    const rows = qaoaByReps();
    expect(rows.map((r) => r.reps)).toEqual([1, 2, 3]);
  });

  it("matches the ground-state rates reported in the README", () => {
    // These are the published figures. e4 also holds 9 fake_hanoi rows at reps=1;
    // pooling them yields 27.8% and would silently contradict the README.
    const rows = qaoaByReps();
    expect(rows.map((r) => Number(r.groundStateRate.toFixed(3)))).toEqual([
      0.296, 0.407, 0.444,
    ]);
    expect(rows.map((r) => r.circuits)).toEqual([27, 27, 27]);
  });

  it("reports two-qubit gate counts increasing with reps", () => {
    const rows = qaoaByReps();
    expect(rows.map((r) => Number(r.meanTwoQubitGates.toFixed(1)))).toEqual([
      123.6, 247.1, 370.7,
    ]);
  });
});

describe("qaoaByShots", () => {
  it("shows the sampling budget moving the result further than circuit depth", () => {
    const shots = qaoaByShots();
    expect(shots.map((r) => r.shots)).toEqual([256, 1024, 4096]);
    expect(shots.map((r) => Number(r.groundStateRate.toFixed(3)))).toEqual([
      0.148, 0.444, 0.556,
    ]);
    // 14.8 -> 55.6 across shots against 29.6 -> 44.4 across reps. The reps table
    // alone frames circuit depth as the driver, and it is not the larger effect.
    const reps = qaoaByReps();
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    expect(spread(shots.map((r) => r.groundStateRate))).toBeGreaterThan(
      spread(reps.map((r) => r.groundStateRate)),
    );
  });
});

describe("qaoaGrid", () => {
  it("shows depth failing to compensate for a thin sample", () => {
    const grid = qaoaGrid();
    const at = (reps: number, shots: number) =>
      grid.find((c) => c.reps === reps && c.shots === shots)!.groundStateRate;
    expect(grid).toHaveLength(9);
    expect(at(3, 256)).toBeCloseTo(0.222, 3);
    expect(at(1, 4096)).toBeCloseTo(0.333, 3);
    // The deepest circuit on the smallest budget loses to the shallowest circuit
    // on the largest one.
    expect(at(3, 256)).toBeLessThan(at(1, 4096));
  });

  it("covers every cell with the same number of circuits", () => {
    for (const cell of qaoaGrid()) expect(cell.circuits).toBe(9);
  });
});

describe("objectiveComparison", () => {
  it("compares CVaR only against expectation at the setting both were run", () => {
    const { setting, arms } = objectiveComparison();
    // CVaR exists at exactly one configuration. Comparing it against expectation
    // pooled over three shot budgets it never received would attribute the shot
    // budget to the objective.
    expect(setting).toEqual({ reps: 3, shots: 256, noiseBackend: "none" });
    expect(arms.map((a) => a.objective).sort()).toEqual(["cvar", "expectation"]);
    for (const arm of arms) expect(arm.circuits).toBe(9);
  });

  it("finds the two indistinguishable on ground-state rate", () => {
    const { arms } = objectiveComparison();
    const [a, b] = arms;
    expect(a.groundStateRate).toBe(b.groundStateRate);
  });
});

describe("qaoaByLength", () => {
  it("shows the ground-state rate falling as the instance grows", () => {
    const rows = qaoaByLength();
    expect(rows.map((r) => r.length)).toEqual([20, 25, 30]);
    expect(rows[0].groundStateRate).toBeGreaterThan(rows.at(-1)!.groundStateRate);
    expect(rows[0].meanQubits).toBeLessThan(rows.at(-1)!.meanQubits);
  });
});

describe("noiseComparison", () => {
  it("shows the transpilation overhead of targeting a real device", () => {
    const { noiseless, noisy } = noiseComparison();
    // Same reps, same shots, same objective — the only difference is the device
    // target. Routing cost lands entirely in the two-qubit gate count.
    expect(noisy.meanTwoQubitGates).toBeGreaterThan(noiseless.meanTwoQubitGates);
    expect(noisy.meanTranspiledDepth).toBeGreaterThan(noiseless.meanTranspiledDepth);
    expect(noisy.backend).toBe("fake_hanoi");
    expect(noiseless.circuits).toBe(9);
    expect(noisy.circuits).toBe(9);
  });
});

describe("pseudoknotComparison", () => {
  it("pairs each fixture's strict and pseudoknot-mode result", () => {
    const rows = pseudoknotComparison().filter((r) => r.hasPseudoknot);
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.pseudoknotModeF1).toBeGreaterThan(row.strictF1);
      expect(row.viennaF1).toBeLessThanOrEqual(row.strictF1);
    }
  });

  it("labels the constructed provenance verbatim", () => {
    const rows = pseudoknotComparison().filter((r) => r.hasPseudoknot);
    for (const row of rows) {
      expect(row.source).toContain("CONSTRUCTED");
      expect(row.source).toContain("no citation claimed");
    }
  });
});

describe("scalingByLength", () => {
  it("returns variable counts increasing with sequence length", () => {
    const rows = scalingByLength();
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].length).toBeGreaterThan(rows[i - 1].length);
    }
    expect(rows.at(-1)!.meanVariables).toBeGreaterThan(rows[0].meanVariables);
  });
});
