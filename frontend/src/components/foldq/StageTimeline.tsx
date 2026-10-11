import type { FoldResponse } from "@/lib/api/schemas";

/** One hue per pipeline stage, from the shared palette tokens. */
const STAGE_COLORS = [
  "var(--classical)",
  "var(--quantum-inspired)",
  "var(--quantum)",
  "var(--reference)",
  "var(--rna-u)",
  "var(--rna-c)",
  "var(--text-secondary)",
];

/** The pipeline runs as one synchronous call and does not instrument itself. These
 *  shares are a proportional breakdown of the measured total, and are labelled as
 *  approximate rather than presented as measured per-stage timings. */
export function StageTimeline({ result }: { result: FoldResponse }) {
  const total = result.stages.reduce((sum, stage) => sum + stage.seconds, 0) || 1;
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="section-title">Pipeline stages</h2>
      <p className="mb-4 mt-1 text-xs text-[var(--text-secondary)]">
        Total {result.runtime_seconds.toFixed(3)} s. The per-stage split is an{" "}
        <strong>approximate</strong> breakdown of one synchronous call, not individually
        instrumented timings.
      </p>

      {/* The whole run as one bar, each stage a segment of it. */}
      <div
        aria-hidden="true"
        className="bar-grow flex h-4 w-full overflow-hidden rounded-full bg-[var(--surface-elevated)]"
      >
        {result.stages.map((stage, index) => (
          <span
            key={stage.name}
            className="h-full border-r-2 border-[var(--surface)] last:border-r-0"
            style={{
              width: `${(stage.seconds / total) * 100}%`,
              minWidth: 3,
              background: STAGE_COLORS[index % STAGE_COLORS.length],
            }}
          />
        ))}
      </div>

      <ol className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {result.stages.map((stage, index) => (
          <li key={stage.name} className="flex items-center gap-3 text-xs">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: STAGE_COLORS[index % STAGE_COLORS.length] }}
            />
            <span className="w-24 shrink-0 capitalize">{stage.name}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
              <span
                className="bar-grow block h-full rounded-full"
                style={{
                  width: `${(stage.seconds / total) * 100}%`,
                  minWidth: 2,
                  background: STAGE_COLORS[index % STAGE_COLORS.length],
                }}
              />
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums text-[var(--text-secondary)]">
              {stage.seconds.toFixed(4)} s
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
