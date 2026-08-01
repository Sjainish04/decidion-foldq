import { SequenceTrack } from "@/components/rna/SequenceTrack";
import { StructureView } from "@/components/rna/StructureView";
import type { FoldResponse } from "@/lib/api/schemas";

const energy = (value: number | null) =>
  value === null ? "not scorable" : `${value.toFixed(2)} kcal/mol`;

export function StructureComparison({ result }: { result: FoldResponse }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">FoldQ candidate</h2>
        <p className="mb-2 mt-1 text-xs text-[var(--text-secondary)]">
          {energy(result.candidate.energy)}
          {result.candidate.is_pseudoknotted &&
            " — contains crossing pairs, which ViennaRNA cannot score"}
          {result.candidate.was_repaired &&
            ` · ${result.candidate.repair_count} repair(s) applied to the decoded sample`}
        </p>
        <StructureView
          sequence={result.sequence}
          pairs={result.candidate.base_pairs}
          label="FoldQ candidate structure"
        />
        {!result.candidate.is_pseudoknotted && (
          <div className="mt-2">
            <SequenceTrack
              sequence={result.sequence}
              structure={result.candidate.dot_bracket}
            />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">ViennaRNA reference</h2>
        <p className="mb-2 mt-1 text-xs text-[var(--text-secondary)]">
          {energy(result.reference.energy)} — minimum free energy under the Turner model
        </p>
        <StructureView
          sequence={result.sequence}
          pairs={result.reference.base_pairs}
          label="ViennaRNA reference structure"
        />
        <div className="mt-2">
          <SequenceTrack
            sequence={result.sequence}
            structure={result.reference.dot_bracket}
          />
        </div>
      </div>
    </section>
  );
}
