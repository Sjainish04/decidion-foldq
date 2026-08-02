"""Probe 3: how far can EXACT ground-state validation reach?

Brute force is 2^n. But conflict graphs from RNA stems are sparse and mostly
nested/planar, so tree-decomposition solving may reach far larger instances.
If treewidth stays low, Gate B (is the MFE the QUBO ground state?) works at
50-80nt instead of only ~20nt. That is a large difference in claim strength.
"""

import random
import time

import networkx as nx
import RNA
from dimod import BinaryQuadraticModel
from dwave.samplers import SimulatedAnnealingSampler, TreeDecompositionSampler

PAIRS = {("A", "U"), ("U", "A"), ("G", "C"), ("C", "G")}
WOBBLE = {("G", "U"), ("U", "G")}


def can_pair(a, b, w=True):
    return (a, b) in PAIRS or (w and (a, b) in WOBBLE)


def maximal_stems(seq, min_len=3, min_hp=3):
    n, out, seen = len(seq), [], set()
    for i in range(n):
        for j in range(i + min_hp + 1, n):
            if not can_pair(seq[i], seq[j]):
                continue
            if i > 0 and j < n - 1 and can_pair(seq[i - 1], seq[j + 1]):
                continue
            k = 0
            while i + k < j - k - min_hp and can_pair(seq[i + k], seq[j - k]):
                k += 1
            if k >= min_len and (i, j, k) not in seen:
                seen.add((i, j, k))
                out.append((i, j, k))
    return out


def pairs_of(s):
    i, j, k = s
    return {(i + t, j - t) for t in range(k)}


def conflicts(s, t):
    """Overlap (shared nucleotide) or crossing (pseudoknot)."""
    ps, pt = pairs_of(s), pairs_of(t)
    ns = {x for p in ps for x in p}
    nt = {x for p in pt for x in p}
    if ns & nt:
        return True
    for a, b in ps:
        for c, d in pt:
            if a < c < b < d or c < a < d < b:
                return True
    return False


random.seed(11)
print(
    f"{'nt':>4} {'vars':>5} {'edges':>6} {'dens':>6} {'treewidth':>10} "
    f"{'exact(s)':>9} {'SA(s)':>7} {'match':>6}"
)
print("-" * 62)

for n in (30, 40, 50, 60, 80, 100, 120):
    for _ in range(300):
        seq = "".join(random.choice("AUCG") for _ in range(n))
        struct, e = RNA.fold(seq)
        if e < -0.15 * n:
            break
    stems = maximal_stems(seq)
    if len(stems) < 2:
        continue
    fcomp = RNA.fold_compound(seq)

    # linear term: stacking energy (the r=0.958 surrogate)
    lin = {}
    for idx, s in enumerate(stems):
        ps = sorted(pairs_of(s))
        E = 0.0
        for a in range(len(ps) - 1):
            i, j = ps[a]
            k, l = ps[a + 1]
            E += fcomp.eval_int_loop(i + 1, j + 1, k + 1, l + 1) / 100.0
        lin[idx] = E

    quad = {}
    G = nx.Graph()
    G.add_nodes_from(range(len(stems)))
    PEN = 20.0
    for a in range(len(stems)):
        for b in range(a + 1, len(stems)):
            if conflicts(stems[a], stems[b]):
                quad[(a, b)] = PEN
                G.add_edge(a, b)

    bqm = BinaryQuadraticModel(lin, quad, 0.0, "BINARY")
    nv, ne = len(stems), G.number_of_edges()
    dens = 2 * ne / (nv * (nv - 1)) if nv > 1 else 0
    tw, _ = nx.algorithms.approximation.treewidth_min_fill_in(G)

    t0 = time.perf_counter()
    try:
        exact = TreeDecompositionSampler().sample(bqm, num_reads=1)
        te = time.perf_counter() - t0
        ee = exact.first.energy
        estr = f"{te:9.3f}"
    except Exception as exc:
        ee, estr = None, f"  {type(exc).__name__[:7]}"

    t0 = time.perf_counter()
    sa = SimulatedAnnealingSampler().sample(bqm, num_reads=200, seed=1)
    ts = time.perf_counter() - t0
    es = sa.first.energy

    match = "-" if ee is None else ("YES" if abs(ee - es) < 1e-6 else "no")
    print(f"{n:>4} {nv:>5} {ne:>6} {dens:>6.2f} {tw:>10} {estr} {ts:>7.2f} {match:>6}")
