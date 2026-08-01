"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMeta } from "@/lib/api/client";
import { useWorkspace } from "@/stores/workspace";

export function SolverPicker() {
  const { solver, setSolver, seed, setSeed, pseudoknots, setPseudoknots } = useWorkspace();
  const { data } = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="solver" className="block text-sm font-medium">
          Solver
        </label>
        <select
          id="solver"
          value={solver}
          onChange={(event) => setSolver(event.target.value)}
          className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-sm"
        >
          {(data?.solvers ?? [solver]).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="seed" className="block text-sm font-medium">
          Seed
        </label>
        <input
          id="seed"
          type="number"
          value={seed}
          onChange={(event) => setSeed(Number(event.target.value))}
          className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-sm"
        />
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          The same sequence, solver and seed always produce the same run.
        </p>
      </div>

      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={pseudoknots}
            onChange={(event) => setPseudoknots(event.target.checked)}
          />
          Allow pseudoknots
        </label>
        {pseudoknots && (
          <p className="mt-1 text-xs text-[var(--warning)]">
            The crossing penalty is disabled, so the candidate may contain crossing
            pairs. ViennaRNA cannot represent or score those, and its reference fold can
            hold at most one of any two crossing helices — so{" "}
            <strong>precision against a nested reference is capped</strong> even when the
            structure is right.
          </p>
        )}
      </div>
    </div>
  );
}
