import { z } from "zod";

/** Gates B and C are null, not false, when the instance exceeds the exact
 *  solver's variable ceiling. Null means "indeterminate" and must never be
 *  rendered as a failure. */
export const gateReportSchema = z.object({
  representable: z.boolean(),
  representable_fraction: z.number(),
  is_qubo_ground_state: z.boolean().nullable(),
  solver_found_ground_state: z.boolean().nullable(),
  energy_gap: z.number().nullable(),
  base_pair_f1: z.number(),
  is_pseudoknotted: z.boolean(),
  attribution: z.string(),
  notes: z.array(z.string()),
});

const basePairSchema = z.tuple([z.number(), z.number()]);

export const foldResponseSchema = z.object({
  run_id: z.string(),
  sequence: z.string(),
  solver: z.string(),
  seed: z.number(),
  reference: z.object({
    dot_bracket: z.string(),
    energy: z.number().nullable(),
    base_pairs: z.array(basePairSchema),
  }),
  candidate: z.object({
    dot_bracket: z.string(),
    /** null when the candidate is pseudoknotted: ViennaRNA cannot score a crossing. */
    energy: z.number().nullable(),
    base_pairs: z.array(basePairSchema),
    stems: z.array(z.object({ i: z.number(), j: z.number(), k: z.number() })),
    qubo_energy: z.number(),
    was_repaired: z.boolean(),
    repair_count: z.number(),
    is_pseudoknotted: z.boolean(),
  }),
  gates: gateReportSchema,
  problem: z.object({
    num_variables: z.number(),
    num_quadratic_terms: z.number(),
    density: z.number(),
    overlap_penalty: z.number(),
    forbid_crossing: z.boolean(),
  }),
  stages: z.array(z.object({ name: z.string(), seconds: z.number() })),
  runtime_seconds: z.number(),
  decision_card_html: z.string(),
});

export const metaResponseSchema = z.object({
  versions: z.record(z.string(), z.string()),
  solvers: z.array(z.string()),
  commit: z.string().nullable(),
});

export const diagramJobSchema = z.object({
  job_id: z.string(),
  state: z.string(),
});

export const diagramResultSchema = z.object({
  job_id: z.string(),
  state: z.string(),
  svg: z.string().nullable().default(null),
  /** Name of the curated template R2DT matched, e.g. "E_Phe". */
  template: z.string().nullable().default(null),
  /** Where that template came from, e.g. "GtRNAdb", "Rfam", "CRW". */
  template_source: z.string().nullable().default(null),
  /** False when R2DT fell back to a computed layout. The diagram is still
   *  valid, but it carries no family convention, so the UI must not imply the
   *  orientation is meaningful. */
  templated: z.boolean().default(false),
});

export type DiagramJob = z.infer<typeof diagramJobSchema>;
export type DiagramResult = z.infer<typeof diagramResultSchema>;
export type FoldResponse = z.infer<typeof foldResponseSchema>;
export type MetaResponse = z.infer<typeof metaResponseSchema>;
export type GateReport = z.infer<typeof gateReportSchema>;
