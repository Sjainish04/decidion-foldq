import { BarChart } from "@/components/analytics/BarChart";
import { ChartCard } from "@/components/analytics/ChartCard";
import { DataTable } from "@/components/analytics/DataTable";
import { LineChart } from "@/components/analytics/LineChart";
import {
  noiseComparison,
  objectiveComparison,
  qaoaByLength,
  qaoaByReps,
  qaoaByShots,
  qaoaGrid,
  solverSummary,
} from "@/lib/charts/transforms";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const fixed1 = (value: number) => value.toFixed(1);
const fixed3 = (value: number) => value.toFixed(3);

const SHOT_LEVELS = [256, 1024, 4096];

export default function ResourcesPage() {
  const qaoa = qaoaByReps();
  const shots = qaoaByShots();
  const grid = qaoaGrid();
  const objective = objectiveComparison();
  const byLength = qaoaByLength();
  const { noiseless, noisy } = noiseComparison();
  const classical = solverSummary();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Quantum resource accounting</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          QAOA <strong>does not beat classical heuristics</strong> on these instances.
          At the most favourable setting measured it reaches the QUBO ground state on
          two thirds of runs, while tabu, local search, simulated annealing and
          path-integral SQA reach it on every determinate run. Reporting that plainly,
          with the circuit cost that bought it, is the point of this page — and the{" "}
          <strong>sampling budget turns out to move the result further than circuit
          depth does</strong>, which the conventional depth-only table hides.
        </p>
      </header>

      <ChartCard
        title="Ground-state rate against circuit cost"
        description="Noiseless expectation objective, pooled across shot budgets, by QAOA repetition count. The shot budget is broken out separately below."
        source="results/full/e4_qaoa.csv"
        table={{
          caption: "QAOA resource and outcome by reps",
          columns: [
            { key: "reps", label: "reps" },
            { key: "meanQubits", label: "Logical qubits", format: fixed1 },
            { key: "meanCircuitDepth", label: "Circuit depth", format: fixed1 },
            { key: "meanTwoQubitGates", label: "Two-qubit gates", format: fixed1 },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
            { key: "groundStateRate", label: "Reached ground state", format: pct },
            { key: "circuits", label: "Circuits" },
          ],
          rows: qaoa as unknown as Record<string, unknown>[],
        }}
      >
        <BarChart
          categories={qaoa.map((r) => `reps=${r.reps}`)}
          series={[
            { name: "Two-qubit gates", data: qaoa.map((r) => r.meanTwoQubitGates) },
            { name: "Circuit depth", data: qaoa.map((r) => r.meanCircuitDepth) },
          ]}
          yLabel="count"
        />
      </ChartCard>

      <ChartCard
        title="The shot budget moves the result further than circuit depth"
        description="The same 81 noiseless circuits split by shot count rather than by reps."
        source="results/full/e4_qaoa.csv"
        table={{
          caption: "QAOA outcome by shot budget",
          columns: [
            { key: "shots", label: "Shots" },
            { key: "circuits", label: "Circuits" },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
            { key: "groundStateRate", label: "Reached ground state", format: pct },
          ],
          rows: shots as unknown as Record<string, unknown>[],
        }}
      >
        <BarChart
          categories={shots.map((r) => `${r.shots} shots`)}
          series={[
            { name: "Reached ground state", data: shots.map((r) => r.groundStateRate) },
          ]}
          yLabel="rate"
          yMax={1}
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">Depth does not compensate for a thin sample</h2>
        <p className="mb-3 mt-1 text-sm text-[var(--text-secondary)]">
          The full grid. The deepest circuit on the smallest budget —{" "}
          <code>reps=3</code> at 256 shots — reaches the ground state less often than
          the shallowest circuit on the largest budget. At these sizes the binding
          constraint was measurement, not circuit expressivity.
        </p>
        <DataTable
          caption="Ground-state rate by reps and shot count"
          columns={[
            { key: "reps", label: "reps" },
            ...SHOT_LEVELS.map((s) => ({
              key: `s${s}`,
              label: `${s} shots`,
              format: pct,
            })),
          ]}
          rows={[1, 2, 3].map((reps) => ({
            reps,
            ...Object.fromEntries(
              SHOT_LEVELS.map((s) => [
                `s${s}`,
                grid.find((c) => c.reps === reps && c.shots === s)?.groundStateRate ?? null,
              ]),
            ),
          }))}
        />
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">CVaR against the expectation objective</h2>
        <p className="mb-3 mt-1 text-sm text-[var(--text-secondary)]">
          CVaR was run at one configuration only —{" "}
          <strong>
            reps={objective.setting.reps}, {objective.setting.shots} shots, noiseless
          </strong>{" "}
          — so it is compared here against the expectation circuits at that same
          setting. At it the two are <strong>indistinguishable</strong>: identical
          ground-state rate on 9 circuits each. Comparing CVaR against expectation
          pooled over every shot budget would show a gap, but the gap would be the
          shot budget rather than the objective. No claim is made either way.
        </p>
        <DataTable
          caption="CVaR and expectation at the one matched configuration"
          columns={[
            { key: "objective", label: "Objective" },
            { key: "circuits", label: "Circuits" },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
            { key: "groundStateRate", label: "Reached ground state", format: pct },
          ]}
          rows={objective.arms as unknown as Record<string, unknown>[]}
        />
      </section>

      <ChartCard
        title="Ground-state rate against instance size"
        description="Noiseless expectation circuits grouped by sequence length."
        source="results/full/e4_qaoa.csv"
        table={{
          caption: "QAOA outcome by sequence length",
          columns: [
            { key: "length", label: "Length (nt)" },
            { key: "meanQubits", label: "Logical qubits", format: fixed1 },
            { key: "circuits", label: "Circuits" },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
            { key: "groundStateRate", label: "Reached ground state", format: pct },
          ],
          rows: byLength as unknown as Record<string, unknown>[],
        }}
      >
        <LineChart
          categories={byLength.map((r) => `${r.length} nt`)}
          series={[
            { name: "Reached ground state", data: byLength.map((r) => r.groundStateRate) },
          ]}
          xLabel="sequence length"
          yLabel="rate"
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">Cost of targeting a real device</h2>
        <p className="mb-3 mt-1 text-sm text-[var(--text-secondary)]">
          The same circuits transpiled onto <code>fake_hanoi</code> — local IBM
          calibration data, <strong>no live hardware and no queue</strong> — against an
          ideal simulator. Matched on reps, shots and objective, so the difference is
          routing, not shot noise. SWAP cost is folded into the two-qubit gate count
          rather than reported separately.
        </p>
        <DataTable
          caption="Ideal simulator versus fake_hanoi device target"
          columns={[
            { key: "backend", label: "Transpilation target" },
            { key: "circuits", label: "Circuits" },
            { key: "meanTranspiledDepth", label: "Transpiled depth", format: fixed1 },
            { key: "meanTwoQubitGates", label: "Two-qubit gates", format: fixed1 },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
            { key: "groundStateRate", label: "Reached ground state", format: pct },
          ]}
          rows={[noiseless, noisy] as unknown as Record<string, unknown>[]}
        />
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">What classical methods achieve here</h2>
        <p className="mb-3 mt-1 text-sm text-[var(--text-secondary)]">
          At sizes where an exact reference exists, these QUBO instances are easy.
          Simulated annealing reaches the optimum on every determinate run in a fraction
          of a second. There is no room for an advantage claim in a regime classical
          methods already own — which is itself a finding about where quantum
          optimization should be pointed.
        </p>
        <DataTable
          caption="Classical and quantum-inspired solver outcomes"
          columns={[
            { key: "solver", label: "Solver" },
            { key: "determinateCount", label: "Determinate runs" },
            { key: "groundStateRate", label: "Reached ground state", format: pct },
            { key: "meanRuntimeSeconds", label: "Mean runtime (s)", format: fixed3 },
          ]}
          rows={classical as unknown as Record<string, unknown>[]}
        />
      </section>
    </div>
  );
}
