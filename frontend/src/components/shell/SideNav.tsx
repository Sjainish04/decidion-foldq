"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/nav";
import { NAV_ICONS } from "@/lib/nav-icons";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { Logo } from "./Logo";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex-1">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="mb-6">
          <p className="mb-1.5 px-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href;
              const Icon = NAV_ICONS[item.href];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-[var(--surface)] font-semibold text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface)]/70 hover:text-[var(--text-primary)]",
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-[var(--quantum-inspired)] to-[var(--classical)]"
                      />
                    )}
                    {Icon && (
                      <Icon
                        aria-hidden="true"
                        size={16}
                        strokeWidth={1.9}
                        className={cn(
                          "shrink-0",
                          active ? "text-[var(--accent-text)]" : "opacity-80 group-hover:opacity-100",
                        )}
                      />
                    )}
                    <span className="flex-1">{item.label}</span>
                    {item.badge === "demo" && (
                      <span className="rounded bg-[var(--warning)]/20 px-1 text-[10px] text-[var(--warning)]">
                        demo
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 p-3 text-xs text-[var(--text-secondary)]">
      <p className="font-semibold text-[var(--text-primary)]">WISER 2026 · Moderna Challenge</p>
      <p className="mt-1">No quantum-advantage claim. Every figure traces to committed output.</p>
    </div>
  );
}

/** Desktop: a sticky rail that scrolls on its own. Below `lg` the rail is
 *  hidden and the same links open in a drawer from the top bar's menu button. */
export function SideNav() {
  const { navOpen, setNavOpen } = useUi();
  const pathname = usePathname();
  const closeButton = useRef<HTMLButtonElement>(null);

  // A route change from inside the drawer should land on the new page, not on
  // a drawer still covering it.
  useEffect(() => setNavOpen(false), [pathname, setNavOpen]);

  useEffect(() => {
    if (!navOpen) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen, setNavOpen]);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--surface-elevated)]/40 px-3 py-5 backdrop-blur-sm lg:flex">
        <Logo className="mb-7 px-2" />
        <NavLinks />
        <SidebarFooter />
      </aside>

      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div
            className="absolute inset-0 bg-[#0a1628]/50 backdrop-blur-sm"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--background)] px-3 py-4 shadow-[var(--shadow-lg)]">
            <div className="mb-6 flex items-center justify-between px-2">
              <Logo />
              <button
                ref={closeButton}
                type="button"
                onClick={() => setNavOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <NavLinks onNavigate={() => setNavOpen(false)} />
            <SidebarFooter />
          </div>
        </div>
      )}
    </>
  );
}
