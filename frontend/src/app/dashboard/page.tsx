import Link from "next/link";
import { HeadlineStat } from "@/components/analytics/HeadlineStat";
import { GateLegend } from "@/components/analytics/GateLegend";
import { headlineStats } from "@/lib/charts/headline";

const AREAS = [
  { href: "/analytics/solver-performance", label: "Solver performance", blurb: "Every solver on matched instances, with Gate C indeterminacy stated." },
  { href: "/analytics/energy", label: "Energy and attribution", blurb: "Charge-and-refund, and which stage is responsible when a run misses." },
  { href: "/analytics/scaling", label: "Scaling and encoding", blurb: "Variable counts at matched representability; the lone-pair ceiling." },
  { href: "/analytics/resources", label: "Quantum resources", blurb: "Circuit depth, gate counts, and the negative result stated plainly." },
  { href: "/analytics/pseudoknots", label: "Pseudoknots", blurb: "Where the formulation reaches structures DP cannot represent." },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Decidion FoldQ</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Explainable hybrid quantum–classical optimization for mRNA
          secondary-structure prediction. WISER Summer Program 2026 · Moderna Challenge.
          Siddhartha Pahari and Jainish Solanki.
        </p>
        <p className="mt-3 max-w-3xl rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
          ViennaRNA already solves pseudoknot-free MFE folding exactly in cubic time, so
          this project makes <strong>no quantum-advantage claim</strong>. Its contribution
          is a diagnostic method: attributing every result to the earliest stage that
          failed, and showing where a QUBO formulation reaches structures dynamic
          programming has no representation for.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-base font-semibold">Measured results</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {headlineStats().map((stat) => (
            <HeadlineStat key={stat.label} stat={stat} />
          ))}
        </div>
      </section>

      <GateLegend />

      <section>
        <h2 className="mb-2 text-base font-semibold">Analytics Lab</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {AREAS.map((area) => (
            <Link
              key={area.href}
              href={area.href}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--quantum-inspired)]"
            >
              <p className="text-sm font-medium">{area.label}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{area.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">Fold a sequence</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Run the full pipeline live and see all four gates. Requires the API to be
          running; the Analytics Lab above works without it.
        </p>
        <Link
          href="/foldq/new"
          className="mt-3 inline-block rounded bg-[var(--quantum-inspired)] px-4 py-2 text-sm font-medium text-white"
        >
          New analysis
        </Link>
      </section>
    </div>
  );
}
