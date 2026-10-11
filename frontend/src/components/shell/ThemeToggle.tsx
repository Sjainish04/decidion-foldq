"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/** Key under which the reader's choice is remembered. The inline script in the
 *  root layout reads the same key before first paint, so a reload in dark mode
 *  does not flash light first. */
export const THEME_STORAGE_KEY = "foldq-theme";

// The `dark` class on <html> is the single source of truth; the button reads it
// as an external store rather than keeping a copy that could drift from it.
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const isDark = () => document.documentElement.classList.contains("dark");
const serverSnapshot = () => false;

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, serverSnapshot);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Storage can be unavailable (private windows, blocked site data). The
      // toggle still works for this page view; it just is not remembered.
    }
  };

  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="rounded-full border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text-secondary)] shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--quantum-inspired)] hover:text-[var(--text-primary)]"
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}
