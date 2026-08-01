"use client";

import { useState } from "react";
import { StructureView } from "@/components/rna/StructureView";
import { comparePairs, listCachedRuns } from "@/lib/foldq/diff";
import { describeStructure } from "@/lib/rna/dotbracket";
import type { FoldResponse } from "@/lib/api/schemas";

function RunStats({ run }: { run: FoldResponse }) {
  const stats = describeStructure(run.candidate.dot_bracket);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <dt className="text-[var(--text-secondary)]">Solver</dt>
      <dd>{run.solver}</dd>
      <dt className="text-[var(--text-secondary)]">Base pairs</dt>
      <dd className="tabular-nums">{stats.pairCount}</dd>
      <dt className="text-[var(--text-secondary)]">Helices</dt>
      <dd className="tabular-nums">{stats.helixCount}</dd>
      <dt className="text-[var(--text-secondary)]">Hairpins</dt>
      <dd className="tabular-nums">{stats.hairpinCount}</dd>
      <dt className="text-[var(--text-secondary)]">Attribution</dt>
      <dd>{run.gates.attribution.split(":")[0]}</dd>
    </dl>
  );
}

export default function ComparePage() {
  const runs = listCachedRuns();
  const [leftId, setLeftId] = useState(runs[0]?.run_id ?? "");
  const [rightId, setRightId] = useState(runs[1]?.run_id ?? "");

  if (runs.length < 2) {
    return (
      <div className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-semibold">Compare runs</h1>
        <p role="status" className="text-sm text-[var(--text-secondary)]">
          Comparison needs at least two runs from this browser session. Fold the same
          sequence with two different solvers, then come back — runs are not stored on a
          server, so this list is per-session by design.
        </p>
      </div>
    );
  }

  const left = runs.find((r) => r.run_id === leftId) ?? runs[0];
  const right = runs.find((r) => r.run_id === rightId) ?? runs[1];
  const comparable =
    left.sequence === right.sequence &&
    !left.candidate.is_pseudoknotted &&
    !right.candidate.is_pseudoknotted;
  const diff = comparable
    ? comparePairs(left.candidate.dot_bracket, right.candidate.dot_bracket)
    : null;

  const picker = (
    label: string,
    value: string,
    onChange: (value: string) => void,
  ) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-sm"
      >
        {runs.map((run) => (
          <option key={run.run_id} value={run.run_id}>
            {run.solver} · seed {run.seed} · {run.sequence.length} nt
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Compare runs</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {picker("Run A", left.run_id, setLeftId)}
        {picker("Run B", right.run_id, setRightId)}
      </div>

      {diff ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-base font-semibold">Agreement</h2>
          <p className="mt-1 text-sm">
            <strong className="tabular-nums">{diff.shared.length}</strong> shared pairs ·{" "}
            {diff.onlyA.length} only in A · {diff.onlyB.length} only in B · F1{" "}
            <strong className="tabular-nums">{diff.f1.toFixed(3)}</strong>
          </p>
        </section>
      ) : (
        <p className="rounded border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-sm">
          These runs are not directly comparable by base pair: they fold different
          sequences, or one contains crossing pairs that dot-bracket notation cannot
          express.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {[left, right].map((run, index) => (
          <div
            key={run.run_id}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <h2 className="mb-2 text-base font-semibold">
              Run {index === 0 ? "A" : "B"}
            </h2>
            <RunStats run={run} />
            <div className="mt-3">
              <StructureView
                sequence={run.sequence}
                pairs={run.candidate.base_pairs}
                label={`Run ${index === 0 ? "A" : "B"} candidate structure`}
                highlight={
                  diff
                    ? (index === 0 ? diff.onlyA : diff.onlyB).flatMap(([i, j]) => [i, j])
                    : []
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
