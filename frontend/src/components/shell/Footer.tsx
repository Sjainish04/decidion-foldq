import Link from "next/link";

/** Site footer.
 *
 *  Carries two distinct copyright statements that are both true at once, scoped to
 *  different things: the site content is © Decidion AI, all rights reserved, while
 *  the source code in the repository remains MIT-licensed. "All rights reserved" on
 *  its own would contradict the MIT licence actually shipped, so the licence
 *  statement is kept immediately alongside it rather than dropped: a reviewer
 *  needs to see both, not just the one project owners asked for by name.
 */
export function Footer() {
  return (
    <footer className="mt-12 border-t border-[var(--border)] bg-[var(--surface-elevated)]/40 px-4 py-8 text-xs text-[var(--text-secondary)] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Decidion <span className="text-[var(--accent-text)]">FoldQ</span>
            </p>
            <p>© 2026 Decidion AI. All rights reserved.</p>
            <p>
              Source code © 2026 Siddhartha Pahari and Jainish Solanki is{" "}
              <a
                href="https://github.com/Sjainish04/decidion-foldq/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-[var(--text-primary)]"
              >
                MIT licensed
              </a>
              .
            </p>
            <p>Decidion FoldQ · WISER Summer Program 2026 · Moderna Challenge</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/references" className="underline-offset-2 hover:text-[var(--text-primary)] hover:underline">
              References
            </Link>
            <a
              href="https://github.com/Sjainish04/decidion-foldq"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
            >
              Source
            </a>
            <a
              href="https://github.com/Sjainish04/decidion-foldq/tree/main/results/full"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
            >
              Result data
            </a>
          </nav>
        </div>
        <p className="mt-6 max-w-3xl border-t border-[var(--border)] pt-4">
          No quantum-advantage claim is made. ViennaRNA solves pseudoknot-free MFE
          folding exactly in cubic time; every figure on this site traces to committed
          experiment output or a live API response.
        </p>
      </div>
    </footer>
  );
}
