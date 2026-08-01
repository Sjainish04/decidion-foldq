import Link from "next/link";
import { LigandList } from "./LigandList";
import type { Structure } from "@/lib/structures/schemas";

export function StructureCard({
  structure,
  onFold,
}: {
  structure: Structure;
  onFold?: (sequence: string) => void;
}) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          href={`/structures/${structure.pdb_id}`}
          className="font-mono text-sm font-semibold text-[var(--quantum-inspired)]"
        >
          {structure.pdb_id}
        </Link>
        <span className="text-xs tabular-nums">
          {structure.resolution === null
            ? "no resolution reported"
            : `${structure.resolution.toFixed(2)} Å`}
        </span>
      </div>

      <p className="mt-1 text-sm">{structure.title}</p>

      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
        <div>
          <dt className="inline">Method: </dt>
          <dd className="inline">{structure.method}</dd>
        </div>
        {structure.organisms.length > 0 && (
          <div>
            <dt className="inline">Organism: </dt>
            <dd className="inline italic">{structure.organisms.join(", ")}</dd>
          </div>
        )}
        {structure.rna_length !== null && (
          <div>
            <dt className="inline">RNA: </dt>
            <dd className="inline">{structure.rna_length} nt</dd>
          </div>
        )}
        <div>
          <dt className="inline">Released: </dt>
          <dd className="inline">{structure.released}</dd>
        </div>
        <div>
          <dt className="inline">Retrieved: </dt>
          <dd className="inline">{structure.retrieved}</dd>
        </div>
      </dl>

      <div className="mt-2">
        <LigandList ligands={structure.ligands} />
      </div>

      {onFold && structure.rna_sequence && (
        <button
          onClick={() => onFold(structure.rna_sequence!)}
          className="mt-3 rounded border border-[var(--border)] px-3 py-1.5 text-xs"
        >
          Fold this sequence in FoldQ
        </button>
      )}
    </article>
  );
}
