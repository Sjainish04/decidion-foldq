"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="w-60 shrink-0 border-r border-[var(--border)] p-4">
      <Link href="/" className="mb-6 block text-lg font-semibold">
        Decidion <span className="text-[var(--accent-text)]">FoldQ</span>
      </Link>
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="mb-5">
          <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            {section.label}
          </p>
          <ul>
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between rounded px-2 py-1.5 text-sm",
                      active
                        ? "bg-[var(--surface-elevated)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {item.label}
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
