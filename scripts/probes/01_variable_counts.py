"""Probe: ViennaRNA sanity + candidate stem counts vs sequence length.

Answers the core feasibility question: how many binary variables does a
stem-based encoding actually produce at each sequence length, and is the
ViennaRNA MFE structure representable in that candidate set?
"""
import random
import RNA

PAIRS = {("A", "U"), ("U", "A"), ("G", "C"), ("C", "G")}
WOBBLE = {("G", "U"), ("U", "G")}


def can_pair(a, b, wobble=True):
    return (a, b) in PAIRS or (wobble and (a, b) in WOBBLE)


def maximal_stems(seq, min_len=3, min_hairpin=3, wobble=True):
    """Maximal helices: extend each (i,j) seed as far as it will go, keep maximal ones."""
    n = len(seq)
    seen = set()
    stems = []
    for i in range(n):
        for j in range(i + min_hairpin + 1, n):
            if not can_pair(seq[i], seq[j], wobble):
                continue
            # only start a stem where it cannot be extended outward
            if i > 0 and j < n - 1 and can_pair(seq[i - 1], seq[j + 1], wobble):
                continue
            k = 0
            while (i + k < j - k - min_hairpin - 1 + 1
                   and can_pair(seq[i + k], seq[j - k], wobble)):
                k += 1
            if k >= min_len:
                key = (i, j, k)
                if key not in seen:
                    seen.add(key)
                    stems.append(key)
    return stems


def all_substems(maximal, min_len=3):
    """Every contiguous sub-helix of every maximal stem (the full candidate set)."""
    out = set()
    for (i, j, k) in maximal:
        for start in range(k):
            for length in range(min_len, k - start + 1):
                out.add((i + start, j - start, length))
    return sorted(out)


def stem_pairs(s):
    i, j, k = s
    return {(i + t, j - t) for t in range(k)}


def mfe_pairs(struct):
    stack, pairs = [], set()
    for idx, c in enumerate(struct):
        if c == "(":
            stack.append(idx)
        elif c == ")":
            pairs.add((stack.pop(), idx))
    return pairs


random.seed(42)
print(f"{'len':>5} {'maxstems':>9} {'allsub':>8} {'MFE bp':>7} {'covered':>8}  structure")
print("-" * 78)
for n in (12, 16, 20, 25, 30, 40, 50, 80, 120):
    seq = "".join(random.choice("AUCG") for _ in range(n))
    struct, energy = RNA.fold(seq)
    mx = maximal_stems(seq, min_len=3)
    allsub = all_substems(mx, min_len=3)
    covered_by = set()
    for s in allsub:
        covered_by |= stem_pairs(s)
    mp = mfe_pairs(struct)
    cov = f"{len(mp & covered_by)}/{len(mp)}" if mp else "0/0"
    print(f"{n:>5} {len(mx):>9} {len(allsub):>8} {len(mp):>7} {cov:>8}  {struct[:40]} {energy:6.2f}")

print()
print("ViennaRNA sanity:")
s = "GGGAAAUCCCU"
st, e = RNA.fold(s)
print(f"  {s} -> {st}  MFE={e:.2f} kcal/mol   eval={RNA.energy_of_struct(s, st):.2f}")
fc = RNA.fold_compound(s)
fc.pf()
print(f"  centroid={fc.centroid()[0]}  ensemble ok")
