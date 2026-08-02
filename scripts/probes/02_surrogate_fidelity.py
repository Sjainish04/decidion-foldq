"""Probe 2: Is an additive stem-energy QUBO a usable surrogate for the Turner model?

We take real structures, decompose them into stems, and compare:
  (a) sum of isolated-stem energies  [what a degree-2 QUBO linear term can hold]
  (b) true ViennaRNA energy of the whole structure
The residual is the part the QUBO fundamentally cannot represent.

Also scores the actual `charge_refund` objective -- linear charge plus
`immediate_only` refunds, exactly as `foldq.encodings.energy` and the default
pipeline construct it -- against the same reference folds, broken out by the
two length ranges README RQ4 quotes.
"""

import random
import statistics as st_

import RNA

from foldq.classical.vienna import ViennaBackend
from foldq.encodings.energy import nestable_pairs, refund_pair_energy, stem_linear_energy
from foldq.schemas.structure import Stem

random.seed(7)

# Coefficients (linear charge + refunds) come from dangles=0, matching the
# pipeline's energy_backend: the charge-and-refund construction assumes an
# energy model that is exactly additive over loops, which only dangles=0
# provides. The reference fold below (RNA.fold, module defaults) stays on
# dangles=2, matching the pipeline's standard `backend`. Never use one
# backend for both -- see foldq/classical/vienna.py and foldq/pipeline.py.
energy_backend = ViennaBackend(dangles=0)


def parse_stems(struct):
    """Decompose dot-bracket into maximal contiguous stacked helices."""
    stack, pairs = [], []
    for idx, c in enumerate(struct):
        if c == "(":
            stack.append(idx)
        elif c == ")":
            pairs.append((stack.pop(), idx))
    pairs.sort()
    stems, cur = [], []
    for p in pairs:
        if cur and p[0] == cur[-1][0] + 1 and p[1] == cur[-1][1] - 1:
            cur.append(p)
        else:
            if cur:
                stems.append(cur)
            cur = [p]
    if cur:
        stems.append(cur)
    return stems


def isolated_stem_energy(seq, stem):
    """Energy of this helix alone: fold nothing else, just this stem + its hairpin."""
    n = len(seq)
    s = ["."] * n
    for i, j in stem:
        s[i], s[j] = "(", ")"
    return RNA.energy_of_struct(seq, "".join(s))


def stacking_only(seq, stem):
    """Pure stacking sum: the nearest-neighbour term for consecutive pairs in the helix."""
    fc = RNA.fold_compound(seq)
    tot = 0.0
    for a in range(len(stem) - 1):
        i, j = stem[a]
        k, length = stem[a + 1]
        tot += fc.eval_int_loop(i + 1, j + 1, k + 1, length + 1) / 100.0
    return tot


def stack_plus_hairpin(seq, stem):
    """What a real QUBO linear term holds: stacking + hairpin closure cost.

    Charged only when the helix actually closes a hairpin (nothing nested inside),
    which is the common case for the innermost helix of each arm.
    """
    fc = RNA.fold_compound(seq)
    tot = stacking_only(seq, stem)
    i, j = stem[-1]  # innermost pair
    tot += fc.eval_hp_loop(i + 1, j + 1) / 100.0
    return tot


def charge_refund_energy(backend, seq, raw_stems):
    """The actual charge_refund objective: linear charge plus immediate_only refunds.

    `raw_stems` is parse_stems' output (lists of consecutive (i, j) pairs); each
    is converted to a foldq Stem using the same grouping parse_stems already
    performed (first pair's (i, j), run length k), reusing the exact stems
    already found for the other three columns rather than re-deriving them.
    """
    stems = [Stem(i=s[0][0], j=s[0][1], k=len(s)) for s in raw_stems]
    linear = sum(stem_linear_energy(backend, seq, s) for s in stems)
    refunds = sum(
        refund_pair_energy(backend, seq, stems[outer], stems[inner])
        for outer, inner in nestable_pairs(stems, policy="immediate_only")
    )
    return linear + refunds


