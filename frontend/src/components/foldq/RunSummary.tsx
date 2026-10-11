import type { FoldResponse } from "@/lib/api/schemas";

export function RunSummary({ result }: { result: FoldResponse }) {
  const stats: [string, string][] = [
    ["Solver", result.solver],
    ["Seed", `seed ${result.seed}`],
    ["Length", `${result.sequence.length} nt`],
    ["Variables", String(result.problem.num_variables)],
    ["Quadratic terms", String(result.problem.num_quadratic_terms)],
    ["QUBO density", result.problem.density.toFixed(3)],
    ["Overlap penalty", result.problem.overlap_penalty.toFixed(2)],
    [
      "Crossing pairs",
      result.problem.forbid_crossing ? "forbidden" : "allowed (pseudoknot mode)",
    ],
  ];

  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="section-title">Run</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5"
          >
            <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        Run <code>{result.run_id}</code> is a content hash of the sequence, solver, seed
        and pseudoknot setting, so the same inputs always reproduce it.
      </p>
    </section>
  );
}
