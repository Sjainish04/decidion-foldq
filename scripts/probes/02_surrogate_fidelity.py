"""Probe 2: Is an additive stem-energy QUBO a usable surrogate for the Turner model?

We take real structures, decompose them into stems, and compare:
  (a) sum of isolated-stem energies  [what a degree-2 QUBO linear term can hold]
  (b) true ViennaRNA energy of the whole structure
The residual is the part the QUBO fundamentally cannot represent.
"""
import random
import RNA

random.seed(7)


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
    for (i, j) in stem:
        s[i], s[j] = "(", ")"
    return RNA.energy_of_struct(seq, "".join(s))


def stacking_only(seq, stem):
    """Pure stacking sum: the nearest-neighbour term for consecutive pairs in the helix."""
    fc = RNA.fold_compound(seq)
    tot = 0.0
    for a in range(len(stem) - 1):
        i, j = stem[a]
        k, l = stem[a + 1]
        tot += fc.eval_int_loop(i + 1, j + 1, k + 1, l + 1) / 100.0
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


print(f"{'n':>4} {'stems':>5} {'sum_iso':>9} {'sum_stack':>10} {'vienna':>8} "
      f"{'iso_err':>8} {'stack_err':>9}")
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
        rows.append((e, iso, stk, sph))
        if trial == 0:
            print(f"{n:>4} {len(stems):>5} {iso:>9.2f} {stk:>10.2f} {e:>8.2f} "
                  f"{iso - e:>8.2f} {stk - e:>9.2f}")

# correlation across all samples
import statistics as st_


def corr(xs, ys):
    mx, my = st_.mean(xs), st_.mean(ys)
    num = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
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
print(f"mean signed error iso   : {st_.mean([a - b for a, b in zip(iso, vien)]):+.2f} kcal/mol")
print(f"Pearson r  (stacking + hairpin closure) vs ViennaRNA : {corr(sph, vien):.4f}")
print(f"mean signed error stack : {st_.mean([a - b for a, b in zip(stk, vien)]):+.2f} kcal/mol")
print(f"mean signed error stk+hp: {st_.mean([a - b for a, b in zip(sph, vien)]):+.2f} kcal/mol")
print(f"mean |err| stk+hp       : {st_.mean([abs(a - b) for a, b in zip(sph, vien)]):.2f} kcal/mol")

print()
print("=== pseudoknot check: can ViennaRNA even score one? ===")
pk_seq = "GGGCGCUUCGGCGCCCAAAGGCGC"
print("  RNAfold is pseudoknot-free by construction; crossing pairs are unrepresentable")
print("  in dot-bracket, so the classical DP cannot return them at all.")
