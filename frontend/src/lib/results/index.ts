import e1 from "./data/e1_formulation.json";
import e2 from "./data/e2_encoding.json";
import e3 from "./data/e3_solvers.json";
import e4 from "./data/e4_qaoa.json";
import e5 from "./data/e5_pseudoknot.json";

export const EXPERIMENTS = [
  "e1_formulation",
  "e2_encoding",
  "e3_solvers",
  "e4_qaoa",
  "e5_pseudoknot",
] as const;

export type ExperimentName = (typeof EXPERIMENTS)[number];

/** A single result row. Values are numbers, booleans, strings, or null —
 *  null is meaningful: it marks a gate that could not be determined. */
export type Row = Record<string, number | string | boolean | null>;

const DATA: Record<ExperimentName, Row[]> = {
  e1_formulation: e1 as Row[],
  e2_encoding: e2 as Row[],
  e3_solvers: e3 as Row[],
  e4_qaoa: e4 as Row[],
  e5_pseudoknot: e5 as Row[],
};

export function loadExperiment(name: ExperimentName): Row[] {
  return DATA[name];
}
