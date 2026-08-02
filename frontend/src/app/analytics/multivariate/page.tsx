import { BarChart } from "@/components/analytics/BarChart";
import { ChartCard } from "@/components/analytics/ChartCard";
import { DataTable } from "@/components/analytics/DataTable";
import { LineChart } from "@/components/analytics/LineChart";
import { ScatterChart } from "@/components/analytics/ScatterChart";
import {
  analysis,
  allAcceptable,
  componentsForVariance,
  cumulativeVariance,
  diagonalReference,
  factorSpreads,
  negligibleImportance,
  parityPoints,
  significantCoefficients,
  vifRange,
  type CorrelationMatrix,
  type ParetoPoint,
  type RegressionModel,
} from "@/lib/analysis";

const SOURCE = "results/full/e7_analysis.json";

const fixed1 = (value: number) => value.toFixed(1);
const fixed2 = (value: number) => value.toFixed(2);
const fixed3 = (value: number) => value.toFixed(3);
const pct1 = (value: number) => `${(value * 100).toFixed(1)}%`;
const formatP = (value: number) => (value < 0.001 ? "< 0.001" : value.toFixed(3));
const yesNo = (value: boolean) => (value ? "yes" : "no");

/** "a, b, and c" — used so significance and importance findings read as a
 *  sentence rather than a bracketed array dump. */
