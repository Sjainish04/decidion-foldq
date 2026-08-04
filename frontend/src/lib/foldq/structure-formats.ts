import type { FoldResponse } from "@/lib/api/schemas";

/** Export to the interchange formats RNA structure tools actually read.
 *
 *  The reason to have these rather than only dot-bracket: **both are pair
 *  lists, so both represent pseudoknots natively.** Dot-bracket needs extra
 *  bracket classes to express a crossing pair, and tools disagree on how many
 *  they support, so a pseudoknotted structure is exactly the case where the
 *  string form is least portable. Pseudoknots are this project's headline
 *  result, which makes that the case worth getting right.
 *
 *  These are what let a FoldQ result open in XRNA, RNAcanvas, VARNA, forna, or
 *  RNAstructure without anyone writing a converter.
 */

/** Pair partner per position, 1-based, 0 when unpaired. */
function partners(sequence: string, pairs: readonly (readonly [number, number])[]): number[] {
  const table = new Array<number>(sequence.length).fill(0);
  for (const [i, j] of pairs) {
    // Guard rather than trust: an out-of-range index would produce a file that
    // loads and is silently wrong, which is worse than one that fails to load.
    if (i < 0 || j < 0 || i >= sequence.length || j >= sequence.length) continue;
    table[i] = j + 1;
    table[j] = i + 1;
  }
  return table;
}

/** BPSEQ: `index base pairedIndex`, one line per nucleotide.
 *
 *  The format RNAcentral and the CRW comparative databases use.
 */
export function toBpseq(result: FoldResponse): string {
  const sequence = result.sequence;
  const table = partners(sequence, result.candidate.base_pairs);
  const lines = [
    `# Decidion FoldQ run ${result.run_id}`,
    `# solver ${result.solver}, seed ${result.seed}`,
  ];
  for (let i = 0; i < sequence.length; i += 1) {
    lines.push(`${i + 1} ${sequence[i]} ${table[i]}`);
  }
  return `${lines.join("\n")}\n`;
}

/** CT (connectivity table), the mfold/RNAstructure format.
 *
 *  Six columns: index, base, previous index, next index, pair, natural
 *  numbering. The redundant neighbour columns are part of the spec — readers
 *  parse by position, so they cannot be omitted even though they are derivable.
 */
export function toCt(result: FoldResponse): string {
  const sequence = result.sequence;
  const table = partners(sequence, result.candidate.base_pairs);
  const energy = result.candidate.energy;
  // NaN is legitimate for a pseudoknotted candidate; the header omits the
  // energy rather than writing "NaN", which some parsers choke on.
  const header =
    energy === null || Number.isNaN(energy)
      ? `${sequence.length}\tfoldq_${result.run_id}`
      : `${sequence.length}\tENERGY = ${energy.toFixed(2)}\tfoldq_${result.run_id}`;

  const lines = [header];
  for (let i = 0; i < sequence.length; i += 1) {
    lines.push(
      [i + 1, sequence[i], i, i + 2 > sequence.length ? 0 : i + 2, table[i], i + 1].join("\t"),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Plain FASTA-style dot-bracket, for tools that want the string form.
 *
 *  Kept alongside the pair-list formats, not instead of them: it is the most
 *  widely accepted input and the least able to carry a pseudoknot.
 */
export function toDotBracket(result: FoldResponse): string {
  return `>foldq_${result.run_id}\n${result.sequence}\n${result.candidate.dot_bracket}\n`;
}
