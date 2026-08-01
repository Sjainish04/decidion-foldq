import type { GateReport } from "@/lib/api/schemas";

export type GateState = "pass" | "fail" | "indeterminate" | "not-applicable";

export interface GateStatus {
  id: "A" | "B" | "C" | "D";
  name: string;
  question: string;
  state: GateState;
  detail: string;
  /** The prefix Python's GateReport.attribution would use for this gate. */
  attributionPrefix?: string;
}

/** Mirrors `foldq.schemas.gates.GateReport.attribution`, in the same order:
 *  pseudoknot branch, then A, B, C, then the indeterminate case. The API sends the
 *  authoritative `attribution` string; this derives the per-gate display state,
 *  which the string alone cannot express. */
export function gateLadder(gates: GateReport): GateStatus[] {
  const notApplicable = (reason: string) => ({
    state: "not-applicable" as GateState,
    detail: reason,
  });

  const gateA: GateStatus = gates.representable
    ? {
        id: "A",
        name: "Representable",
        question: "Is the reference structure in the candidate set?",
        state: "pass",
        detail: "The reference structure is reachable from the candidate helices.",
      }
    : {
        id: "A",
        name: "Representable",
        question: "Is the reference structure in the candidate set?",
        state: "fail",
        detail: `Only ${(gates.representable_fraction * 100).toFixed(0)}% of the reference's pairs are reachable. This is a hard ceiling — no optimizer can recover a structure the candidate set never held.`,
        attributionPrefix: "candidate generation",
      };

  const earlierFailed = gateA.state === "fail";

  const gateB: GateStatus = {
    id: "B",
    name: "Faithful",
    question: "Is the reference structure the QUBO's ground state?",
    ...(earlierFailed
      ? notApplicable("Not evaluated: the candidate set did not contain the reference.")
      : gates.is_qubo_ground_state === null
        ? {
            state: "indeterminate" as GateState,
            detail:
              "Exact ground truth is unavailable above roughly 22 variables. Not a failure — an unanswered question.",
            attributionPrefix: "indeterminate",
          }
        : gates.is_qubo_ground_state
          ? { state: "pass" as GateState, detail: "The reference structure is the QUBO's ground state." }
          : {
              state: "fail" as GateState,
              detail:
                "The QUBO prefers a different structure to the reference: the energy model is misspecified for this instance.",
              attributionPrefix: "energy model",
            }),
  };

  const gateCBlocked = earlierFailed || gateB.state === "fail";

  const gateC: GateStatus = {
    id: "C",
    name: "Solved",
    question: "Did this solver reach the QUBO ground state?",
    ...(gateCBlocked
      ? notApplicable("Not evaluated: an earlier gate failed.")
      : gates.solver_found_ground_state === null
        ? {
            state: "indeterminate" as GateState,
            detail:
              "Exact ground truth is unavailable at this size, so solver optimality cannot be decided.",
            attributionPrefix: "indeterminate",
          }
        : gates.solver_found_ground_state
          ? { state: "pass" as GateState, detail: "The solver reached the QUBO ground state." }
          : {
              state: "fail" as GateState,
              detail: "The solver did not reach the QUBO ground state.",
              attributionPrefix: "optimizer",
            }),
  };

  // A hard failure anywhere upstream (A, B, or C) makes Gate D's physical metrics
  // moot too — they would be scoring a run that already went wrong for a known
  // reason. An *indeterminate* upstream gate does not block D: F1 and energy gap
  // are measured directly off the decoded candidate and stay meaningful even when
  // exact ground truth couldn't be decided (see the "indeterminate" test case).
  const earlierGateFailed =
    gateA.state === "fail" || gateB.state === "fail" || gateC.state === "fail";

  const gateD: GateStatus = {
    id: "D",
    name: "Physical",
    question: "Energy gap and base-pair F1 after decode, repair and rescore",
    ...(gates.is_pseudoknotted
      ? notApplicable(
          `Base-pair F1 ${gates.base_pair_f1.toFixed(3)} against a nested reference. The reference can hold at most one of any two crossing helices, so precision is structurally capped even when the candidate is correct. ViennaRNA cannot score a crossing structure, so no energy gap is reported.`,
        )
      : earlierGateFailed
        ? notApplicable("Not evaluated: an earlier gate failed.")
        : {
            state: (gates.base_pair_f1 > 0 ? "pass" : "fail") as GateState,
            detail: `Base-pair F1 ${gates.base_pair_f1.toFixed(3)}${
              gates.energy_gap === null
                ? "; energy gap unavailable"
                : `, energy gap ${gates.energy_gap.toFixed(2)} kcal/mol`
            }.`,
          }),
  };

  return [gateA, gateB, gateC, gateD];
}
