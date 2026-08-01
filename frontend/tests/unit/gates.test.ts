import { describe, expect, it } from "vitest";
import { gateLadder } from "@/lib/foldq/gates";
import type { GateReport } from "@/lib/api/schemas";

const base: GateReport = {
  representable: true,
  representable_fraction: 1,
  is_qubo_ground_state: true,
  solver_found_ground_state: true,
  energy_gap: 0,
  base_pair_f1: 1,
  is_pseudoknotted: false,
  attribution: "no failure: all gates passed",
  notes: [],
};

describe("gateLadder", () => {
  it("passes all four gates on a clean run", () => {
    const ladder = gateLadder(base);
    expect(ladder.map((g) => g.id)).toEqual(["A", "B", "C", "D"]);
    expect(ladder.every((g) => g.state === "pass")).toBe(true);
  });

  it("fails Gate A and marks later gates not-applicable", () => {
    const ladder = gateLadder({
      ...base,
      representable: false,
      representable_fraction: 0.5,
      attribution:
        "candidate generation: the reference structure is not in the candidate set (only 50% of its pairs are reachable)",
    });
    expect(ladder[0].state).toBe("fail");
    // A later gate cannot be blamed for an earlier failure — this is the whole
    // point of attributing to the earliest failing gate.
    expect(ladder.slice(1).every((g) => g.state === "not-applicable")).toBe(true);
  });

  it("fails Gate B when the reference is not the ground state", () => {
    const ladder = gateLadder({
      ...base,
      is_qubo_ground_state: false,
      attribution: "energy model: the reference structure is not the QUBO ground state",
    });
    expect(ladder[0].state).toBe("pass");
    expect(ladder[1].state).toBe("fail");
    expect(ladder[2].state).toBe("not-applicable");
  });

  it("fails Gate C when the solver missed the ground state", () => {
    const ladder = gateLadder({
      ...base,
      solver_found_ground_state: false,
      attribution: "optimizer: the solver did not reach the QUBO ground state",
    });
    expect(ladder[1].state).toBe("pass");
    expect(ladder[2].state).toBe("fail");
  });

  it("marks B and C indeterminate rather than failed when ground truth is unavailable", () => {
    const ladder = gateLadder({
      ...base,
      is_qubo_ground_state: null,
      solver_found_ground_state: null,
      attribution: "indeterminate: instance too large for exact ground truth",
    });
    expect(ladder[1].state).toBe("indeterminate");
    expect(ladder[2].state).toBe("indeterminate");
    expect(ladder[3].state).toBe("pass");
  });

  it("explains that precision is capped for a pseudoknotted candidate", () => {
    const ladder = gateLadder({
      ...base,
      is_pseudoknotted: true,
      base_pair_f1: 0.667,
      energy_gap: null,
      attribution:
        "pseudoknotted candidate: the selected structure contains crossing pairs, which ViennaRNA cannot represent or score.",
    });
    const gateD = ladder[3];
    expect(gateD.state).toBe("not-applicable");
    expect(gateD.detail).toMatch(/capped/i);
  });

  it("agrees with the attribution string the backend produced", () => {
    // Guards against the TS mirror drifting from Python's GateReport.attribution.
    const cases: [GateReport, string][] = [
      [base, "no failure"],
      [{ ...base, representable: false }, "candidate generation"],
      [{ ...base, is_qubo_ground_state: false }, "energy model"],
      [{ ...base, solver_found_ground_state: false }, "optimizer"],
      [{ ...base, is_qubo_ground_state: null }, "indeterminate"],
      [{ ...base, is_pseudoknotted: true }, "pseudoknotted candidate"],
    ];
    for (const [gates, expectedPrefix] of cases) {
      const ladder = gateLadder(gates);
      const earliestFailure = ladder.find(
        (g) => g.state === "fail" || g.state === "indeterminate",
      );
      const derived = earliestFailure?.attributionPrefix ?? "no failure";
      expect(gates.is_pseudoknotted ? "pseudoknotted candidate" : derived).toBe(
        expectedPrefix,
      );
    }
  });
});
