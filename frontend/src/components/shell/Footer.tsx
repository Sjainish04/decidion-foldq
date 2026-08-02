import Link from "next/link";

/** Site footer.
 *
 *  Carries two distinct copyright statements that are both true at once, scoped to
 *  different things: the site content is © Decidion AI, all rights reserved, while
 *  the source code in the repository remains MIT-licensed. "All rights reserved" on
 *  its own would contradict the MIT licence actually shipped, so the licence
 *  statement is kept immediately alongside it rather than dropped — a reviewer
 *  needs to see both, not just the one project owners asked for by name.
 */
export function Footer() {
  return (
    <footer className="mt-10 border-t border-[var(--border)] px-6 py-6 text-xs text-[var(--text-secondary)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p>© 2026 Decidion AI. All rights reserved.</p>
          <p className="mt-1">
            Source code © 2026 Siddhartha Pahari and Jainish Solanki is{" "}
            <a
              href="https://github.com/Sjainish04/decidion-foldq/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              MIT licensed
            </a>
            .
          </p>
          <p className="mt-1">
            Decidion FoldQ · WISER Summer Program 2026 · Moderna Challenge
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/references" className="underline">
            References
          </Link>
          <a
            href="https://github.com/Sjainish04/decidion-foldq"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Source
          </a>
          <a
            href="https://github.com/Sjainish04/decidion-foldq/tree/main/results/full"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Result data
          </a>
        </nav>
      </div>
      <p className="mt-4 max-w-3xl">
        No quantum-advantage claim is made. ViennaRNA solves pseudoknot-free MFE
        folding exactly in cubic time; every figure on this site traces to committed
        experiment output or a live API response.
      </p>
    </footer>
  );
}
