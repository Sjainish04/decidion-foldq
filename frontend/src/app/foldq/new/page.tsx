"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { SequenceInput } from "@/components/foldq/SequenceInput";
import { SolverPicker } from "@/components/foldq/SolverPicker";
import { foldSequence } from "@/lib/api/client";
import { sequenceError, useWorkspace } from "@/stores/workspace";

export default function NewAnalysisPage() {
  const router = useRouter();
  const { sequence, solver, seed, pseudoknots } = useWorkspace();
  const invalid = sequenceError(sequence) !== null || sequence.length === 0;

  const mutation = useMutation({
    mutationFn: () => foldSequence({ sequence, solver, seed, pseudoknots }),
    onSuccess: (result) => {
      sessionStorage.setItem(`foldq:run:${result.run_id}`, JSON.stringify(result));
      router.push(`/foldq/runs/${result.run_id}`);
    },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">New analysis</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Fold a sequence through the full pipeline: candidate helices, QUBO
          construction, solve, decode, repair, rescore, and the four diagnostic gates.
        </p>
      </header>

      <SequenceInput />
      <SolverPicker />

      <div className="flex items-center gap-3">
        <button
          disabled={invalid || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="rounded bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {mutation.isPending ? "Folding…" : "Fold sequence"}
        </button>
        {mutation.isPending && (
          <span className="text-xs text-[var(--text-secondary)]" role="status">
            Running the pipeline…
          </span>
        )}
      </div>

      {mutation.isError && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {(mutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
