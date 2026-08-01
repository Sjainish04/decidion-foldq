import { BarChart } from "@/components/analytics/BarChart";
import { ChartCard } from "@/components/analytics/ChartCard";
import { GateLegend } from "@/components/analytics/GateLegend";
import { attributionBreakdown } from "@/lib/charts/transforms";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function EnergyPage() {
  const attribution = attributionBreakdown();

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
    </div>
  );
}
