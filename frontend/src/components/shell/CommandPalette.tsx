"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NAV_SECTIONS } from "@/lib/nav";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!open) return null;

  const items = NAV_SECTIONS.flatMap((s) => s.items).filter((i) =>
    i.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-32"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          aria-label="Search commands"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Jump to…"
          className="w-full rounded bg-[var(--surface-elevated)] px-3 py-2 text-sm outline-none"
        />
        <ul className="mt-2 max-h-64 overflow-y-auto">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-elevated)]"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
