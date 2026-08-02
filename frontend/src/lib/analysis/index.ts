import data from "./data.json";

/** E7 runs multivariate statistics over FoldQ's own committed experiment output
 *  (E1's instance geometry, E3's solver behaviour) — it is not a new sweep, and
 *  re-running it against the same CSVs reproduces every number here exactly.
 *  Each section below carries its own `note` explaining a methodological choice
 *  (why predictors are z-scored, why partial dependence needs no surrogate model,
 *  why the parity plot is out-of-fold); pages consuming this module should surface
 *  those notes rather than only the numbers. */

export interface VifRow {
  column: string;
  vif: number;
  severity: string;
}

export interface MulticollinearitySection {
  note: string;
  e1: VifRow[];
}

export interface CorrelationMatrix {
  columns: string[];
  matrix: number[][];
  method: string;
}

export interface CorrelationsSection {
  e1: CorrelationMatrix;
  e3: CorrelationMatrix;
}

export interface RegressionCoefficient {
  name: string;
  beta: number;
  std_error: number;
  t: number;
  p_value: number;
}

export interface RegressionModel {
  outcome: string;
  coefficients: RegressionCoefficient[];
  r_squared: number;
  adjusted_r_squared: number;
  n: number;
  note: string;
}

export interface RegressionSection {
  note: string;
  f1_on_instance_features: RegressionModel;
  gate_b_on_instance_features: RegressionModel;
}

export interface PrincipalComponentsE1 {
  columns: string[];
  explained_variance_ratio: number[];
  /** Loadings for the first two components only (`[pc1Loadings, pc2Loadings]`),
   *  each aligned index-for-index with `columns`. Later components are summarised
   *  only through `explained_variance_ratio`. */
  loadings: number[][];
  /** One `[pc1, pc2]` pair per E1 instance, in `results/full/e1_formulation.csv`
   *  row order. Not individually labelled, so this module exposes it only for a
   *  scatter of the instance geometry, not a per-row table. */
  scores: number[][];
}

export interface PcaSection {
  note: string;
  e1: PrincipalComponentsE1;
}

export interface PartialDependenceRow {
  factor: string;
  level: string;
  mean: number;
  n: number;
}

export interface PartialDependenceSection {
  note: string;
  gate_b: PartialDependenceRow[];
  base_pair_f1: PartialDependenceRow[];
}

export interface RandomForestModel {
  outcome: string;
  features: string[];
  n: number;
  folds: number;
  r2: number;
  mae: number;
  rmse: number;
  /** Parallel arrays: `actual[i]`/`predicted[i]` are the same held-out instance. */
  actual: number[];
  predicted: number[];
}

export interface FeatureImportanceRow {
  feature: string;
  importance: number;
  std: number;
}

export interface LearningCurvePoint {
  train_size: number;
  train_score: number;
  test_score: number;
}

export interface RandomForestSection {
  note: string;
  f1_from_design_factors: RandomForestModel;
  importance: FeatureImportanceRow[];
  learning_curve: LearningCurvePoint[];
}

export interface ParetoPoint {
  label: string;
  cost: number;
  benefit: number;
  on_frontier: boolean;
}

export interface ParetoSection {
  note: string;
  encoding_variables_vs_representability: ParetoPoint[];
  solver_runtime_vs_accuracy: ParetoPoint[];
}

export interface E7Analysis {
  generated_from: string;
  note: string;
  multicollinearity: MulticollinearitySection;
  correlations: CorrelationsSection;
  regression: RegressionSection;
  principal_components: PcaSection;
  partial_dependence: PartialDependenceSection;
  random_forest: RandomForestSection;
  pareto: ParetoSection;
}

/** `results/full/e7_analysis.json`, committed verbatim as `./data.json` — see
 *  that file's own top-level `note` for provenance. */
export const analysis = data as E7Analysis;

// ---------------------------------------------------------------------------
// Derived helpers. Every figure on the page these feed is required to trace to
// `analysis` rather than a literal, so ranges, thresholds and rankings below are
// all computed from the loaded data rather than written down as constants.
// ---------------------------------------------------------------------------

export function vifRange(rows: VifRow[]): { min: number; max: number } {
  const vifs = rows.map((r) => r.vif);
  return { min: Math.min(...vifs), max: Math.max(...vifs) };
}

export function allAcceptable(rows: VifRow[]): boolean {
  return rows.every((r) => r.severity === "acceptable");
}

/** Coefficients reaching conventional significance at the given alpha (default
 *  0.05), preserving their original order. */
export function significantCoefficients(
  model: RegressionModel,
  alpha = 0.05,
): RegressionCoefficient[] {
  return model.coefficients.filter((c) => c.p_value < alpha);
}

export function cumulativeVariance(ratios: number[]): number[] {
  let sum = 0;
  return ratios.map((r) => (sum += r));
}

/** How many leading components are needed to reach `threshold` (default 0.9)
 *  cumulative explained variance. Falls back to every component if the ratios
 *  never reach the threshold. */
export function componentsForVariance(ratios: number[], threshold = 0.9): number {
  const cumulative = cumulativeVariance(ratios);
  const index = cumulative.findIndex((c) => c >= threshold);
  return index === -1 ? ratios.length : index + 1;
}

export interface FactorSpread {
  factor: string;
  /** This factor's levels, sorted by mean descending — index 0 is the best
   *  level, the last index the worst. */
  levels: PartialDependenceRow[];
  /** max(mean) - min(mean) across this factor's levels: how much the outcome
   *  moves from switching levels of this one factor. */
  spread: number;
}

/** Groups partial-dependence rows by factor and ranks the factors by how much
 *  the outcome moves across their levels — the largest spread is the factor
 *  that matters most to the outcome. */
export function factorSpreads(rows: PartialDependenceRow[]): FactorSpread[] {
  const byFactor = new Map<string, PartialDependenceRow[]>();
  for (const row of rows) {
    const levels = byFactor.get(row.factor) ?? [];
    levels.push(row);
    byFactor.set(row.factor, levels);
  }
  return [...byFactor.entries()]
    .map(([factor, levels]) => {
      const sorted = [...levels].sort((a, b) => b.mean - a.mean);
      const means = sorted.map((l) => l.mean);
      return { factor, levels: sorted, spread: Math.max(...means) - Math.min(...means) };
    })
    .sort((a, b) => b.spread - a.spread);
}

/** `[actual, predicted]` pairs for a random-forest model's out-of-fold output,
 *  suitable for a parity scatter. */
export function parityPoints(model: RandomForestModel): [number, number][] {
  return model.actual.map((a, i) => [a, model.predicted[i]] as [number, number]);
}

/** Evenly spaced points along `y = x` from `min` to `max`, for overlaying a
 *  "perfect prediction" reference on a parity scatter built from the reused
 *  `ScatterChart` (which has no dedicated reference-line series type). */
export function diagonalReference(min = 0, max = 1, steps = 10): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const v = min + ((max - min) * i) / steps;
    return [v, v] as [number, number];
  });
}

/** Importance rows whose magnitude does not exceed one std of the permutation
 *  estimate — i.e. not distinguishable from zero at that resolution. */
export function negligibleImportance(rows: FeatureImportanceRow[]): FeatureImportanceRow[] {
  return rows.filter((r) => Math.abs(r.importance) < r.std);
}
