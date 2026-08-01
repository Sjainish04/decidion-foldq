import { parseDotBracket } from "@/lib/rna/dotbracket";
import { foldResponseSchema, type FoldResponse } from "@/lib/api/schemas";

export interface PairDiff {
  shared: [number, number][];
  onlyA: [number, number][];
  onlyB: [number, number][];
  f1: number;
}

const key = ([i, j]: [number, number]) => `${i}-${j}`;

/** Compares two dot-bracket structures by base pair.
 *
 *  Throws on an unparseable input rather than treating it as "no pairs" — an
 *  empty pair set would silently report zero overlap, which reads as a real
 *  disagreement between two structures instead of a parse failure. */
export function comparePairs(a: string, b: string): PairDiff {
  const parsedA = parseDotBracket(a);
  const parsedB = parseDotBracket(b);
  for (const parsed of [parsedA, parsedB]) {
    if (!parsed.isValid) throw new Error(parsed.error);
  }

  const keysB = new Set(parsedB.pairs.map(key));
  const keysA = new Set(parsedA.pairs.map(key));
  const shared = parsedA.pairs.filter((pair) => keysB.has(key(pair)));
  const onlyA = parsedA.pairs.filter((pair) => !keysB.has(key(pair)));
  const onlyB = parsedB.pairs.filter((pair) => !keysA.has(key(pair)));

  const precision = parsedA.pairs.length === 0 ? 0 : shared.length / parsedA.pairs.length;
  const recall = parsedB.pairs.length === 0 ? 0 : shared.length / parsedB.pairs.length;
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return { shared, onlyA, onlyB, f1 };
}

/** Every run this browser session has folded. There is no server-side history —
 *  a run is a content hash, so re-folding the same inputs restores it exactly. */
export function listCachedRuns(): FoldResponse[] {
  if (typeof window === "undefined") return [];
  const runs: FoldResponse[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const storageKey = sessionStorage.key(index);
    if (!storageKey?.startsWith("foldq:run:")) continue;
    const parsed = foldResponseSchema.safeParse(
      JSON.parse(sessionStorage.getItem(storageKey)!),
    );
    if (parsed.success) runs.push(parsed.data);
  }
  return runs;
}
