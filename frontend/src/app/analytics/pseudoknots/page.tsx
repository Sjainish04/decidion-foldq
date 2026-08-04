import Link from "next/link";
import { ChartCard } from "@/components/analytics/ChartCard";
import { BarChart } from "@/components/analytics/BarChart";
import { CHART_COLORS } from "@/lib/charts/theme";
import { pseudoknotComparison } from "@/lib/charts/transforms";

const fixed3 = (value: number) => value.toFixed(3);

export default function PseudoknotsPage() {
  const rows = pseudoknotComparison();
  const knotted = rows.filter((r) => r.hasPseudoknot);
  const controls = rows.filter((r) => !r.hasPseudoknot);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Pseudoknots</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Disabling the crossing penalty — one term in the QUBO — reaches structures
          dynamic programming has no representation for. Single-bracket dot-bracket
          notation <strong>cannot express a crossing</strong>, so ViennaRNA does not
          score poorly on these fixtures; it structurally cannot return the answer.
        </p>
      </header>

      <ChartCard
        title="Base-pair F1 on pseudoknotted fixtures"
        description="ViennaRNA, FoldQ with the crossing penalty enforced, and FoldQ with it disabled."
        source="results/full/e5_pseudoknot.csv"
        table={{
          caption: "Pseudoknot fixture results",
          columns: [
            { key: "sequenceId", label: "Fixture" },
            { key: "length", label: "Length (nt)" },
            { key: "crossingPairsInReference", label: "Crossing pairs" },
            { key: "viennaF1", label: "ViennaRNA F1", format: fixed3 },
            { key: "strictF1", label: "FoldQ strict F1", format: fixed3 },
            { key: "pseudoknotModeF1", label: "Pseudoknot mode F1", format: fixed3 },
          ],
          rows: knotted,
        }}
      >
        <BarChart
          categories={knotted.map((r) => r.sequenceId)}
          series={[
            { name: "ViennaRNA", data: knotted.map((r) => r.viennaF1), color: CHART_COLORS.reference },
            { name: "FoldQ strict", data: knotted.map((r) => r.strictF1), color: CHART_COLORS.cool },
            {
              name: "FoldQ pseudoknot mode",
              data: knotted.map((r) => r.pseudoknotModeF1),
              color: CHART_COLORS.emphasis,
            },
          ]}
          yLabel="base-pair F1"
          yMax={1}
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-4">
        <h2 className="text-base font-semibold">Fixture provenance</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Stated plainly rather than left for a reader to discover. The provenance below
          is rendered from the <code>source</code> column of the committed CSV.
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {knotted.map((row) => (
            <li key={row.sequenceId}>
              <code>{row.sequenceId}</code> — {row.source}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          The mechanism is demonstrated; substituting cited literature pseudoknots is the
          next step and is listed in the project&apos;s future work.
        </p>
      </section>

      <ChartCard
        title="Controls"
        description="Pseudoknot-free structures run through the same path, including where the method degrades."
        source="results/full/e5_pseudoknot.csv"
        headingLevel={2}
        table={{
          caption: "Control fixture results",
          columns: [
            { key: "sequenceId", label: "Fixture" },
            { key: "length", label: "Length (nt)" },
            { key: "viennaF1", label: "ViennaRNA F1", format: fixed3 },
            { key: "strictF1", label: "FoldQ F1", format: fixed3 },
            { key: "source", label: "Provenance" },
          ],
          rows: controls,
        }}
      >
        <BarChart
          categories={controls.map((r) => r.sequenceId)}
          series={[
            { name: "ViennaRNA", data: controls.map((r) => r.viennaF1), color: CHART_COLORS.reference },
            { name: "FoldQ", data: controls.map((r) => r.strictF1), color: CHART_COLORS.cool },
          ]}
          yLabel="base-pair F1"
          yMax={1}
        />
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          The tRNA-Phe control is the hardest case measured here, and its structure is
          experimentally determined:{" "}
          <Link href="/structures/1EHZ" className="text-[var(--accent-text)] underline">
            PDB 1EHZ
          </Link>{" "}
          (X-ray, 1.93 Å). Its 76 nt give 229 variables, and the cloverleaf&apos;s multiloop
          junction is precisely the k-body structure a degree-2 QUBO approximates worst.
        </p>
      </ChartCard>
    </div>
  );
}
