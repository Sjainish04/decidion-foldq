"use client";

import { useState } from "react";
import { SequenceTrack } from "@/components/rna/SequenceTrack";
import { StructureView } from "@/components/rna/StructureView";
import type { FoldResponse } from "@/lib/api/schemas";

const energy = (value: number | null) =>
  value === null ? "not scorable" : `${value.toFixed(2)} kcal/mol`;

const LAYOUTS = [
  {
    value: "force" as const,
    label: "Force-directed",
    hint: "Helices form ladders and loops open out, the way RNA is conventionally drawn.",
  },
  {
    value: "circular" as const,
    label: "Circular",
    hint: "Every nucleotide on one circle, pairs as chords. Crossing chords are pseudoknots.",
  },
];

export function StructureComparison({ result }: { result: FoldResponse }) {
  // One control for both panels, deliberately. The whole point of this view is
  // comparing candidate against reference, and two drawings made by different
  // layout algorithms cannot be compared by eye.
  const [layout, setLayout] = useState<"circular" | "force">("force");
  const active = LAYOUTS.find((option) => option.value === layout);

  return (
    <>
      <div className="panel flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <label htmlFor="structure-layout" className="text-sm font-medium">
          Layout
        </label>
        <select
          id="structure-layout"
          value={layout}
          onChange={(event) =>
            setLayout(event.target.value as "circular" | "force")
          }
          className="field px-3 py-1.5 text-sm"
        >
          {LAYOUTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-secondary)]">
          {active?.hint}
        </span>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="section-title">FoldQ candidate</h2>
          <p className="mb-2 mt-1 text-xs text-[var(--text-secondary)]">
            {energy(result.candidate.energy)}
            {result.candidate.is_pseudoknotted &&
              ". Contains crossing pairs, which ViennaRNA cannot score"}
            {result.candidate.was_repaired &&
              ` · ${result.candidate.repair_count} repair(s) applied to the decoded sample`}
          </p>
          <StructureView
            sequence={result.sequence}
            pairs={result.candidate.base_pairs}
            label="FoldQ candidate structure"
            layout={layout}
          />
          {!result.candidate.is_pseudoknotted && (
            <div className="mt-3">
              <SequenceTrack
                sequence={result.sequence}
                structure={result.candidate.dot_bracket}
              />
            </div>
          )}
        </div>

        <div className="panel p-5">
          <h2 className="section-title">ViennaRNA reference</h2>
          <p className="mb-2 mt-1 text-xs text-[var(--text-secondary)]">
            {energy(result.reference.energy)}, the minimum free energy under the
            Turner model
          </p>
          <StructureView
            sequence={result.sequence}
            pairs={result.reference.base_pairs}
            label="ViennaRNA reference structure"
            layout={layout}
          />
          <div className="mt-3">
            <SequenceTrack
              sequence={result.sequence}
              structure={result.reference.dot_bracket}
            />
          </div>
        </div>
      </section>
    </>
  );
}
