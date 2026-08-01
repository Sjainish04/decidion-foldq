import { BarChart } from "@/components/analytics/BarChart";
import { ChartCard } from "@/components/analytics/ChartCard";
import { LineChart } from "@/components/analytics/LineChart";
import { encodingSummary, scalingByLength } from "@/lib/charts/transforms";

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
const fixed1 = (value: number) => value.toFixed(1);
const fixed3 = (value: number) => value.toFixed(3);

export default function ScalingPage() {
  const encodings = encodingSummary();
  const scaling = scalingByLength();
  const label = (row: (typeof encodings)[number]) =>
    row.encoding === "pair"
      ? "pair"
      : `stem ${row.stemMode} msl=${row.minStemLength}`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Scaling and encoding</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Variable count is what a quantum device would have to hold, so the encoding
          choice is a resource decision. The comparison only means something at{" "}
          <strong>matched representability</strong> — an encoding that drops structures is
          smaller for a reason that costs accuracy.
        </p>
      </header>

      <ChartCard
        title="Variables by encoding"
        description="Mean variable count and Gate A representability for every encoding configuration measured."
        source="results/full/e2_encoding.csv"
        table={{
          caption: "Encoding variable counts and representability",
          columns: [
            { key: "label", label: "Encoding" },
            { key: "meanVariables", label: "Mean variables", format: fixed1 },
            { key: "meanQuadraticTerms", label: "Quadratic terms", format: fixed1 },
            { key: "meanDensity", label: "Density", format: fixed3 },
            { key: "gateARate", label: "Gate A", format: pct },
            { key: "instances", label: "Instances" },
          ],
          rows: encodings.map((row) => ({ ...row, label: label(row) })),
        }}
      >
        <BarChart
          categories={encodings.map(label)}
          series={[
            { name: "Mean variables", data: encodings.map((r) => r.meanVariables) },
          ]}
          yLabel="variables"
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">The representability ceiling</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Every instance that fails Gate A at <code>min_stem_length=2</code> is rescued at{" "}
          <code>min_stem_length=1</code>. The ceiling has exactly one cause —{" "}
          <strong>lone base pairs</strong>, helices of a single pair that a minimum-length
          filter excludes. Perfect representability is reachable, and the price is the
          variable count in the chart above.
        </p>
      </section>

      <ChartCard
        title="Variables against sequence length"
        description="How the stem-indexed problem grows with input size."
        source="results/full/e1_formulation.csv"
        table={{
          caption: "Mean variables and density by sequence length",
          columns: [
            { key: "length", label: "Length (nt)" },
            { key: "meanVariables", label: "Mean variables", format: fixed1 },
            { key: "meanDensity", label: "Mean density", format: fixed3 },
            { key: "instances", label: "Instances" },
          ],
          rows: scaling as unknown as Record<string, unknown>[],
        }}
      >
        <LineChart
          categories={scaling.map((r) => r.length)}
          series={[{ name: "Mean variables", data: scaling.map((r) => r.meanVariables) }]}
          xLabel="sequence length (nt)"
          yLabel="variables"
        />
      </ChartCard>
    </div>
  );
}
