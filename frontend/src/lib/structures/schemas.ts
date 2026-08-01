import { z } from "zod";

export const structureSchema = z.object({
  pdb_id: z.string(),
  title: z.string(),
  /** The experimental method. Displayed on every card — a viewer must never have to
   *  assume whether a structure was measured or predicted. */
  method: z.string(),
  /** Null for NMR and some cryo-EM entries. Null means "not reported", not "poor". */
  resolution: z.number().nullable(),
  rna_length: z.number().nullable(),
  rna_sequence: z.string().nullable(),
  ligands: z.array(z.string()),
  organisms: z.array(z.string()),
  released: z.string(),
  /** The date this record was fetched from RCSB. Required — an undated cached
   *  record is an undated claim. */
  retrieved: z.string(),
});

export const structureSearchSchema = z.object({
  structures: z.array(structureSchema),
  query: z.string(),
  max_resolution: z.number(),
});

export type Structure = z.infer<typeof structureSchema>;
export type StructureSearchResponse = z.infer<typeof structureSearchSchema>;
