import { FileText } from "lucide-react";
import type { HeadlineStat as Stat, StatVisual } from "@/lib/charts/headline";

const REPO_BLOB = "https://github.com/Sjainish04/decidion-foldq/blob/main/";

/** The small picture under a headline number. Decorative to assistive
 *  technology: the number and caption already state the same value. */
function Visual({ visual, color }: { visual: StatVisual; color: string }) {
  if (visual.kind === "fraction") {
    const value = Math.max(0, Math.min(1, visual.value));
    return (
      <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true" className="shrink-0 -rotate-90">
        <circle cx="29" cy="29" r="23" fill="none" stroke="var(--border)" strokeWidth="7" opacity="0.7" />
        <circle
          cx="29"
          cy="29"
          r="23"
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${value} 1`}
          className="ring-sweep"
          style={{ ["--v" as string]: value }}
        />
      </svg>
    );
  }

  if (visual.kind === "range") {
    return (
      <div aria-hidden="true" className="mt-4">
        <div className="relative h-2.5 rounded-full bg-[var(--border)]/60">
          <div
            className="bar-grow absolute inset-y-0 rounded-full"
            style={{
              left: `${visual.low * 100}%`,
              width: `${Math.max(0.02, visual.high - visual.low) * 100}%`,
              background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})`,
            }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--text-secondary)]">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="mt-4 flex gap-1.5">
      {Array.from({ length: visual.total }, (_, index) => (
        <span
          key={index}
          className="bar-grow h-2.5 flex-1 rounded-full"
          style={{
            background: index < visual.filled ? color : "color-mix(in srgb, var(--border) 60%, transparent)",
            animationDelay: `${index * 80}ms`,
          }}
        />
      ))}
    </div>
  );
}

export function HeadlineStat({ stat, className }: { stat: Stat; className?: string }) {
  const color = `var(${stat.tone ?? "--quantum-inspired"})`;
  const ring = stat.visual?.kind === "fraction";
  return (
    <div className={`panel relative flex flex-col overflow-hidden p-5 ${className ?? ""}`}>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${color}, transparent 85%)` }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            {stat.label}
          </p>
          <p className="mt-2 text-[2.1rem] font-bold leading-none tabular-nums">{stat.value}</p>
        </div>
        {ring && stat.visual && <Visual visual={stat.visual} color={color} />}
      </div>
      {!ring && stat.visual && <Visual visual={stat.visual} color={color} />}
      <p className="mt-3 flex-1 text-sm leading-snug text-[var(--text-secondary)]">{stat.caption}</p>
      <a
        href={`${REPO_BLOB}${stat.source}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex max-w-full items-center gap-1.5 self-start rounded-full border border-[var(--border)] bg-[var(--surface-elevated)]/60 px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--quantum-inspired)] hover:text-[var(--text-primary)]"
      >
        <FileText size={12} aria-hidden="true" className="shrink-0" />
        <code className="truncate">{stat.source}</code>
      </a>
    </div>
  );
}
