# Decidion FoldQ — Presentation Outline

**WISER Summer Program 2026 · Moderna Challenge**
Siddhartha Pahari · Jainish Solanki

Target length: **8–10 minutes**. Every number below is measured and reproducible
from `results/full/` at the commit tagged in `results/full/manifest.json`. Slide
notes are in `speaker-notes.md`.

---

## Slide 1 — Title

**Decidion FoldQ**
Explainable hybrid quantum–classical optimization for mRNA secondary-structure prediction

Siddhartha Pahari · siddhartha.pahari@mail.utoronto.ca
Jainish Solanki · jainish.solanki@mail.utoronto.ca

`github.com/Sjainish04/decidion-foldq`

---

## Slide 2 — The uncomfortable truth we started from

ViennaRNA already solves pseudoknot-free MFE folding **exactly**, in O(n³), by
dynamic programming. It is not a heuristic. A 100-nt sequence folds in milliseconds.

**So no quantum method will beat it at the problem as stated.**

Being *not wrong* about that is not the same as having a point. Three framings are
defensible, and we pursued the first two:

1. **Pseudoknots** — NP-hard, and dot-bracket DP structurally cannot represent them
2. **Known-ground-truth benchmark instances** — DP gives the exact answer, so we can
   measure optimizer quality against truth
3. Rigorous negative results are results

> This slide sets up why the contribution is a *method for being honest*, not a speed claim.

---

## Slide 3 — The contribution: a four-gate diagnostic ladder

Most quantum-optimization work reports "we ran the algorithm, here is the energy."
That cannot distinguish four completely different failure modes.

| Gate | Question | If it fails |
|---|---|---|
| **A** Representable | Is the reference structure in the candidate set? | candidate generation — hard ceiling |
| **B** Faithful | Is it the QUBO's ground state? | energy model misspecified |
| **C** Solved | Did this solver reach the ground state? | optimizer |
| **D** Physical | Energy gap and base-pair F1 after decode/repair/rescore | the number that matters |

`attribution` names the **earliest** failing gate — later gates cannot be blamed for
an earlier failure.

---

## Slide 4 — The formulation

Candidate helices → conflict graph → QUBO → solver → decode → repair → rescore.

Two conflict classes, both naturally **pairwise**, which is exactly what a QUBO holds:
- **overlap** — two helices claim the same nucleotide
- **crossing** — two helices form a pseudoknot *(toggleable — this matters later)*

**Energy: charge-and-refund.** A QUBO has only 1- and 2-body terms, but "does this
helix close a hairpin?" depends on which *other* helices are selected — a k-body
predicate. So: charge hairpin closure in the linear term, **refund it** in the
quadratic term when a helix nests inside.

All coefficients come from ViennaRNA's own Turner primitives, never reimplemented
constants.

---

## Slide 5 — Does the formulation actually work?

| measurement | result |
|---|---|
| Gate A — representable | 19/19 = **100%** |
| Gate B — MFE is the QUBO ground state | 17/19 = **89%** |
| Gate D — mean base-pair F1 | **0.977** |
| Gate D — mean energy gap | **+0.02 kcal/mol** |
| Surrogate fidelity vs Turner energy | **r = 0.9935** (MAE 1.24 kcal/mol, 30–100 nt) |

**Charge-and-refund vs stacking-only:** Gate B **89.5% vs 50.9%**. The construction
is justified by measurement, not assertion.

Attribution across those 19: 17 no failure, 2 energy model, 0 candidate generation.

---

## Slide 6 — The encoding trade-off (RQ2)

At **matched representability**, stem encoding wins:

| encoding | mean variables | Gate A |
|---|---|---|
| pair | 858.4 | 100% |
| **stem (maximal, msl=1)** | **551.4** | **100%** |

36% fewer variables for identical capability.

**And the representability ceiling has a single cause — lone base pairs:**

