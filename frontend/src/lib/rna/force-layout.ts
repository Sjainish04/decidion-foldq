import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3";
import { layoutStructure, type Layout, type LayoutLink, type LayoutNode } from "./layout";

/** Backbone links hold consecutive nucleotides at a fixed rest length. */
const BACKBONE_LENGTH = 20;
/** Pair links are shorter than backbone links — that gap is what pulls a
 *  paired strand together into a ladder instead of a loose loop. */
const PAIR_LENGTH = 15;
/** Diagonal brace between two stacked base pairs (see `braceLinks`), sized
 *  as the diagonal of the backbone/pair rectangle so it reinforces rather
 *  than fights either spring. */
const BRACE_LENGTH = Math.sqrt(BACKBONE_LENGTH ** 2 + PAIR_LENGTH ** 2);
const CHARGE_STRENGTH = -50;
const COLLIDE_RADIUS = 6;
/** One full run of d3-force's default alpha-decay schedule (alpha decays
 *  past alphaMin by tick ~300) — enough to converge, no more. */
const DEFAULT_TICKS = 300;
/** Fixed seed for the simulation's internal tie-breaking jiggle. */
const RANDOM_SEED = 1;

interface SimNode extends SimulationNodeDatum {
  index: number;
  base: string;
  paired: boolean;
  x: number;
  y: number;
}

/** Pre-resolution link shape fed to forceLink: source/target are still the
 *  plain nucleotide indices, not yet resolved to node references. */
interface SimLink extends SimulationLinkDatum<SimNode> {
  source: number;
  target: number;
  kind: "backbone" | "pair" | "brace";
}

/** Deterministic PRNG (mulberry32) so the simulation never touches
 *  Math.random. It is only invoked when two nodes land exactly on top of
 *  one another, but a layout computed at build time has to reproduce
 *  byte-for-byte regardless. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Diagonal braces between consecutive stacked base pairs (i, j) and
 *  (i+1, j-1): both diagonals of the little rectangle they form, so the
 *  rectangle resists shearing and the helix reads as a straight ladder
 *  instead of curling under repulsion. Simulation-only — braces are never
 *  part of the rendered output, only backbone and pair links are. */
function braceLinks(pairs: [number, number][]): SimLink[] {
  const partner = new Map<number, number>();
  for (const [i, j] of pairs) {
    partner.set(i, j);
    partner.set(j, i);
  }
  const braces: SimLink[] = [];
  for (const [i, j] of pairs) {
    if (partner.get(i + 1) === j - 1) {
      braces.push({ source: i, target: j - 1, kind: "brace" });
      braces.push({ source: i + 1, target: j, kind: "brace" });
    }
  }
  return braces;
}

/**
 * Forna-style force-directed layout: backbone and base-pair springs plus
 * mutual repulsion between every nucleotide, run synchronously to a fixed
 * tick count so the component can render it during a server render like any
 * other layout — no animation, no client-only simulation loop.
 *
 * Initial positions come from the existing circular layout
 * (`layoutStructure`) rather than d3-force's own default placement. That
 * gives the simulation a topology-aware starting point, and — combined with
 * a fixed random source and a fixed tick count — keeps the result fully
 * deterministic: the same sequence and pairs always produce the same
 * coordinates.
 *
 * Crossing (pseudoknotted) pairs need no special handling: a pair is just a
 * spring between two nodes, whether or not it crosses another one.
 */
export function forceLayoutStructure(
  sequence: string,
  pairs: [number, number][],
  options: { padding?: number; ticks?: number } = {},
): Layout {
  const padding = options.padding ?? 28;
  const ticks = options.ticks ?? DEFAULT_TICKS;

  if (sequence.length === 0) {
    return { nodes: [], links: [], width: padding * 2, height: padding * 2 };
  }

  const seed = layoutStructure(sequence, pairs);

  const pairedIndices = new Set<number>();
  for (const [i, j] of pairs) {
    pairedIndices.add(i);
    pairedIndices.add(j);
  }

  const nodes: SimNode[] = seed.nodes.map((n) => ({
    index: n.index,
    base: n.base,
    paired: pairedIndices.has(n.index),
    x: n.x,
    y: n.y,
  }));

  const backbone: LayoutLink[] = [];
  for (let index = 1; index < sequence.length; index += 1) {
    backbone.push({ source: index - 1, target: index, kind: "backbone" });
  }
  const pairLinks: LayoutLink[] = pairs.map(([i, j]) => ({ source: i, target: j, kind: "pair" }));

  // forceLink mutates a link's source/target from a numeric id into the
  // resolved node reference, in place, on whatever array it is given. Run
  // the simulation on copies so the numeric ids in `backbone`/`pairLinks`
  // survive untouched for the rendered output below.
  const simLinks: SimLink[] = [...backbone, ...pairLinks, ...braceLinks(pairs)].map((l) => ({
    source: l.source,
    target: l.target,
    kind: l.kind,
  }));

  const simulation = forceSimulation<SimNode>(nodes)
    .randomSource(seededRandom(RANDOM_SEED))
    .force(
      "link",
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.index)
        .distance((l) =>
          l.kind === "backbone" ? BACKBONE_LENGTH : l.kind === "pair" ? PAIR_LENGTH : BRACE_LENGTH,
        ),
    )
    .force("charge", forceManyBody<SimNode>().strength(CHARGE_STRENGTH))
    .force("collide", forceCollide<SimNode>(COLLIDE_RADIUS))
    .stop();

  for (let i = 0; i < ticks; i += 1) {
    simulation.tick();
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }

  const outNodes: LayoutNode[] = nodes.map((n) => ({
    index: n.index,
    base: n.base,
    paired: n.paired,
    x: n.x - minX + padding,
    y: n.y - minY + padding,
  }));

  return {
    nodes: outNodes,
    links: [...backbone, ...pairLinks],
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}
