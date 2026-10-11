"use client";

import Link from "next/link";
import { useId } from "react";

/** The FoldQ mark: a hairpin, two paired strands closed by a loop, drawn in the
 *  brand terracotta-to-cyan gradient. Decorative; the wordmark carries the name. */
export function LogoMark({ size = 30 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#c3512c" />
          <stop offset="1" stopColor="#3a7d95" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}-g)`} />
      <path
        d="M11 26 V13 a5 5 0 0 1 10 0 V26"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {[16, 20, 24].map((y) => (
        <line key={y} x1="11" x2="21" y1={y} y2={y} stroke="#fff" strokeOpacity="0.7" strokeWidth="1.6" />
      ))}
      <circle cx="16" cy="8" r="1.6" fill="#fff" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark />
      <span className="text-lg font-bold tracking-tight">
        Decidion <span className="text-[var(--accent-text)]">FoldQ</span>
      </span>
    </Link>
  );
}
