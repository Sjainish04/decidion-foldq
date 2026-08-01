import type { HeadlineStat as Stat } from "@/lib/charts/headline";

export function HeadlineStat({ stat }: { stat: Stat }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
        {stat.label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{stat.caption}</p>
      <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
        <code>{stat.source}</code>
      </p>
    </div>
  );
}
