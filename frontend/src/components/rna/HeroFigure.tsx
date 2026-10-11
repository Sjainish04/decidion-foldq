"use client";

import { useState } from "react";
import { StructureView } from "@/components/rna/StructureView";
import { fixture, pairsFromBrackets } from "@/lib/rna/fixtures";

/** Two of the curated benchmark molecules, drawn from their reference
 *  structures: a real tRNA, and the constructed pseudoknot that shows what the
 *  QUBO can represent and dynamic programming cannot. */
const VIEWS = [
  {
    id: "trna_phe_yeast_acceptor",
    tab: "tRNA-Phe",
    title: "Yeast tRNA-Phe cloverleaf",
    layout: "circular" as const,
    note: "Reference structure from PDB 1EHZ (X-ray, 1.93 Å). Each arc is a base pair; the four arc bundles are the cloverleaf's four stems.",
  },
  {
    id: "pk_htype_constructed_28",
    tab: "H-type pseudoknot",
    title: "H-type pseudoknot, 28 nt",
    layout: "circular" as const,
    note: "Constructed for this project, not literature-derived. Its two helices interleave, so the chords cross: nested dot-bracket cannot write it.",
  },
];

export function HeroFigure() {
  const [active, setActive] = useState(VIEWS[0].id);
  const view = VIEWS.find((v) => v.id === active) ?? VIEWS[0];
  const record = fixture(view.id);

  return (
    <div className="relative">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Benchmark structure</p>
          <p className="mt-1 text-sm font-semibold">{view.title}</p>
        </div>
        <div role="group" aria-label="Benchmark molecule" className="flex gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] p-1">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === active}
              onClick={() => setActive(option.id)}
              className={
                option.id === active
                  ? "rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                  : "rounded-full px-3 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }
            >
              {option.tab}
            </button>
          ))}
        </div>
      </div>
      {record && (
        <div className="mt-3">
          <StructureView
            key={view.id}
            sequence={record.sequence}
            pairs={pairsFromBrackets(record.known_structure)}
            label={`${view.title}, reference structure`}
            layout={view.layout}
            size={400}
          />
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
        {view.note} Hover a base for its position and partner.
      </p>
    </div>
  );
}
