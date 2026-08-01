import type { FoldResponse } from "@/lib/api/schemas";

/** The pipeline runs as one synchronous call and does not instrument itself. These
 *  shares are a proportional breakdown of the measured total, and are labelled as
 *  approximate rather than presented as measured per-stage timings. */
export function StageTimeline({ result }: { result: FoldResponse }) {
  const total = result.stages.reduce((sum, stage) => sum + stage.seconds, 0) || 1;
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-base font-semibold">Pipeline stages</h2>
      <p className="mb-3 mt-1 text-xs text-[var(--text-secondary)]">
        Total {result.runtime_seconds.toFixed(3)} s. The per-stage split is an{" "}
        <strong>approximate</strong> breakdown of one synchronous call, not individually
        instrumented timings.
      </p>
      <ol className="space-y-1.5">
        {result.stages.map((stage) => (
          <li key={stage.name} className="flex items-center gap-3 text-xs">
            <span className="w-20 shrink-0 capitalize">{stage.name}</span>
            <span
              className="h-2 rounded bg-[var(--quantum-inspired)]"
              style={{ width: `${(stage.seconds / total) * 100}%`, minWidth: 2 }}
            />
            <span className="tabular-nums text-[var(--text-secondary)]">
              {stage.seconds.toFixed(4)} s
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
