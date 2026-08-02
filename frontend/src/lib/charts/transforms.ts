import { loadExperiment, type Row } from "@/lib/results";

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function groupBy<K extends string | number>(rows: Row[], key: (row: Row) => K) {
  const groups = new Map<K, Row[]>();
  for (const row of rows) {
    const k = key(row);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(row);
  }
  return groups;
}

const num = (row: Row, column: string) => Number(row[column]);

export interface SolverSummaryRow {
  solver: string;
  runs: number;
  /** Rows where Gate C is determinate. Above ~22 variables the exact reference is
   *  unavailable and found_ground_state is null — those rows are excluded from the
   *  rate rather than counted as failures. */
  determinateCount: number;
  groundStateRate: number;
  meanF1: number;
  meanEnergyGap: number;
  meanRuntimeSeconds: number;
}

export function solverSummary(): SolverSummaryRow[] {
  const rows = loadExperiment("e3_solvers");
  return [...groupBy(rows, (r) => String(r.solver))]
    .map(([solver, group]) => {
      const determinate = group.filter((r) => r.found_ground_state !== null);
      return {
        solver,
        runs: group.length,
        determinateCount: determinate.length,
        groundStateRate:
          determinate.length === 0
            ? 0
            : determinate.filter((r) => r.found_ground_state === true).length /
              determinate.length,
        meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
        meanEnergyGap: mean(group.map((r) => num(r, "energy_gap"))),
        meanRuntimeSeconds: mean(group.map((r) => num(r, "runtime_seconds"))),
      };
    })
    .sort((a, b) => b.meanF1 - a.meanF1);
}

export interface AttributionRow {
  category: string;
  count: number;
  fraction: number;
}

/** The attribution string is "<category>: <explanation>". The category is the
 *  earliest failing gate and is what the chart groups by. */
export function attributionBreakdown(): AttributionRow[] {
  const rows = loadExperiment("e1_formulation");
  const groups = groupBy(rows, (r) => String(r.attribution).split(":")[0].trim());
  return [...groups]
    .map(([category, group]) => ({
      category,
      count: group.length,
      fraction: group.length / rows.length,
    }))
    .sort((a, b) => b.count - a.count);
}

export interface EncodingRow {
  encoding: string;
  stemMode: string | null;
  minStemLength: number | null;
  meanVariables: number;
  meanQuadraticTerms: number;
  meanDensity: number;
  gateARate: number;
  instances: number;
}

export function encodingSummary(): EncodingRow[] {
  const rows = loadExperiment("e2_encoding");
  const groups = groupBy(
    rows,
    (r) => `${r.encoding}|${r.stem_mode ?? ""}|${r.min_stem_length ?? ""}`,
  );
  return [...groups]
    .map(([, group]) => {
      const first = group[0];
      return {
        encoding: String(first.encoding),
        stemMode: first.stem_mode === null ? null : String(first.stem_mode),
        minStemLength:
          first.min_stem_length === null ? null : Number(first.min_stem_length),
        meanVariables: mean(group.map((r) => num(r, "num_variables"))),
        meanQuadraticTerms: mean(group.map((r) => num(r, "num_quadratic_terms"))),
        meanDensity: mean(group.map((r) => num(r, "qubo_density"))),
        gateARate: group.filter((r) => r.representable === true).length / group.length,
        instances: group.length,
      };
    })
    .sort((a, b) => a.meanVariables - b.meanVariables);
}

export interface QaoaRow {
  reps: number;
  circuits: number;
  groundStateRate: number;
  meanF1: number;
  meanCircuitDepth: number;
  meanTranspiledDepth: number;
  meanTwoQubitGates: number;
  meanQubits: number;
  meanRuntimeSeconds: number;
}

const NOISELESS_EXPECTATION = (r: Row) =>
  r.objective === "expectation" && r.noise_backend === "none";

/** Ground-state rate over rows where Gate C is determinate. Shared by every QAOA
 *  transform so a null is never counted as a failure in one view and excluded in
 *  another. */
function groundStateRate(rows: Row[]): number {
  const determinate = rows.filter((r) => r.found_ground_state !== null);
  return determinate.length === 0
    ? 0
    : determinate.filter((r) => r.found_ground_state === true).length /
        determinate.length;
}

/** The README's QAOA table is the **noiseless expectation** subset: 27 rows per
 *  `reps` (3 shot settings x 9 sequences). e4 also contains 9 `fake_hanoi` rows at
 *  reps=1 and 9 CVaR rows at reps=3. Pooling them changes every published figure —
 *  reps=1 becomes 27.8% instead of 29.6% — so both filters are required, not
 *  cosmetic. `noiseComparison` covers the device-target rows separately. */