print(
    f"{'n':>4} {'stems':>5} {'sum_iso':>9} {'sum_stack':>10} {'vienna':>8} "
    f"{'iso_err':>8} {'stack_err':>9}"
)
print("-" * 66)

rows = []
for n in (30, 40, 50, 60, 80, 100):
    for trial in range(4):
        # rejection-sample a sequence that actually folds
        for _ in range(400):
            seq = "".join(random.choice("AUCG") for _ in range(n))
            struct, e = RNA.fold(seq)
            if e < -0.15 * n:
                break
        stems = parse_stems(struct)
        if not stems:
            continue
        iso = sum(isolated_stem_energy(seq, st) for st in stems)
        stk = sum(stacking_only(seq, st) for st in stems)
        sph = sum(stack_plus_hairpin(seq, st) for st in stems)
        cr = charge_refund_energy(energy_backend, seq, stems)
        rows.append((e, iso, stk, sph, cr, n))
        if trial == 0:
            print(
                f"{n:>4} {len(stems):>5} {iso:>9.2f} {stk:>10.2f} {e:>8.2f} "
                f"{iso - e:>8.2f} {stk - e:>9.2f}"
            )

# correlation across all samples


def corr(xs, ys):
    mx, my = st_.mean(xs), st_.mean(ys)
    num = sum((a - mx) * (b - my) for a, b in zip(xs, ys, strict=False))
    den = (sum((a - mx) ** 2 for a in xs) * sum((b - my) ** 2 for b in ys)) ** 0.5
    return num / den if den else float("nan")


vien = [r[0] for r in rows]
iso = [r[1] for r in rows]
stk = [r[2] for r in rows]
sph = [r[3] for r in rows]
print()
print(f"samples: {len(rows)}")
print(f"Pearson r  (sum isolated-stem energy)  vs ViennaRNA : {corr(iso, vien):.4f}")
print(f"Pearson r  (pure stacking sum)         vs ViennaRNA : {corr(stk, vien):.4f}")


def _mean_error(predicted, reference, absolute=False):
    deltas = [abs(a - b) if absolute else a - b for a, b in zip(predicted, reference, strict=True)]
    return st_.mean(deltas)


print(f"mean signed error iso   : {_mean_error(iso, vien):+.2f} kcal/mol")
print(f"Pearson r  (stacking + hairpin closure) vs ViennaRNA : {corr(sph, vien):.4f}")
print(f"mean signed error stack : {_mean_error(stk, vien):+.2f} kcal/mol")
print(f"mean signed error stk+hp: {_mean_error(sph, vien):+.2f} kcal/mol")
print(f"mean |err| stk+hp       : {_mean_error(sph, vien, absolute=True):.2f} kcal/mol")

cr_all = [r[4] for r in rows]
lengths = [r[5] for r in rows]


def mae(xs, ys):
    return st_.mean([abs(a - b) for a, b in zip(xs, ys, strict=False)])


print()
print("=== charge_refund objective: actual pipeline coefficients ===")
print("    (linear + immediate_only refunds, dangles=0 coefficients vs dangles=2 reference)")
print(f"{'range':<10} {'model':<14} {'r':>7} {'MAE':>8}")
print("-" * 42)
length_ranges = [("30-100 nt", lambda ln: True), ("30-60 nt", lambda ln: ln <= 60)]
models = [("stacking_only", stk), ("charge_refund", cr_all)]
for range_label, keep in length_ranges:
    idx = [k for k, ln in enumerate(lengths) if keep(ln)]
    v_sub = [vien[k] for k in idx]
    for model_label, series in models:
        s_sub = [series[k] for k in idx]
        print(
            f"{range_label:<10} {model_label:<14} {corr(s_sub, v_sub):>7.4f} "
            f"{mae(s_sub, v_sub):>8.2f}"
        )

print()
print("=== pseudoknot check: can ViennaRNA even score one? ===")
pk_seq = "GGGCGCUUCGGCGCCCAAAGGCGC"
print("  RNAfold is pseudoknot-free by construction; crossing pairs are unrepresentable")
print("  in dot-bracket, so the classical DP cannot return them at all.")
