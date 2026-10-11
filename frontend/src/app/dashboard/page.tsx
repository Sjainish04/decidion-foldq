import Link from "next/link";
import { ArrowRight, ArrowUpRight, ShieldCheck } from "lucide-react";
import { HeadlineStat } from "@/components/analytics/HeadlineStat";
import { GateLegend } from "@/components/analytics/GateLegend";
import { HeroFigure } from "@/components/rna/HeroFigure";
import { headlineStats } from "@/lib/charts/headline";
import { NAV_ICONS } from "@/lib/nav-icons";

const AREAS = [
  { href: "/analytics/solver-performance", label: "Solver performance", blurb: "Every solver on matched instances, with Gate C indeterminacy stated.", tone: "--classical" },
  { href: "/analytics/energy", label: "Energy and attribution", blurb: "Charge-and-refund, and which stage is responsible when a run misses.", tone: "--reference" },
  { href: "/analytics/scaling", label: "Scaling and encoding", blurb: "Variable counts at matched representability; the lone-pair ceiling.", tone: "--quantum-inspired" },
  { href: "/analytics/resources", label: "Quantum resources", blurb: "Circuit depth, gate counts, and the negative result stated plainly.", tone: "--quantum" },
  { href: "/analytics/pseudoknots", label: "Pseudoknots", blurb: "Where the formulation reaches structures DP cannot represent.", tone: "--danger" },
  { href: "/analytics/multivariate", label: "Multivariate analysis", blurb: "Correlations, regression drivers, PCA and the Pareto frontier.", tone: "--classical" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-10">
      <header className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <p className="eyebrow">WISER Summer Program 2026 · Moderna Challenge</p>
          <h1 className="mt-3 text-[clamp(2.6rem,1.6rem+3.6vw,4.2rem)] font-bold leading-[1.02] tracking-tight">
            Decidion <span className="text-[var(--accent-text)]">FoldQ</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--text-secondary)]">
            Explainable hybrid quantum–classical optimization for mRNA
            secondary-structure prediction.
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Siddhartha Pahari and Jainish Solanki.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/foldq/new" className="btn btn-primary">
              Fold a sequence <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/analytics/solver-performance" className="btn btn-secondary">
              Explore the results
            </Link>
          </div>

          <div className="mt-7 flex max-w-xl gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
            <ShieldCheck size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--reference)]" />
            <p className="text-sm leading-relaxed">
              ViennaRNA already solves pseudoknot-free MFE folding exactly in cubic time, so
              this project makes <strong>no quantum-advantage claim</strong>. Its contribution
              is a diagnostic method: attributing every result to the earliest stage that
              failed, and showing where a QUBO formulation reaches structures dynamic
              programming has no representation for.
            </p>
          </div>
        </div>

        <div className="panel relative overflow-hidden p-4 sm:p-5">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--glow-cool)] blur-3xl"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[var(--glow-warm)] blur-3xl"
          />
          <HeroFigure />
        </div>
      </header>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow">From committed output</p>
            <h2 className="section-title mt-1 text-xl">Measured results</h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Each figure links to the CSV it is computed from.
          </p>
        </div>
        {/* Six columns so five cards fill two full rows: three, then two wider. */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {headlineStats().map((stat, index) => (
            <HeadlineStat
              key={stat.label}
              stat={stat}
              className={index < 3 ? "xl:col-span-2" : "xl:col-span-3"}
            />
          ))}
        </div>
      </section>

      <GateLegend />

      <section>
        <p className="eyebrow">Analytics Lab</p>
        <h2 className="section-title mt-1 mb-4 text-xl">Explore the analysis</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {AREAS.map((area) => {
            const Icon = NAV_ICONS[area.href];
            return (
              <Link key={area.href} href={area.href} className="panel panel-link group flex gap-4 p-5">
                {Icon && (
                  <span
                    aria-hidden="true"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                    style={{
                      background: `color-mix(in srgb, var(${area.tone}) 14%, transparent)`,
                      color: `var(${area.tone})`,
                    }}
                  >
                    <Icon size={20} strokeWidth={1.9} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                    {area.label}
                    <ArrowUpRight
                      size={15}
                      aria-hidden="true"
                      className="text-[var(--text-secondary)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    />
                  </span>
                  <span className="mt-1 block text-sm text-[var(--text-secondary)]">{area.blurb}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0a1628] via-[#0f2540] to-[#16304f] p-6 text-[#faf7f2] shadow-[var(--shadow-lg)] sm:p-8">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-24 h-72 w-72 rounded-full bg-[#d97757]/30 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[#7bb8c9]/20 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold">Fold a sequence</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#c9d1dd]">
              Run the full pipeline live and see all four gates. Requires the API to be
              running; the Analytics Lab above works without it.
            </p>
          </div>
          <Link href="/foldq/new" className="btn btn-primary">
            New analysis <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