export function qaoaByReps(): QaoaRow[] {
  const rows = loadExperiment("e4_qaoa").filter(NOISELESS_EXPECTATION);
  return [...groupBy(rows, (r) => Number(r.reps))]
    .map(([reps, group]) => {
      return {
        reps,
        circuits: group.length,
        groundStateRate: groundStateRate(group),
        meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
        meanCircuitDepth: mean(group.map((r) => num(r, "circuit_depth"))),
        meanTranspiledDepth: mean(group.map((r) => num(r, "transpiled_depth"))),
        meanTwoQubitGates: mean(group.map((r) => num(r, "two_qubit_gates"))),
        meanQubits: mean(group.map((r) => num(r, "logical_qubits"))),
        meanRuntimeSeconds: mean(group.map((r) => num(r, "runtime_seconds"))),
      };
    })
    .sort((a, b) => a.reps - b.reps);
}

export interface QaoaShotsRow {
  shots: number;
  circuits: number;
  groundStateRate: number;
  meanF1: number;
}

/** The `reps` view is the conventional presentation and it buries the larger
 *  effect. Across shot budgets the ground-state rate moves 14.8% to 55.6%; across
 *  `reps` it moves 29.6% to 44.4%. At these sizes the binding constraint was the
 *  sampling budget, not circuit expressivity. */
export function qaoaByShots(): QaoaShotsRow[] {
  const rows = loadExperiment("e4_qaoa").filter(NOISELESS_EXPECTATION);
  return [...groupBy(rows, (r) => Number(r.shots))]
    .map(([shots, group]) => ({
      shots,
      circuits: group.length,
      groundStateRate: groundStateRate(group),
      meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
    }))
    .sort((a, b) => a.shots - b.shots);
}

export interface QaoaGridCell {
  reps: number;
  shots: number;
  circuits: number;
  groundStateRate: number;
  meanF1: number;
}

/** The full reps x shots grid, which shows the trade the marginal views cannot:
 *  `reps=3` at 256 shots (22.2%) loses to `reps=1` at 4096 shots (33.3%). A deeper
 *  circuit on a thinner sample is the worse configuration. */
export function qaoaGrid(): QaoaGridCell[] {
  const rows = loadExperiment("e4_qaoa").filter(NOISELESS_EXPECTATION);
  return [...groupBy(rows, (r) => `${r.reps}|${r.shots}`)]
    .map(([, group]) => ({
      reps: Number(group[0].reps),
      shots: Number(group[0].shots),
      circuits: group.length,
      groundStateRate: groundStateRate(group),
      meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
    }))
    .sort((a, b) => a.reps - b.reps || a.shots - b.shots);
}

export interface ObjectiveArm {
  objective: string;
  circuits: number;
  groundStateRate: number;
  meanF1: number;
}

/** CVaR was run at exactly one configuration — reps=3, 256 shots, noiseless — so it
 *  can only be compared against the expectation rows at that same setting. Comparing
 *  it against expectation pooled over every shot count would attribute the sampling
 *  budget to the objective and manufacture a difference that is not there. The
 *  setting is returned alongside the arms so the UI must state it. */
export function objectiveComparison(): {
  setting: { reps: number; shots: number; noiseBackend: string };
  arms: ObjectiveArm[];
} {
  const setting = { reps: 3, shots: 256, noiseBackend: "none" };
  const rows = loadExperiment("e4_qaoa").filter(
    (r) =>
      Number(r.reps) === setting.reps &&
      Number(r.shots) === setting.shots &&
      r.noise_backend === setting.noiseBackend,
  );
  const arms = [...groupBy(rows, (r) => String(r.objective))]
    .map(([objective, group]) => ({
      objective,
      circuits: group.length,
      groundStateRate: groundStateRate(group),
      meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
    }))
    .sort((a, b) => a.objective.localeCompare(b.objective));
  return { setting, arms };
}

export interface QaoaLengthRow {
  length: number;
  circuits: number;
  groundStateRate: number;
  meanF1: number;
  meanQubits: number;
}

/** Sequence length is encoded in the identifier (`syn_30_001`), not carried as its
 *  own column in e4. */
export function qaoaByLength(): QaoaLengthRow[] {
  const rows = loadExperiment("e4_qaoa").filter(NOISELESS_EXPECTATION);
  return [...groupBy(rows, (r) => Number(String(r.sequence_id).split("_")[1]))]
    .map(([length, group]) => ({
      length,
      circuits: group.length,
      groundStateRate: groundStateRate(group),
      meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
      meanQubits: mean(group.map((r) => num(r, "logical_qubits"))),
    }))
    .sort((a, b) => a.length - b.length);
}

export interface NoiseArm {
  backend: string;
  circuits: number;
  groundStateRate: number;
  meanF1: number;
  meanTranspiledDepth: number;
  meanTwoQubitGates: number;
}

/** Compares the same circuits transpiled for an ideal simulator against
 *  `fake_hanoi` (real IBM calibration data). Matched on reps=1, shots=256,
 *  expectation objective — a mismatched comparison would attribute shot noise to
 *  routing. SWAP cost is folded into two_qubit_gates, not reported separately. */
