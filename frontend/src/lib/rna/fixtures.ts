import records from "@/lib/results/data/fixtures.json";

/** One curated benchmark sequence with its reference structure, bundled from
 *  `data/fixtures/curated.json` by `scripts/bundle-results.mjs`. */
export interface Fixture {
  sequence_id: string;
  sequence: string;
  known_structure: string;
  has_pseudoknot: boolean;
  source: string;
}

export const FIXTURES = records as Fixture[];

export function fixture(id: string): Fixture | undefined {
  return FIXTURES.find((record) => record.sequence_id === id);
}

const OPEN = "([{<";
const CLOSE = ")]}>";

/** Base pairs from extended dot-bracket, where each bracket type is its own
 *  nesting level. Unlike `parseDotBracket`, this reads `[]` as a second layer,
 *  which is how the pseudoknot fixtures write their crossing helix. */
export function pairsFromBrackets(structure: string): [number, number][] {
  const stacks: number[][] = OPEN.split("").map(() => []);
  const pairs: [number, number][] = [];
  for (let index = 0; index < structure.length; index += 1) {
    const character = structure[index];
    const opening = OPEN.indexOf(character);
    const closing = CLOSE.indexOf(character);
    if (opening >= 0) stacks[opening].push(index);
    else if (closing >= 0) {
      const open = stacks[closing].pop();
      if (open === undefined) throw new Error(`unmatched '${character}' at position ${index}`);
      pairs.push([open, index]);
    }
  }
  if (stacks.some((stack) => stack.length > 0)) throw new Error("unclosed bracket in structure");
  return pairs.sort((a, b) => a[0] - b[0]);
}
