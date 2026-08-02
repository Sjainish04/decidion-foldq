import Link from "next/link";

/** Site footer.
 *
 *  Deliberately NOT "all rights reserved": this project is MIT-licensed, and that
 *  phrase would assert the opposite of the licence actually shipped in the
 *  repository. Copyright notice and licence are stated separately, which is what
 *  MIT requires and what a reviewer needs to see.
 */
export function Footer() {
  return (
    <footer className="mt-10 border-t border-[var(--border)] px-6 py-6 text-xs text-[var(--text-secondary)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p>
            © 2026 Siddhartha Pahari and Jainish Solanki ·{" "}
            <a
              href="https://github.com/Sjainish04/decidion-foldq/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              MIT licensed
            </a>
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
