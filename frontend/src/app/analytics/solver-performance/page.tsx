import { BarChart } from "@/components/analytics/BarChart";
import { ChartCard } from "@/components/analytics/ChartCard";
import { ScatterChart } from "@/components/analytics/ScatterChart";
import { SOLVER_COLORS, SOLVER_SYMBOLS } from "@/lib/charts/theme";
import { solverSummary } from "@/lib/charts/transforms";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const fixed3 = (value: number) => value.toFixed(3);

export default function SolverPerformancePage() {
  const rows = solverSummary();
  const indeterminate = rows.reduce((sum, r) => sum + (r.runs - r.determinateCount), 0);
  const totalRuns = rows.reduce((sum, r) => sum + r.runs, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Solver performance</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Every solver in the registry run across the same QUBO instances at a fixed
          seed. Gate C — did the solver reach the QUBO ground state — can only be
          decided where an exact reference exists;{" "}
          <strong>
            {indeterminate} of {totalRuns} runs are indeterminate
          </strong>{" "}
          because the instance exceeds the exact solver&apos;s variable ceiling. Those runs
          are excluded from the rate rather than counted as failures.
        </p>
      </header>

      <ChartCard
        title="Ground-state rate by solver"
        description="Fraction of determinate runs where the solver reached the QUBO ground state."
        source="results/full/e3_solvers.csv"
        table={{
          caption: "Solver ground-state rate, mean F1 and runtime",
          columns: [
            { key: "solver", label: "Solver" },
            { key: "runs", label: "Runs" },
            { key: "determinateCount", label: "Determinate" },
            { key: "groundStateRate", label: "Ground state", format: pct },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
            { key: "meanEnergyGap", label: "Mean gap (kcal/mol)", format: fixed3 },
            { key: "meanRuntimeSeconds", label: "Mean runtime (s)", format: fixed3 },
          ],
          rows: rows,
        }}
      >
        <BarChart
          categories={rows.map((r) => r.solver)}
          series={[{ name: "Ground-state rate", data: rows.map((r) => r.groundStateRate) }]}
          yLabel="rate"
          yMax={1}
        />
      </ChartCard>

      <ChartCard
        title="Accuracy against runtime"
        description="Mean base-pair F1 versus mean wall-clock runtime. Marker shape distinguishes solvers independently of colour."
        source="results/full/e3_solvers.csv"
        table={{
          caption: "Mean F1 and runtime by solver",
          columns: [
            { key: "solver", label: "Solver" },
            { key: "meanRuntimeSeconds", label: "Runtime (s)", format: fixed3 },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
          ],
          rows: rows,
        }}
      >
        <ScatterChart
          xLabel="mean runtime (s)"
          yLabel="mean base-pair F1"
          series={rows.map((r) => ({
            name: r.solver,
            points: [[r.meanRuntimeSeconds, r.meanF1]] as [number, number][],
            color: SOLVER_COLORS[r.solver],
            symbol: SOLVER_SYMBOLS[r.solver],
          }))}
        />
      </ChartCard>
    </div>
  );
}
