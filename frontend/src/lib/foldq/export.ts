import type { FoldResponse } from "@/lib/api/schemas";

export const CSV_HEADER = [
  "run_id",
  "sequence",
  "length",
  "solver",
  "seed",
  "num_variables",
  "qubo_density",
  "candidate_structure",
  "candidate_energy",
  "reference_structure",
  "reference_energy",
  "representable",
  "is_qubo_ground_state",
  "solver_found_ground_state",
  "energy_gap",
  "base_pair_f1",
  "is_pseudoknotted",
  "attribution",
].join(",");

/** A null gate means indeterminate, not false. It is written as an empty field so a
 *  reader cannot mistake "we could not check" for "it failed" — the same convention
 *  the experiment CSVs use. */
const flag = (value: boolean | null) => (value === null ? "" : String(value));
const number = (value: number | null) => (value === null ? "" : String(value));

export function runToCsvRow(result: FoldResponse): string {
  return [
    result.run_id,
    result.sequence,
    String(result.sequence.length),
    result.solver,
    String(result.seed),
    String(result.problem.num_variables),
    String(result.problem.density),
    result.candidate.dot_bracket,
    number(result.candidate.energy),
    result.reference.dot_bracket,
    number(result.reference.energy),
    String(result.gates.representable),
    flag(result.gates.is_qubo_ground_state),
    flag(result.gates.solver_found_ground_state),
    number(result.gates.energy_gap),
    String(result.gates.base_pair_f1),
    String(result.gates.is_pseudoknotted),
    `"${result.gates.attribution.replace(/"/g, '""')}"`,
  ].join(",");
}

export function downloadText(filename: string, contents: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
