"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ChevronRight, Menu, Search } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/nav";
import { useUi } from "@/stores/ui";
import { LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const REPO_URL = "https://github.com/Sjainish04/decidion-foldq";

// The platform never changes during a visit, so there is nothing to subscribe to.
const noSubscription = () => () => {};

/** Where the reader is, as section then page. Dynamic routes are named after
 *  the view they render, since a run id or PDB id means little out of context. */
function crumbs(pathname: string): string[] {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find((i) => i.href === pathname);
    if (item) return [section.label, item.label];
  }
  if (pathname.startsWith("/foldq/runs/")) return ["ML Workflow", "Run results"];
  if (pathname.startsWith("/reports/")) return ["ML Workflow", "Decision card"];
  if (pathname.startsWith("/structures/")) {
    return ["Analysis & Data", "PDB Structures", decodeURIComponent(pathname.split("/")[2] ?? "")];
  }
  return [];
}

function GithubMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const { setNavOpen, setPaletteOpen, navOpen } = useUi();
  const trail = crumbs(pathname ?? "");

  // The shortcut is the same key on every platform, but the modifier is named
  // differently. The server renders "Ctrl"; the client corrects it on Apple
  // platforms without a hydration mismatch.
  const modifier = useSyncExternalStore(
    noSubscription,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--border)] bg-[var(--glass)] px-4 backdrop-blur-md sm:px-6 lg:px-10">
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        aria-label="Open navigation"
        aria-expanded={navOpen}
        className="-ml-1 rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)] lg:hidden"
      >
        <Menu size={20} aria-hidden="true" />
      </button>
      <Link href="/" aria-label="Decidion FoldQ home" className="lg:hidden">
        <LogoMark size={28} />
      </Link>

      {trail.length > 0 && (
        <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
          <ol className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            {trail.map((crumb, index) => (
              <li key={`${crumb}-${index}`} className="flex min-w-0 items-center gap-1.5">
                {index > 0 && <ChevronRight size={14} aria-hidden="true" className="shrink-0 opacity-60" />}
                <span
                  aria-current={index === trail.length - 1 ? "page" : undefined}
                  className={
                    index === trail.length - 1
                      ? "truncate font-semibold text-[var(--text-primary)]"
                      : "truncate"
                  }
                >
                  {crumb}
                </span>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-3 pr-1.5 text-sm text-[var(--text-secondary)] shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--quantum-inspired)] hover:text-[var(--text-primary)]"
        >
          <Search size={15} aria-hidden="true" />
          <span className="hidden sm:inline">Search pages</span>
          <span className="sr-only sm:hidden">Search pages</span>
          <kbd className="hidden rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)] sm:inline">
            {modifier} K
          </kbd>
        </button>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Source code on GitHub"
          className="rounded-full border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text-secondary)] shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--quantum-inspired)] hover:text-[var(--text-primary)]"
        >
          <GithubMark />
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
