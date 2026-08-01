/** An RNA functional class. Each is a label plus a full-text query passed straight
 *  to RCSB — there is no target database behind this, and none is implied. The
 *  structures returned are whatever RCSB matches, ranked by resolution. */
export interface RnaTarget {
  id: string;
  label: string;
  description: string;
  query: string;
}

export const RNA_TARGETS: RnaTarget[] = [
  {
    id: "trna",
    label: "tRNA",
    description: "Transfer RNA. The project's 76-nt benchmark is one of these.",
    query: "transfer RNA",
  },
  {
    id: "ribosome",
    label: "Ribosomal RNA",
    description: "Ribosomal subunits and complexes — the largest RNA structures.",
    query: "ribosome",
  },
  {
    id: "riboswitch",
    label: "Riboswitch",
    description: "Ligand-binding regulatory elements; most carry bound hetero-atoms.",
    query: "riboswitch",
  },
  {
    id: "ribozyme",
    label: "Ribozyme",
    description: "Catalytic RNA, including hammerhead and hairpin ribozymes.",
    query: "ribozyme",
  },
  {
    id: "aptamer",
    label: "Aptamer",
    description: "Selected binding RNAs, usually in complex with their target.",
    query: "aptamer",
  },
  {
    id: "viral",
    label: "Viral RNA element",
    description: "Structured viral elements — frameshift signals, IRES, UTRs.",
    query: "viral RNA element",
  },
];
