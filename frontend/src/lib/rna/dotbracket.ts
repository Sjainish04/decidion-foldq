export interface ParsedStructure {
  pairs: [number, number][];
  unpaired: number[];
  isValid: boolean;
  error?: string;
}

/** Parses single-bracket dot-bracket notation. Crossing pairs cannot be expressed
 *  in this notation at all — a pseudoknotted candidate arrives from the API as an
 *  explicit base-pair list instead, never as a string. */
export function parseDotBracket(structure: string): ParsedStructure {
  const stack: number[] = [];
  const pairs: [number, number][] = [];
  const unpaired: number[] = [];

  for (let index = 0; index < structure.length; index += 1) {
    const character = structure[index];
    if (character === "(") {
      stack.push(index);
    } else if (character === ")") {
      const open = stack.pop();
      if (open === undefined) {
        return {
          pairs: [],
          unpaired: [],
          isValid: false,
          error: `unmatched ')' at position ${index}`,
        };
      }
      pairs.push([open, index]);
    } else if (character === ".") {
      unpaired.push(index);
    } else {
      return {
        pairs: [],
        unpaired: [],
        isValid: false,
        error: `unexpected character '${character}' at position ${index}`,
      };
    }
  }

  if (stack.length > 0) {
    return {
      pairs: [],
      unpaired: [],
      isValid: false,
      error: `unclosed '(' at position ${stack[0]}`,
    };
  }

  pairs.sort((a, b) => a[0] - b[0]);
  return { pairs, unpaired, isValid: true };
}

export interface StructureStats {
  length: number;
  pairCount: number;
  unpairedCount: number;
  pairedFraction: number;
  /** Maximal runs of consecutive stacked pairs. */
  helixCount: number;
  /** Helices whose innermost pair encloses only unpaired bases. */
  hairpinCount: number;
}

export function describeStructure(structure: string): StructureStats {
  const parsed = parseDotBracket(structure);
  const partner = new Map<number, number>();
  for (const [i, j] of parsed.pairs) {
    partner.set(i, j);
    partner.set(j, i);
  }

  let helixCount = 0;
  let hairpinCount = 0;
  for (const [i, j] of parsed.pairs) {
    const isHelixStart = partner.get(i - 1) !== j + 1;
    if (isHelixStart) helixCount += 1;

    const isInnermost = partner.get(i + 1) !== j - 1;
    if (isInnermost) {
      let enclosesPair = false;
      for (let k = i + 1; k < j; k += 1) {
        if (partner.has(k)) {
          enclosesPair = true;
          break;
        }
      }
      if (!enclosesPair) hairpinCount += 1;
    }
  }

  return {
    length: structure.length,
    pairCount: parsed.pairs.length,
    unpairedCount: parsed.unpaired.length,
    pairedFraction:
      structure.length === 0 ? 0 : (parsed.pairs.length * 2) / structure.length,
    helixCount,
    hairpinCount,
  };
}
