"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowRight, Atom, Binary, CircleCheck, Network, Spline, Wrench } from "lucide-react";
import { SequenceInput } from "@/components/foldq/SequenceInput";
import { SolverPicker } from "@/components/foldq/SolverPicker";
import { foldSequence } from "@/lib/api/client";
import { FIXTURES } from "@/lib/rna/fixtures";
import { sequenceError, useWorkspace } from "@/stores/workspace";

const STAGES = [
  { label: "Candidate helices", icon: Spline },
  { label: "QUBO", icon: Network },
  { label: "Solve", icon: Atom },
  { label: "Decode", icon: Binary },
  { label: "Repair and rescore", icon: Wrench },
  { label: "Four gates", icon: CircleCheck },
];

/** Benchmark presets, named after the molecule. Pseudoknot fixtures switch
 *  pseudoknot mode on, since their reference cannot be reached without it. */
const EXAMPLES: Record<string, string> = {
  hairpin_gc_synthetic: "GC hairpin",
  pk_htype_constructed_28: "H-type pseudoknot",
  trna_phe_yeast_acceptor: "tRNA-Phe",
};

export default function NewAnalysisPage() {
  const router = useRouter();
  const { sequence, solver, seed, pseudoknots, setSequence, setPseudoknots } = useWorkspace();
  const invalid = sequenceError(sequence) !== null || sequence.length === 0;

  const mutation = useMutation({
    mutationFn: () => foldSequence({ sequence, solver, seed, pseudoknots }),
    onSuccess: (result) => {
      sessionStorage.setItem(`foldq:run:${result.run_id}`, JSON.stringify(result));
      router.push(`/foldq/runs/${result.run_id}`);
    },
  });

  const examples = FIXTURES.filter((f) => f.sequence_id in EXAMPLES);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">ML Workflow</p>
        <h1 className="page-title mt-2">New analysis</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Fold a sequence through the full pipeline: candidate helices, QUBO
          construction, solve, decode, repair, rescore, and the four diagnostic gates.
        </p>
      </header>

      <ol
        aria-label="Pipeline stages"
        className="grid grid-cols-3 gap-2 sm:grid-cols-6"
      >
        {STAGES.map((stage, index) => {
          const Icon = stage.icon;
          return (
            <li
              key={stage.label}
              className="relative flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-center shadow-[var(--shadow-sm)]"
            >
              <span
                aria-hidden="true"
                className="grid h-8 w-8 place-items-center rounded-full text-white"
                style={{
                  background: `linear-gradient(145deg, #d97757, ${index < 3 ? "#c3512c" : "#3a7d95"})`,
                }}
              >
                <Icon size={15} />
              </span>
              <span className="text-[11px] font-semibold leading-tight">{stage.label}</span>
            </li>
          );
        })}
      </ol>

      <section className="panel space-y-5 p-5 sm:p-6">
        <div>
          <p className="text-sm font-medium">Start from a benchmark</p>
          <div role="group" aria-label="Benchmark presets" className="mt-2 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example.sequence_id}
                type="button"
                aria-pressed={sequence === example.sequence}
                onClick={() => {
                  setSequence(example.sequence);
                  setPseudoknots(example.has_pseudoknot);
                }}
                className="chip"
              >
                {EXAMPLES[example.sequence_id]}{" "}
                <span className="font-mono text-xs">{example.sequence.length} nt</span>
              </button>
            ))}
          </div>
        </div>

        <SequenceInput />
        <SolverPicker />

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-5">
          <button
            disabled={invalid || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="btn btn-primary"
          >
            {mutation.isPending ? "Folding…" : "Fold sequence"}
            {!mutation.isPending && <ArrowRight size={16} aria-hidden="true" />}
          </button>
          {mutation.isPending && (
            <span className="flex items-center gap-2 text-xs text-[var(--text-secondary)]" role="status">
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-strong)]"
              />
              Running the pipeline…
            </span>
          )}
        </div>

        {mutation.isError && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {(mutation.error as Error).message}
          </p>
        )}
      </section>
    </div>
  );
}