function joinNames(names: string[]): string {
  if (names.length === 0) return "none of them";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** Renders a factor-spread ranking (see `factorSpreads`) as one sentence
 *  fragment per factor, each naming its best and worst level. */
function spreadPhrase(spreads: ReturnType<typeof factorSpreads>): string {
  const parts = spreads.map((s) => {
    const best = s.levels[0];
    const worst = s.levels[s.levels.length - 1];
    return `${s.factor} (${best.mean.toFixed(3)} at ${best.level} vs ${worst.mean.toFixed(3)} at ${worst.level})`;
  });
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join("; ")}; and ${parts[parts.length - 1]}`;
}

function CorrelationTable({ matrix }: { matrix: CorrelationMatrix }) {
  const rows = matrix.columns.map((rowName, i) => {
    const row: Record<string, string | number> = { variable: rowName };
    matrix.columns.forEach((colName, j) => {
      row[colName] = matrix.matrix[i][j];
    });
    return row;
  });
  return (
    <DataTable
      caption={`${matrix.method} correlation matrix over ${matrix.columns.join(", ")}`}
      columns={[
        { key: "variable", label: "" },
        ...matrix.columns.map((c) => ({ key: c, label: c, format: fixed2 })),
      ]}
      rows={rows}
    />
  );
}

function regressionRows(model: RegressionModel) {
  const significant = new Set(significantCoefficients(model).map((c) => c.name));
  return model.coefficients.map((c) => ({
    ...c,
    significant: significant.has(c.name) ? "yes (p < 0.05)" : "no",
  }));
}

function paretoSeries(points: ParetoPoint[]) {
  const frontier = points.filter((p) => p.on_frontier);
  const rest = points.filter((p) => !p.on_frontier);
  return [
    {
      name: "On frontier",
      points: frontier.map((p) => [p.cost, p.benefit] as [number, number]),
      color: "#10b981",
    },
    {
      name: "Off frontier",
      points: rest.map((p) => [p.cost, p.benefit] as [number, number]),
      color: "#64748b",
    },
  ];
}

export default function MultivariatePage() {
  const {
    multicollinearity,
    correlations,
    regression,
    principal_components,
    partial_dependence,
    random_forest,
    pareto,
  } = analysis;

  const vifE1 = multicollinearity.e1;
  const vifBounds = vifRange(vifE1);
  const vifOk = allAcceptable(vifE1);

  const f1Model = regression.f1_on_instance_features;
  const gateBModel = regression.gate_b_on_instance_features;
  const f1SigNames = significantCoefficients(f1Model).map((c) => c.name);
  const gateBSigNames = significantCoefficients(gateBModel).map((c) => c.name);

  const pca = principal_components.e1;
  const cumulative = cumulativeVariance(pca.explained_variance_ratio);
  const componentsNeeded = componentsForVariance(pca.explained_variance_ratio, 0.9);
  const pcaScores = pca.scores.map(([x, y]) => [x, y] as [number, number]);

  const gateBSpreads = factorSpreads(partial_dependence.gate_b);
  const f1Spreads = factorSpreads(partial_dependence.base_pair_f1);

  const rf = random_forest.f1_from_design_factors;
  const parity = parityPoints(rf);
  const diagonal = diagonalReference(0, 1, 10);
  const learningCurve = random_forest.learning_curve;
  const anyNegativeTestScore = learningCurve.some((p) => p.test_score < 0);
  const worstFold = learningCurve.reduce(
    (worst, p) => (p.test_score < worst.test_score ? p : worst),
    learningCurve[0],
  );
  const weakest = negligibleImportance(random_forest.importance);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Analysis &amp; data</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          E7 runs multivariate statistics over FoldQ&apos;s own committed experiment
          output — {analysis.generated_from} — to characterise which instance features
          and design factors actually drive outcomes, whether they overlap with each
          other, and where the data runs out. {analysis.note}
        </p>
      </header>

      <ChartCard
        title="Correlation matrix — E1 instance features"
        description={`Pairwise ${correlations.e1.method} correlation between the instance-geometry features and base-pair F1.`}
        source={SOURCE}
      >
        <CorrelationTable matrix={correlations.e1} />
      </ChartCard>

      <ChartCard
        title="Correlation matrix — E3 solver behaviour"
        description={`Pairwise ${correlations.e3.method} correlation between instance size, energy terms, accuracy and runtime.`}
        source={SOURCE}
      >
        <CorrelationTable matrix={correlations.e3} />
      </ChartCard>

      <ChartCard
        title="Multicollinearity — variance inflation factors (E1)"
        description={multicollinearity.note}
        source={SOURCE}
        table={{
          caption: "VIF by instance-geometry feature",
          columns: [
            { key: "column", label: "Feature" },
            { key: "vif", label: "VIF", format: fixed2 },
            { key: "severity", label: "Severity" },
          ],
          rows: vifE1,
        }}
      >
        <BarChart
          categories={vifE1.map((r) => r.column)}
          series={[{ name: "VIF", data: vifE1.map((r) => r.vif) }]}
          yLabel="VIF"
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">Multicollinearity is not a problem here</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {vifOk ? (
            <>
              Every one of the {vifE1.length} instance-geometry features has a VIF
              between <strong>{fixed2(vifBounds.min)}</strong> and{" "}
              <strong>{fixed2(vifBounds.max)}</strong> — well under the conventional
              concern threshold of 10. The standardised regression coefficients below
              can be read as approximately independent effects rather than as an
              artifact of correlated predictors.
            </>
          ) : (
            <>
              VIF ranges from {fixed2(vifBounds.min)} to {fixed2(vifBounds.max)}; at
              least one feature exceeds the conventional concern threshold of 10, so its
              coefficient below should not be read as an independent effect.
            </>
          )}
        </p>
      </section>

      <ChartCard
        title={`Standardised OLS drivers — ${f1Model.outcome}`}
        description={regression.note}
        source={SOURCE}
        table={{
          caption: `OLS coefficients for ${f1Model.outcome} on z-scored instance features`,
          columns: [
            { key: "name", label: "Feature" },
            { key: "beta", label: "β (z-scored)", format: fixed3 },
            { key: "std_error", label: "SE", format: fixed3 },
            { key: "t", label: "t", format: fixed2 },
            { key: "p_value", label: "p", format: formatP },
            { key: "significant", label: "Significant" },
          ],
          rows: regressionRows(f1Model),
        }}
      >
        <BarChart
          categories={f1Model.coefficients.map((c) => c.name)}
          series={[{ name: "Standardised β", data: f1Model.coefficients.map((c) => c.beta) }]}
          yLabel="β"
        />
      </ChartCard>

      <ChartCard
        title={`Standardised OLS drivers — ${gateBModel.outcome}`}
        description={regression.note}
        source={SOURCE}
        table={{
          caption: `OLS coefficients for ${gateBModel.outcome} on z-scored instance features`,
          columns: [
            { key: "name", label: "Feature" },
            { key: "beta", label: "β (z-scored)", format: fixed3 },
            { key: "std_error", label: "SE", format: fixed3 },
            { key: "t", label: "t", format: fixed2 },
            { key: "p_value", label: "p", format: formatP },
            { key: "significant", label: "Significant" },
          ],
          rows: regressionRows(gateBModel),
        }}
      >
        <BarChart
          categories={gateBModel.coefficients.map((c) => c.name)}
          series={[
            { name: "Standardised β", data: gateBModel.coefficients.map((c) => c.beta) },
          ]}
          yLabel="β"
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-4">
        <h2 className="text-base font-semibold">
          Instance geometry is a weak predictor on its own
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          On {f1Model.n} E1 rows, the five z-scored instance-geometry features explain
          R² = {fixed3(f1Model.r_squared)} of {f1Model.outcome} ({pct1(f1Model.r_squared)}
          ) and R² = {fixed3(gateBModel.r_squared)} of {gateBModel.outcome} (
          {pct1(gateBModel.r_squared)}). Only <strong>{joinNames(f1SigNames)}</strong>{" "}
          reaches conventional significance (p &lt; 0.05) for {f1Model.outcome}, and only{" "}
          <strong>{joinNames(gateBSigNames)}</strong> for {gateBModel.outcome}; every
          other predictor in both models is statistically indistinguishable from no
          effect at this sample size. Reported as measured, not reframed as a stronger
          result.
        </p>
      </section>

      <ChartCard
        title="PCA — variance explained (E1 instance features)"
        description={principal_components.note}
        source={SOURCE}
        table={{
          caption: "Explained and cumulative variance by component",
          columns: [
            { key: "component", label: "Component" },
            { key: "ratio", label: "Explained variance", format: pct1 },
            { key: "cumulative", label: "Cumulative", format: pct1 },
          ],
          rows: pca.explained_variance_ratio.map((ratio, i) => ({
            component: `PC${i + 1}`,
            ratio,
            cumulative: cumulative[i],
          })),
        }}
      >
        <BarChart
          categories={pca.explained_variance_ratio.map((_, i) => `PC${i + 1}`)}
          series={[{ name: "Explained variance", data: pca.explained_variance_ratio }]}
          yLabel="share of variance"
          yMax={1}
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">The instance space is not low-dimensional</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          It takes <strong>{componentsNeeded} of the {pca.columns.length}</strong>{" "}
          components to reach 90% cumulative variance over the standardised
          instance-geometry features. A low-dimensional instance space would need only
          one or two; needing nearly all of them means these features carry largely
          independent information rather than a shared underlying factor.
        </p>
      </section>

      <ChartCard
        title="PC1 vs PC2 — E1 instances"
        description="Each point is one E1 instance projected onto the first two principal components."
        source={SOURCE}
        table={{
          caption: "PC1/PC2 loadings by feature",
          columns: [
            { key: "feature", label: "Feature" },
            { key: "pc1", label: "PC1 loading", format: fixed3 },
            { key: "pc2", label: "PC2 loading", format: fixed3 },
          ],
          rows: pca.columns.map((feature, j) => ({
            feature,
            pc1: pca.loadings[0][j],
            pc2: pca.loadings[1][j],
          })),
        }}
      >
        <ScatterChart
          xLabel="PC1"
          yLabel="PC2"
          series={[{ name: "E1 instances", points: pcaScores }]}
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--reference)]/40 bg-[var(--reference)]/10 p-4">
        <h2 className="text-base font-semibold">
          Exact partial dependence, not a modelled approximation
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{partial_dependence.note}</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Ranked by how much switching levels moves Gate B: {spreadPhrase(gateBSpreads)}.{" "}
          <strong>{gateBSpreads[0].factor}</strong> dominates;{" "}
          <strong>{gateBSpreads[gateBSpreads.length - 1].factor}</strong> barely moves it.
          The same ordering on base-pair F1: {spreadPhrase(f1Spreads)}.
        </p>
      </section>

      <ChartCard
        title="Partial dependence — gate_b"
        description="Marginal mean Gate B pass rate by design-factor level, from the E1 full factorial sweep."
        source={SOURCE}
        table={{
          caption: "Gate B partial dependence by factor level",
          columns: [
            { key: "factor", label: "Factor" },
            { key: "level", label: "Level" },
            { key: "mean", label: "Mean gate_b", format: fixed3 },
            { key: "n", label: "n" },
          ],
          rows: partial_dependence.gate_b,
        }}
      >
        <BarChart
          categories={partial_dependence.gate_b.map((r) => `${r.factor}: ${r.level}`)}
          series={[
            { name: "Mean gate_b", data: partial_dependence.gate_b.map((r) => r.mean) },
          ]}
          yLabel="mean gate_b"
          yMax={1}
        />
      </ChartCard>

      <ChartCard
        title="Partial dependence — base_pair_f1"
        description="Marginal mean base-pair F1 by design-factor level, from the same E1 sweep."
        source={SOURCE}
        table={{
          caption: "base_pair_f1 partial dependence by factor level",
          columns: [
            { key: "factor", label: "Factor" },
            { key: "level", label: "Level" },
            { key: "mean", label: "Mean base_pair_f1", format: fixed3 },
            { key: "n", label: "n" },
          ],
          rows: partial_dependence.base_pair_f1,
        }}
      >
        <BarChart
          categories={partial_dependence.base_pair_f1.map((r) => `${r.factor}: ${r.level}`)}
          series={[
            {
              name: "Mean base_pair_f1",
              data: partial_dependence.base_pair_f1.map((r) => r.mean),
            },
          ]}
          yLabel="mean base_pair_f1"
          yMax={1}
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--reference)]/40 bg-[var(--reference)]/10 p-4">
        <h2 className="text-base font-semibold">This parity plot is out-of-fold</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {random_forest.note} Across {rf.folds}-fold cross-validation on {rf.n} E3 runs,
          the model reaches R² = {fixed3(rf.r2)}, MAE = {fixed3(rf.mae)}, RMSE ={" "}
          {fixed3(rf.rmse)} on predictions no fold ever trained on. An in-sample fit
          would be near-perfect by construction and would say nothing about how well
          design factors alone predict base-pair F1 on unseen instances.
        </p>
      </section>

      <ChartCard
        title="Out-of-fold parity — base_pair_f1 from design factors"
        description={`Actual vs out-of-fold predicted ${rf.outcome}, from a random forest trained only on ${rf.features.join(", ")}.`}
        source={SOURCE}
        table={{
          caption: "Actual vs out-of-fold predicted base_pair_f1",
          columns: [
            { key: "actual", label: "Actual", format: fixed3 },
            { key: "predicted", label: "Predicted", format: fixed3 },
          ],
          rows: rf.actual.map((a, i) => ({ actual: a, predicted: rf.predicted[i] })),
        }}
      >
        <ScatterChart
          xLabel="actual base_pair_f1"
          yLabel="predicted base_pair_f1"
          series={[
            { name: "Out-of-fold predictions", points: parity, color: "#0ea5e9" },
            { name: "Perfect prediction (y = x)", points: diagonal, color: "#64748b" },
          ]}
        />
      </ChartCard>

      <ChartCard
        title="Learning curve — base_pair_f1 from design factors"
        description="Train vs out-of-fold test R² as training-set size grows, from the same random forest."
        source={SOURCE}
        table={{
          caption: "Train and test score by training-set size",
          columns: [
            { key: "train_size", label: "Train size" },
            { key: "train_score", label: "Train R²", format: fixed3 },
            { key: "test_score", label: "Test R²", format: fixed3 },
          ],
          rows: learningCurve,
        }}
      >
        <LineChart
          categories={learningCurve.map((p) => p.train_size)}
          series={[
            { name: "Train R²", data: learningCurve.map((p) => p.train_score) },
            { name: "Test R²", data: learningCurve.map((p) => p.test_score) },
          ]}
          xLabel="training-set size"
          yLabel="R²"
        />
      </ChartCard>

      {anyNegativeTestScore && (
        <section className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-4">
          <h2 className="text-base font-semibold">
            Test R² is unstable across training sizes
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            At a training size of {worstFold.train_size} rows the out-of-fold test R² is{" "}
            {fixed3(worstFold.test_score)} — worse than predicting the mean — even though
            train R² there is already {fixed3(worstFold.train_score)}. Test R² does not
            improve monotonically with training size in this range; the gap between the
            two curves across every row measured is the generalisation cost of relying on
            design factors alone rather than instance content.
          </p>
        </section>
      )}

      <ChartCard
        title="Feature importance — base_pair_f1 from design factors"
        description="Permutation importance, mean with one std across folds."
        source={SOURCE}
        table={{
          caption: "Permutation importance by feature",
          columns: [
            { key: "feature", label: "Feature" },
            { key: "importance", label: "Importance", format: fixed3 },
            { key: "std", label: "± std", format: fixed3 },
          ],
          rows: random_forest.importance,
        }}
      >
        <BarChart
          categories={random_forest.importance.map((r) => r.feature)}
          series={[
            {
              name: "Permutation importance",
              data: random_forest.importance.map((r) => r.importance),
            },
          ]}
          yLabel="importance"
        />
      </ChartCard>

      {weakest.length > 0 && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-base font-semibold">
            Some importances are not distinguishable from zero
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            For {joinNames(weakest.map((r) => r.feature))}, permutation importance is
            smaller than the fold-to-fold standard deviation —{" "}
            {weakest.length === 1 ? "this is" : "these are"} noise, not a real effect.
          </p>
        </section>
      )}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">Pareto frontiers</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{pareto.note}</p>
      </section>

      <ChartCard
        title="Encoding cost vs representability"
        description="Mean variable count against Gate A representability by encoding configuration."
        source={SOURCE}
        table={{
          caption: "Encoding configurations, cost and benefit",
          columns: [
            { key: "label", label: "Configuration" },
            { key: "cost", label: "Mean variables", format: fixed1 },
            { key: "benefit", label: "Representability", format: pct1 },
            { key: "on_frontier", label: "On frontier", format: yesNo },
          ],
          rows: pareto.encoding_variables_vs_representability,
        }}
      >
        <ScatterChart
          xLabel="mean variables (cost)"
          yLabel="representability (benefit)"
          series={paretoSeries(pareto.encoding_variables_vs_representability)}
        />
      </ChartCard>

      <ChartCard
        title="Solver runtime vs accuracy"
        description="Mean runtime against mean base-pair F1 by solver."
        source={SOURCE}
        table={{
          caption: "Solvers, cost and benefit",
          columns: [
            { key: "label", label: "Solver" },
            { key: "cost", label: "Mean runtime (s)", format: fixed3 },
            { key: "benefit", label: "Mean base-pair F1", format: fixed3 },
            { key: "on_frontier", label: "On frontier", format: yesNo },
          ],
          rows: pareto.solver_runtime_vs_accuracy,
        }}
      >
        <ScatterChart
          xLabel="mean runtime, s (cost)"
          yLabel="mean base-pair F1 (benefit)"
          series={paretoSeries(pareto.solver_runtime_vs_accuracy)}
        />
      </ChartCard>
    </div>
  );
}
