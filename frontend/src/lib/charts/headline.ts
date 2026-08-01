import {
  attributionBreakdown,
  pseudoknotComparison,
  qaoaByReps,
  solverSummary,
} from "./transforms";

export interface HeadlineStat {
  label: string;
  value: string;
  caption: string;
  source: string;
}

/** Every figure is computed from the bundled experiment output. Nothing here is a
 *  literal — a hard-coded headline is how a README ends up citing a number no
 *  experiment produced. */
export function headlineStats(): HeadlineStat[] {
  const attribution = attributionBreakdown();
  const clean = attribution.find((a) => a.category === "no failure");
  const solvers = solverSummary();
  const qaoa = qaoaByReps();
  const rates = qaoa.map((r) => Math.round(r.groundStateRate * 100));
  const knotted = pseudoknotComparison().filter((r) => r.hasPseudoknot);
  const worst = pseudoknotComparison()
    .filter((r) => !r.hasPseudoknot)
    .sort((a, b) => a.strictF1 - b.strictF1)[0];
  const perfect = solvers.filter((r) => r.groundStateRate === 1);

  return [
    {
      label: "Runs with no attributed failure",
      value: `${((clean?.fraction ?? 0) * 100).toFixed(0)}%`,
      caption: `${clean?.count ?? 0} of ${attribution.reduce((s, a) => s + a.count, 0)} formulation runs pass every gate.`,
      source: "results/full/e1_formulation.csv",
    },
    {
      label: "QAOA reaches the ground state",
      value: `${Math.min(...rates)}–${Math.max(...rates)}%`,
      caption:
        "Across circuit depth, on the noiseless expectation objective. The shot budget spans a wider range still — see Quantum resources.",
      source: "results/full/e4_qaoa.csv",
    },
    {
      label: "Classical solvers at 100%",
      value: `${perfect.length} of ${solvers.length}`,
      caption: `${perfect.map((s) => s.solver).join(", ")} reach the ground state on every determinate run.`,
      source: "results/full/e3_solvers.csv",
    },
    {
      label: "Pseudoknot fixtures recovered",
      value: `${knotted.filter((r) => r.pseudoknotModeF1 === 1).length} of ${knotted.length}`,
      caption:
        "With the crossing penalty disabled. ViennaRNA cannot express a crossing at all.",
      source: "results/full/e5_pseudoknot.csv",
    },
    {
      label: "Hardest real structure",
      value: worst ? worst.strictF1.toFixed(3) : "—",
      caption: worst
        ? `Base-pair F1 on ${worst.sequenceId} (${worst.length} nt). The method degrades on real structures at scale, and we report it.`
        : "",
      source: "results/full/e5_pseudoknot.csv",
    },
  ];
}
