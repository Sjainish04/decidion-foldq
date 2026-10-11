"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/nav";
import { NAV_ICONS } from "@/lib/nav-icons";
import { useUi } from "@/stores/ui";

/** Jump-to-page palette. Results are ordinary links: arrow keys move focus
 *  between them and Enter follows the focused one, so it behaves the same with
 *  a keyboard, a pointer or a screen reader. Enter in the search field follows
 *  the first match. */
export function CommandPalette() {
  const { paletteOpen: open, setPaletteOpen: setOpen, togglePalette } = useUi();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        togglePalette();
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePalette, setOpen]);

  // Mounted only while open, so every open starts from a clean query and a
  // stale filter never hides pages.
  return open ? <PaletteDialog onClose={() => setOpen(false)} /> : null;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(
    () =>
      NAV_SECTIONS.flatMap((section) =>
        section.items.map((item) => ({ ...item, section: section.label })),
      ).filter((item) =>
        `${item.label} ${item.section}`.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [query],
  );

  const links = () => Array.from(listRef.current?.querySelectorAll("a") ?? []);

  const onInputKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      links()[0]?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      links()[0]?.click();
    }
  };

  const onListKey = (event: React.KeyboardEvent) => {
    const all = links();
    const index = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      all[Math.min(all.length - 1, index + 1)]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index <= 0) inputRef.current?.focus();
      else all[index - 1]?.focus();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#0a1628]/45 px-4 pt-[14vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4">
          <Search size={16} aria-hidden="true" className="text-[var(--text-secondary)]" />
          <input
            ref={inputRef}
            autoFocus
            aria-label="Search commands"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKey}
            placeholder="Jump to a page…"
            className="w-full bg-transparent py-3.5 text-base outline-none placeholder:text-[var(--text-secondary)]"
          />
          <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
            Esc
          </kbd>
        </div>
        <ul
          ref={listRef}
          aria-label="Pages"
          onKeyDown={onListKey}
          className="max-h-[50vh] overflow-y-auto p-2"
        >
          {items.map((item) => {
            const Icon = NAV_ICONS[item.href];
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none hover:bg-[var(--surface-elevated)] focus-visible:bg-[var(--surface-elevated)] focus-visible:outline-none"
                >
                  {Icon && (
                    <Icon size={16} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" />
                  )}
                  <span className="flex-1">{item.label}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{item.section}</span>
                  <ArrowRight
                    size={14}
                    aria-hidden="true"
                    className="text-[var(--text-secondary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                </Link>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
              No page matches &ldquo;{query}&rdquo;.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