| min_stem_length | Gate A | mean variables |
|---|---|---|
| 1 | **100%** | 551.4 |
| 2 | 75% | 195.1 |
| 3 | 40% | 72.7 |

Every instance failing at `msl=2` is rescued at `msl=1` — a **100% rescue rate** at
2.83× the variables. Perfect representability is achievable and costs ~3× the qubits.

---

## Slide 7 — The honest negative result

**QAOA underperforms classical heuristics on these instances.**

| reps | circuit depth | 2-qubit gates | reaches ground state |
|---|---|---|---|
| 1 | 69 | 124 | **29.6%** |
| 2 | 123 | 247 | **40.7%** |
| 3 | 177 | 371 | **44.4%** |

Against classical: **100%** for tabu, local search, SQA and simulated annealing.
CVaR does not beat the expectation objective (0.456 vs 0.486 F1).

**Simulated annealing reaches the optimum 100% of the time in 0.19 s** — 55× faster
than tabu for comparable quality.

> This is the slide that makes the no-quantum-advantage position *evidence-based*
> rather than a disclaimer. Do not soften it.

---

## Slide 8 — Where quantum-style formulation *does* buy something

Disabling the crossing penalty — **one term** — reaches structures classical DP
cannot represent at all.

| | ViennaRNA | FoldQ strict | **FoldQ pseudoknot mode** |
|---|---|---|---|
| 28-nt pseudoknot | F1 0.667 | 0.667 | **1.000** |
| 33-nt pseudoknot | **F1 0.000** | 0.667 | **1.000** |

ViennaRNA recovers at most half the base pairs because single-bracket notation
**cannot express a crossing**. On the 33-nt fixture under the default model it
shares *zero* pairs with the reference.

Our strict mode reproduces ViennaRNA exactly under the model it encodes —
independent confirmation the formulation is faithful, not merely different.

**Caveat stated plainly:** these two pseudoknots are *constructed*, not
literature-derived. The mechanism is proven; cited sequences are the next step.

---

## Slide 9 — Limitations we measured rather than assumed

- **Dangling ends are unrepresentable.** A stem-indexed QUBO cannot hold them at any
  penalty setting — measured 1.20 kcal/mol. We extract coefficients at `dangles=0`
  and score against the standard `dangles=2`.
- **Real structures are harder.** tRNA-Phe (76 nt, 229 variables) scores **F1 0.326**.
- **Exact verification caps near 22 variables** — Gates B and C are indeterminate above it.
- **The penalty bound is not provably sufficient** — valid at every brute-forceable
  size, unproven above. Under a different nesting policy it demonstrably failed.
- **No quantum-advantage claim** is made anywhere.

---

## Slide 10 — Reproducibility

- `make reproduce` regenerates every table — **2h47m**, with a manifest pinning
  commit, Python version, platform and seed
- **267 tests**; `ruff` and `mypy` clean
- Runs entirely on **free local simulators** — no account, no queue, no cost
- Hardware-realistic noise from local IBM calibration data

**Every number in the README traces to committed CSV output.** Several early claims
were retracted when they did not — including one of our own that turned out to be an
artifact of a stochastic sampler we had mistaken for an exact solver.

---

## Slide 11 — Future work

- Substitute cited literature pseudoknots for the constructed fixtures
- Multi-body loop terms via quadratization or auxiliary variables
- Graph decomposition for longer sequences
- Ensemble prediction — top-k structures with sampling frequencies
- Constrained co-design (codon optimization + structure), where DP breaks down

---

## Slide 12 — Closing

**What we built:** a formulation that recovers ViennaRNA's optimum 89% of the time,
correlates at r = 0.9935, and reaches pseudoknots DP cannot express.

**What we found:** QAOA does not beat classical heuristics here, and we can say
exactly why — because every result is attributed to a specific stage.

**What makes it useful:** the diagnostic ladder. It turns "the algorithm scored 0.7"
into "candidate generation excluded the answer" or "the optimizer missed it."

`github.com/Sjainish04/decidion-foldq`
