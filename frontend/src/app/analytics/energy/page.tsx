import { BarChart } from "@/components/analytics/BarChart";
import { ChartCard } from "@/components/analytics/ChartCard";
import { GateLegend } from "@/components/analytics/GateLegend";
import { DataTable } from "@/components/analytics/DataTable";
import { attributionBreakdown, surrogateFidelity } from "@/lib/charts/transforms";
import { formatInterval, wilsonCi } from "@/lib/charts/uncertainty";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function EnergyPage() {
  const attribution = attributionBreakdown();
  const fidelity = surrogateFidelity();
  const top1 = wilsonCi(fidelity.top1Successes, fidelity.sequences);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Energy model and attribution</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Energy coefficients come from ViennaRNA&apos;s Turner primitives — never
          reimplemented constants. Hairpin closure is charged in the linear term and
          refunded in the quadratic term when a helix nests inside, which is how a
          k-body predicate fits a degree-2 model.
        </p>
      </header>

      <GateLegend />

      <ChartCard
        title="Attribution across formulation runs"
        description="Which stage is responsible when a run does not recover the reference structure."
        source="results/full/e1_formulation.csv"
        table={{
          caption: "Attribution category counts",
          columns: [
            { key: "category", label: "Attribution category" },
            { key: "count", label: "Runs" },
            { key: "fraction", label: "Share", format: pct },
          ],
          rows: attribution,
        }}
      >
        <BarChart
          categories={attribution.map((a) => a.category)}
          series={[{ name: "Runs", data: attribution.map((a) => a.count) }]}
          yLabel="runs"
        />
      </ChartCard>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">
          Does the surrogate rank candidates correctly within a sequence?
        </h2>
        <p className="mb-3 mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          A correlation pooled across sequences of different lengths is partly
          measuring length: longer RNAs have more stems and more negative energies.
          The optimizer never chooses between sequences — it chooses among candidates
          for one RNA — so this measures agreement <strong>within</strong> each
          sequence, over {fidelity.sequences} candidate ensembles.{" "}
          {fidelity.degenerate} further sequences produced ensembles too small or too
          flat to rank and are excluded rather than counted as agreement.
        </p>
        <DataTable
          caption="Within-sequence agreement between the QUBO surrogate and ViennaRNA"
          columns={[
            { key: "measure", label: "Measure" },
            { key: "value", label: "Result" },
          ]}
          rows={[
            { measure: "Median within-sequence Spearman", value: fidelity.medianSpearman.toFixed(3) },
            { measure: "Median Kendall tau", value: fidelity.medianKendall.toFixed(3) },
            {
              measure: "QUBO's pick is the best candidate",
              value: `${fidelity.top1Successes}/${fidelity.sequences} = ${(top1.estimate * 100).toFixed(1)}% ${formatInterval(top1)}`,
            },
            { measure: "Median regret", value: `${fidelity.medianRegret.toFixed(2)} kcal/mol` },
            { measure: "Mean regret", value: `${fidelity.meanRegret.toFixed(3)} kcal/mol` },
            {
              measure: "Within 0.5 / 1 / 2 kcal/mol of the ensemble best",
              value: `${(fidelity.withinHalf * 100).toFixed(0)}% / ${(fidelity.withinOne * 100).toFixed(0)}% / ${(fidelity.withinTwo * 100).toFixed(0)}%`,
            },
          ]}
        />
        <p className="mt-3 max-w-3xl text-xs text-[var(--text-secondary)]">
          <strong>Regret</strong> is the most directly interpretable: how much worse
          ViennaRNA scores the candidate the QUBO chose than the best candidate in the
          same ensemble. It isolates ranking error from candidate coverage, which Gate A
          measures separately.
        </p>
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          Source: <code>results/full/e6_surrogate.csv</code>
        </p>
      </section>

    </div>
  );
}