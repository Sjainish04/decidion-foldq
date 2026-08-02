import Link from "next/link";

export default function DesignTheoryPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Design theory</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Why the folding problem is posed as a QUBO at all, and what that choice
          costs. This page covers the formulation itself; measured outcomes live on{" "}
          <Link href="/analytics/scaling" className="text-[var(--accent-text)] underline">
            Scaling &amp; encoding
          </Link>{" "}
          and{" "}
          <Link
            href="/analytics/multivariate"
            className="text-[var(--accent-text)] underline"
          >
            Multivariate analysis
          </Link>
          .
        </p>
      </header>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">From candidate helices to a QUBO</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Candidate generation enumerates maximal helices — runs of stacked base pairs
          — for a sequence. Two candidates <em>conflict</em> when they cannot coexist
          in the same structure: they <strong>overlap</strong> (share a nucleotide) or{" "}
          <strong>cross</strong> (form a pseudoknot). Both relations are properties of
          a <em>pair</em> of candidates — never three or more at once — so the whole
          candidate set forms a conflict graph: one binary variable per helix, one
          weighted edge per conflicting pair.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-[var(--text-secondary)]">
          That pairwise structure is what makes a QUBO the right container. A QUBO&apos;s
          only degrees of freedom are a linear term per variable and a quadratic term
          per <em>pair</em> of variables — nothing higher-order. Overlap and crossing
          conflicts are penalized exactly as they naturally occur:
        </p>
        <pre className="mt-3 overflow-x-auto rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
          <code className="font-mono text-xs">{`lambda_overlap  * x_s * x_t    for helices sharing a nucleotide
lambda_crossing * x_s * x_t    for crossing (pseudoknotted) helix pairs`}</code>
        </pre>
        <p className="mt-3 max-w-3xl text-sm text-[var(--text-secondary)]">
          <code>lambda_crossing</code> is a single toggle. Setting it to zero is
          pseudoknot mode — see{" "}
          <Link
            href="/analytics/pseudoknots"
            className="text-[var(--accent-text)] underline"
          >
            Pseudoknots
          </Link>
          . Nothing else about the formulation changes, because the crossing penalty
          was never load-bearing for anything but excluding crossings.
        </p>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">Charge and refund</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Not every constraint is naturally pairwise. Whether a helix closes a hairpin
          loop depends on whether <em>any other selected helix</em> nests inside it —
          a k-body predicate over the whole selection, not a fact about one or two
          variables in isolation. A degree-2 model cannot represent that condition
          directly.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-[var(--text-secondary)]">
          The formulation resolves this in two layers instead of one:
        </p>
        <pre className="mt-3 overflow-x-auto rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
          <code className="font-mono text-xs">{`Layer 1 (linear)     E_s  = stacking(s) + hairpin_closure(s)
Layer 2 (quadratic)  E_st = -hairpin_closure(s) + interior_or_multiloop(s, t)`}</code>
        </pre>
        <p className="mt-3 max-w-3xl text-sm text-[var(--text-secondary)]">
          Layer 1 provisionally <strong>charges</strong> every candidate helix as if it
          closes a hairpin. Layer 2 <strong>refunds</strong> that charge for every
          helix <code>t</code> nestable directly inside <code>s</code>, and replaces it
          with the correct interior-loop or multiloop energy between them, taken from
          ViennaRNA&apos;s own Turner primitives rather than a reimplemented constant.
          The charge is a linear term; the refund is a quadratic term keyed on the
          pair <code>(s, t)</code> — so the k-body predicate never has to be
          represented directly. It is approximated by a linear guess plus a pairwise
          correction, and the model stays exactly degree-2. This is the trick that
          makes a QUBO viable for hairpin closure at all.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-[var(--text-secondary)]">
          The known error mode is stated, not hidden: when several helices nest inside
          one enclosing helix, the refund fires once per nested pair, so the hairpin
          charge can be over-refunded. That approximation is exactly what{" "}
          <Link href="/analytics/energy" className="text-[var(--accent-text)] underline">
            Energy &amp; attribution
          </Link>{" "}
          measures directly, as surrogate fidelity against ViennaRNA&apos;s Turner
          energies.
        </p>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">What the formulation trades away</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Every knob in this formulation trades a resource for a guarantee, and none
          of the trades are resolved by picking one winner — they are exposed as
          flags precisely so they can be measured rather than assumed.
        </p>
        <ul className="mt-2 max-w-3xl list-disc space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
          <li>
            <strong>Variables vs. representability.</strong> A shorter minimum stem
            length admits more candidate helices — including the lone base pairs some
            real structures need — at the cost of a larger QUBO. Gate A reports the
            representability ceiling this creates rather than hiding it behind a fixed
            default. Measured against sequence length and encoding choice on{" "}
            <Link
              href="/analytics/scaling"
              className="text-[var(--accent-text)] underline"
            >
              Scaling &amp; encoding
            </Link>
            .
          </li>
          <li>
            <strong>Runtime vs. accuracy.</strong> Denser conflict graphs are both
            harder to solve exactly and harder for a heuristic solver to search well.
            Which solver is worth its runtime, and how that trade shifts with problem
            size, is a question over several axes at once — see{" "}
            <Link
              href="/analytics/solver-performance"
              className="text-[var(--accent-text)] underline"
            >
              Solver performance
            </Link>{" "}
            for solver-by-solver results and{" "}
            <Link
              href="/analytics/multivariate"
              className="text-[var(--accent-text)] underline"
            >
              Multivariate analysis
            </Link>{" "}
            for the measured Pareto frontier across them, rather than one axis at a
            time.
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-4">
        <h2 className="text-base font-semibold">The penalty bound is not a proof</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Penalty scales for the overlap and crossing terms are calibrated by grid
          search and checked against exact solutions — brute-force or
          tree-decomposition ground truth, available only up to roughly 22 variables
          (Gate B, &ldquo;is the reference structure the QUBO&apos;s ground
          state&rdquo;). Inside that range, the calibration is verified: the
          reference structure is confirmed to be the QUBO&apos;s ground state under
          the chosen penalty scale.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-[var(--text-secondary)]">
          Above roughly 22 variables, exact ground truth is not available at all — not
          computed differently, <em>absent</em>. Gate B reports{" "}
          <strong>indeterminate</strong> rather than pass or fail, and the penalty
          calibration is unproven at those sizes, not merely untested. That limitation
          is stated plainly rather than glossed over: nothing on this site claims the
          penalty bound generalizes past the sizes it was actually checked against.
        </p>
      </section>
    </div>
  );
}
