import { create } from "zustand";

interface WorkspaceState {
  sequence: string;
  solver: string;
  seed: number;
  pseudoknots: boolean;
  setSequence: (value: string) => void;
  setSolver: (value: string) => void;
  setSeed: (value: number) => void;
  setPseudoknots: (value: boolean) => void;
  reset: () => void;
}

const INITIAL = {
  sequence: "",
  solver: "simulated_annealing",
  seed: 42,
  pseudoknots: false,
};

export const useWorkspace = create<WorkspaceState>((set) => ({
  ...INITIAL,
  /** Normalization mirrors SequenceRecord.__post_init__ in the backend: strip
   *  whitespace, uppercase, T becomes U. Doing it here means the field shows the
   *  sequence that will actually be folded. */
  setSequence: (value) =>
    set({ sequence: value.toUpperCase().replace(/\s+/g, "").replace(/T/g, "U") }),
  setSolver: (value) => set({ solver: value }),
  setSeed: (value) => set({ seed: value }),
  setPseudoknots: (value) => set({ pseudoknots: value }),
  reset: () => set(INITIAL),
}));

const VALID = new Set(["A", "U", "C", "G"]);

export function sequenceError(sequence: string): string | null {
  if (sequence.length === 0) return null;
  const bad = [...new Set([...sequence])].filter((c) => !VALID.has(c)).sort();
  if (bad.length > 0) return `invalid nucleotide(s): ${bad.join(", ")}`;
  if (sequence.length > 200) return "sequence exceeds the 200 nt limit for live folding";
  return null;
}

export function gcContent(sequence: string): number {
  if (sequence.length === 0) return 0;
  const gc = [...sequence].filter((c) => c === "G" || c === "C").length;
  return gc / sequence.length;
}
