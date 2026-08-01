import { ThemeToggle } from "./ThemeToggle";

export function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
      <p className="text-sm text-[var(--text-secondary)]">
        WISER Summer Program 2026 · Moderna Challenge
      </p>
      <div className="flex items-center gap-3">
        <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
          ⌘K
        </kbd>
        <ThemeToggle />
      </div>
    </header>
  );
}
