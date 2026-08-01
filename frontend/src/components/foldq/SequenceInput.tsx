"use client";

import { gcContent, sequenceError, useWorkspace } from "@/stores/workspace";

export function SequenceInput() {
  const { sequence, setSequence } = useWorkspace();
  const error = sequenceError(sequence);

  return (
    <div>
      <label htmlFor="sequence" className="block text-sm font-medium">
        RNA sequence
      </label>
      <p className="mb-1 mt-0.5 text-xs text-[var(--text-secondary)]">
        A, U, C, G. DNA input is accepted — T is converted to U. Use public,
        synthetic, or randomly generated sequences only.
      </p>
      <textarea
        id="sequence"
        rows={3}
        value={sequence}
        spellCheck={false}
        onChange={(event) => setSequence(event.target.value)}
        aria-invalid={error !== null}
        aria-describedby={error ? "sequence-error" : "sequence-stats"}
        className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2 font-mono text-sm"
      />
      {error ? (
        <p id="sequence-error" role="alert" className="mt-1 text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : (
        <p id="sequence-stats" className="mt-1 text-xs text-[var(--text-secondary)]">
          {sequence.length} nt · {(gcContent(sequence) * 100).toFixed(1)}% GC
        </p>
      )}
    </div>
  );
}
