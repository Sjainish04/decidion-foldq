"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StructureCard } from "@/components/molecular/StructureCard";
import { searchStructures } from "@/lib/structures/client";
import { RNA_TARGETS } from "@/lib/structures/targets";
import { useWorkspace } from "@/stores/workspace";

export default function StructuresPage() {
  const router = useRouter();
  const setSequence = useWorkspace((state) => state.setSequence);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [maxResolution, setMaxResolution] = useState(3.0);

  const target = RNA_TARGETS.find((t) => t.id === targetId) ?? null;
  // A free-text search overrides the target class; otherwise the target's query
  // drives the search. Sending both would AND them and usually return nothing.
  const query = text || target?.query || "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["structures", query, maxResolution],
    queryFn: () => searchStructures({ text: query, maxResolution }),
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Structural evidence</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          RNA-containing entries from the RCSB Protein Data Bank, ranked best resolution
          first. <strong>Only experimentally determined structures are listed</strong> —
          X-ray, cryo-EM and NMR. Computed models are excluded rather than ranked lower,
          and every card names its method and the date the record was retrieved.
        </p>
      </header>

      <section role="group" aria-label="RNA target class">
        <h2 className="mb-2 text-base font-semibold">1 — Pick a target</h2>
        <div className="flex flex-wrap gap-2">
          {RNA_TARGETS.map((option) => {
            const active = option.id === targetId;
            return (
              <button
                key={option.id}
                aria-pressed={active}
                title={option.description}
                onClick={() => setTargetId(active ? null : option.id)}
                className={
                  active
                    ? "rounded border border-[var(--quantum-inspired)] bg-[var(--quantum-inspired)]/15 px-3 py-1.5 text-sm"
                    : "rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {target && (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            {target.description} Matching RCSB on <code>{target.query}</code>.
          </p>
        )}
      </section>

      <h2 className="text-base font-semibold">2 — Pick a structure</h2>

      <div className="flex flex-wrap gap-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Search</span>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="overrides the target class…"
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Maximum resolution (Å)</span>
          <input
            type="number"
            step="0.1"
            min="0.5"
            max="20"
            value={maxResolution}
            onChange={(event) => setMaxResolution(Number(event.target.value))}
            className="w-28 rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-sm"
          />
        </label>
      </div>

      {isLoading && <p role="status">Searching RCSB…</p>}
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {(error as Error).message}. The rest of the application is unaffected — only
          structure views depend on RCSB.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {data?.structures.map((structure) => (
          <StructureCard
            key={structure.pdb_id}
            structure={structure}
            onFold={(sequence) => {
              setSequence(sequence);
              router.push("/foldq/new");
            }}
          />
        ))}
      </div>

      {data?.structures.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          No experimental RNA structures matched. Try a higher resolution limit.
        </p>
      )}
    </div>
  );
}
