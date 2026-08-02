"use client";

import { useState } from "react";
import { ROLES, byRole, library } from "@/lib/references";

export default function ReferencesPage() {
  const [role, setRole] = useState<string | null>(null);
  const rows = byRole(role);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Reference library</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          {library.total} works · {library.crossref_verified} Crossref-verified
        </p>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
          Every DOI below was resolved against the Crossref API and then fetched back
          to confirm it exists — checked on {library.verified_on} by{" "}
          <code>scripts/verify_references.py</code>, which is re-runnable with{" "}
          <code>--check</code> to fail if any of them stops resolving. Works Crossref
          does not index — preprints, documentation, software — are marked{" "}
          <strong>no DOI</strong> rather than given a plausible-looking one.
        </p>
      </header>

      <div role="group" aria-label="Filter by role" className="flex flex-wrap gap-2">
        <button
          aria-pressed={role === null}
          onClick={() => setRole(null)}
          className={
            role === null
              ? "rounded border border-[var(--accent-text)] bg-[var(--accent-text)]/15 px-3 py-1.5 text-sm"
              : "rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
          }
        >
          All ({library.total})
        </button>
        {ROLES.map((r) => (
          <button
            key={r}
            aria-pressed={role === r}
            onClick={() => setRole(role === r ? null : r)}
            className={
              role === r
                ? "rounded border border-[var(--accent-text)] bg-[var(--accent-text)]/15 px-3 py-1.5 text-sm"
                : "rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
            }
          >
            {r}
          </button>
        ))}
      </div>

      <ol className="space-y-3">
        {rows.map((reference) => (
          <li
            key={reference.key}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{reference.title}</p>
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={{
                  color: reference.crossref_verified
                    ? "var(--reference)"
                    : "var(--text-secondary)",
                }}
              >
                {reference.crossref_verified ? "Crossref-verified" : "no DOI"}
              </span>
            </div>

            {reference.authors.length > 0 && (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {reference.authors.join(", ")}
                {reference.year ? ` (${reference.year})` : ""}
                {reference.container ? ` · ${reference.container}` : ""}
              </p>
            )}

            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              <span className="text-[var(--text-primary)]">Cited as:</span> {reference.role}
              {reference.note ? ` — ${reference.note}` : ""}
            </p>

            {reference.url && (
              <a
                href={reference.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block font-mono text-xs text-[var(--accent-text)] underline"
              >
                {reference.doi ?? reference.url} ↗
              </a>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