export function noiseComparison(): { noiseless: NoiseArm; noisy: NoiseArm } {
  const rows = loadExperiment("e4_qaoa").filter(
    (r) => r.objective === "expectation" && r.reps === 1 && r.shots === 256,
  );
  const arm = (backend: string): NoiseArm => {
    const group = rows.filter((r) => r.noise_backend === backend);
    return {
      backend,
      circuits: group.length,
      groundStateRate: groundStateRate(group),
      meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
      meanTranspiledDepth: mean(group.map((r) => num(r, "transpiled_depth"))),
      meanTwoQubitGates: mean(group.map((r) => num(r, "two_qubit_gates"))),
    };
  };
  return { noiseless: arm("none"), noisy: arm("fake_hanoi") };
}

export interface PseudoknotRow {
  sequenceId: string;
  length: number;
  hasPseudoknot: boolean;
  source: string;
  viennaF1: number;
  strictF1: number;
  pseudoknotModeF1: number;
  crossingPairsInReference: number;
  viennaStructure: string;
}

/** e5 holds two rows per fixture — forbid_crossing true (strict) and false
 *  (pseudoknot mode). They are joined here so a chart can show the pair. */
export function pseudoknotComparison(): PseudoknotRow[] {
  const rows = loadExperiment("e5_pseudoknot");
  return [...groupBy(rows, (r) => String(r.sequence_id))].map(([sequenceId, group]) => {
    const strict = group.find((r) => r.forbid_crossing === true)!;
    const open = group.find((r) => r.forbid_crossing === false) ?? strict;
    return {
      sequenceId,
      length: num(strict, "length"),
      hasPseudoknot: strict.has_pseudoknot === true,
      source: String(strict.source),
      viennaF1: num(strict, "vienna_f1_vs_reference"),
      strictF1: num(strict, "base_pair_f1_vs_reference"),
      pseudoknotModeF1: num(open, "base_pair_f1_vs_reference"),
      crossingPairsInReference: num(strict, "num_crossing_pairs_in_reference"),
      viennaStructure: String(strict.vienna_structure),
    };
  });
}

export interface ScalingRow {
  length: number;
  meanVariables: number;
  meanDensity: number;
  instances: number;
}

export function scalingByLength(): ScalingRow[] {
  const rows = loadExperiment("e1_formulation");
  return [...groupBy(rows, (r) => Number(r.length))]
    .map(([length, group]) => ({
      length,
      meanVariables: mean(group.map((r) => num(r, "num_variables"))),
      meanDensity: mean(group.map((r) => num(r, "qubo_density"))),
      instances: group.length,
    }))
    .sort((a, b) => a.length - b.length);
}

export interface SurrogateFidelityRow {
  sequenceId: string;
  length: number;
  candidateCount: number;
  spearman: number;
  kendall: number;
  top1Match: boolean;
  top5Overlap: number;
  regret: number;
}

export interface SurrogateSummary {
  sequences: number;
  degenerate: number;
  medianSpearman: number;
  medianKendall: number;
  top1Successes: number;
  medianRegret: number;
  meanRegret: number;
  withinHalf: number;
  withinOne: number;
  withinTwo: number;
  rows: SurrogateFidelityRow[];
}

const median = (values: number[]): number => {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Within-sequence agreement between the QUBO surrogate and ViennaRNA (E6).
 *
 *  This is the statistic the pooled cross-sequence correlation cannot supply.
 *  Longer RNAs have more stems and more negative energies, so a correlation
 *  taken across lengths is partly measuring length; the optimizer only ever
 *  ranks candidates *within* one sequence.
 *
 *  Sequences whose ensemble was too small or too flat to rank yield an
 *  undefined correlation. They are counted as degenerate and excluded, never
 *  folded into the aggregate as agreement. */
export function surrogateFidelity(): SurrogateSummary {
  const all = loadExperiment("e6_surrogate").map((r) => ({
    sequenceId: String(r.sequence_id),
    length: num(r, "sequence_length"),
    candidateCount: num(r, "candidate_count"),
    spearman: num(r, "spearman"),
    kendall: num(r, "kendall_tau"),
    top1Match: r.top1_match === true,
    top5Overlap: num(r, "top5_overlap"),
    regret: num(r, "regret_kcal_mol"),
  }));

  const usable = all.filter((r) => r.candidateCount >= 3 && Number.isFinite(r.spearman));
  const regrets = usable.map((r) => r.regret);
  const within = (limit: number) =>
    regrets.length === 0 ? 0 : regrets.filter((g) => g <= limit).length / regrets.length;

  return {
    sequences: usable.length,
    degenerate: all.length - usable.length,
    medianSpearman: median(usable.map((r) => r.spearman)),
    medianKendall: median(usable.map((r) => r.kendall)),
    top1Successes: usable.filter((r) => r.top1Match).length,
    medianRegret: median(regrets),
    meanRegret: mean(regrets),
    withinHalf: within(0.5),
    withinOne: within(1.0),
    withinTwo: within(2.0),
    rows: usable.sort((a, b) => b.spearman - a.spearman),
  };
}
