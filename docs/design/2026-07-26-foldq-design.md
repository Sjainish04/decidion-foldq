# Decidion FoldQ — Proof-of-Concept Design

**Date:** 2026-07-26
**Status:** Approved
**Deadline:** 2026-08-07 (WISER Summer Program 2026, Moderna Challenge)
**Authors:** Jainish Solanki, Siddhartha Pahari

---

## 1. Thesis

A stem-based QUBO carrying ViennaRNA-derived Turner energies can be:

1. **Validated gate-by-gate against exact ground truth** on instances small enough
   to enumerate, separating candidate-generation error from formulation error from
   solver error; and
2. **Extended to pseudoknotted folds that ViennaRNA cannot produce at all**, by
   deleting a single penalty term.

The second point is what distinguishes this submission. Zuker's algorithm already
solves pseudoknot-free MFE folding *exactly* in O(n³), so no quantum method will
beat it there. Pseudoknot-aware folding is NP-hard (Lyngsø & Pedersen, 2000) and
is structurally outside what dot-bracket dynamic programming can represent. Moving
into that regime costs one flag in our formulation.

**We make no quantum-advantage claim.** We measure usefulness, approximation
quality, and resource scaling.

---

## 2. Evidence base

Every design decision below is grounded in measurements taken on 2026-07-26 against
ViennaRNA 2.7.2 / Qiskit 2.5.1 / Ocean 9.4.0 on macOS arm64, Python 3.11. Probe
scripts are reproduced under `scripts/probes/`.

### 2.1 Variable counts — maximal-helix encoding is the enabler

Min stem length 3, wobble pairs allowed:

| nt | maximal helices | all sub-helices | MFE bp covered |
|---|---|---|---|
| 30 | **14** | 53 | 8/8 |
| 50 | **41** | 113 | 9/9 |
| 80 | 65 | 179 | 16/22 |
| 120 | 151 | 390 | 28/30 |

Encoding *maximal* helices rather than every sub-helix is a ~4x compression and is
what brings 30-nt sequences within statevector QAOA reach.

> **Caveat carried into §12:** this table was measured at `min_stem_length=3`. The
> resolved default is 2, which admits shorter helices and therefore *raises* these
> counts. Tier boundaries in §4 are consequently enforced by **variable count, not
> nucleotide length** — the length column is indicative only. Re-measuring the
> length↔variable mapping at `min_stem_length=2` is the first task of E2.

### 2.2 Surrogate fidelity — the charge-and-refund requirement

Additive stem energies compared against true ViennaRNA energy, 24 sequences, 30–100 nt:

| Surrogate model | Pearson r vs. Turner |
|---|---|
| Sum of **stacking** energies only | **0.958** |
| Sum of **isolated-stem** energies | 0.534 |
| Stacking **+ hairpin cost charged on every stem** | **0.347** |

Two consequences:

- A plain *linear* QUBO coefficient (stacking only) already tracks Turner energy at
  r ≈ 0.96, though systematically ~10 kcal/mol too stable because it never pays loop
  entropy. The QUBO is a viable *ranking* surrogate.
- Adding loop costs naively makes it **much worse** (0.96 → 0.35). Whether a helix
  closes a hairpin depends on which *other* helices are selected — a k-body
  predicate. This forces the charge-and-refund construction in §5.

### 2.3 Exact-validation reach and problem hardness

| nt | vars | edges | density | treewidth | exact solve | SA finds optimum? |
|---|---|---|---|---|---|---|
| 30 | 15 | 86 | 0.82 | 10 | 0.003 s | **yes** |
| 40 | 22 | 179 | 0.77 | 15 | 0.056 s | **no** |
| 50 | 45 | 641 | 0.65 | 27 | fails | — |
| 120 | 252 | 15329 | 0.48 | 163 | fails | — |

- Conflict graphs are **dense** (0.5–0.8), not sparse. Tree decomposition fails
  above ~22 variables, so rigorous Gates B/C are capped near **22 vars ≈ 30–40 nt**.
- At 40 nt, simulated annealing **already missed the true ground state**. There is
  genuine optimization difficulty at sizes we can still verify exactly. This is what
  makes the solver comparison scientifically meaningful rather than a formality.

### 2.4 Benchmark landmine

Uniformly random sequences at 12–20 nt **do not fold**: MFE is exactly 0.00 with an
empty structure. A benchmark built from such sequences would have "predict nothing"
as ground truth and every solver scoring 100%. Benchmark sequences must be designed
or rejection-sampled to fold.

---

## 3. The four-gate diagnostic ladder

The spine of the project. Every run reports all four, making each result attributable
rather than anecdotal.

| Gate | Question | Method | Failure means |
|---|---|---|---|
| **A. Representable** | Is the reference structure present in the candidate set? | Set containment of reference stems | Candidate-generator fault; hard ceiling on every solver |
| **B. Faithful** | Is the reference structure the QUBO ground state? | Exact enumeration / tree decomposition | Energy-model fault |
| **C. Solved** | Did the solver find the QUBO ground state? | Compare solver best vs. exact | Optimizer fault |
| **D. Physical** | After decode + repair + rescore, what is the energy gap and base-pair F1? | ViennaRNA `eval_structure` | The number that actually matters |

Gates B and C require exact ground truth and therefore apply only to Tiers V and Q.
Tiers S and P report Gates A and D. This limitation is stated, not hidden.

---

## 4. Benchmark tiers

Boundaries derived from §2.1 and §2.3, not from nucleotide-count guesses.

| Tier | Length | Vars | Solvers | Gates |
|---|---|---|---|---|
| **V** — validate | 20–40 nt | ≤ 22 | exact, random, greedy, local search, tabu, SA | A, B, C, D |
| **Q** — quantum | 25–45 nt | ≤ 26 | + QAOA, CVaR-QAOA, shot-based, noisy | A, B, C, D |
| **S** — scale | 50–150 nt | ≤ 250 | SA, tabu, path-integral SQA | A, D + projected resources |
| **P** — pseudoknot | curated real PKs | varies | SA, QAOA on reduced instances | A, D vs. *published* structures |

Tier P ground truth comes from literature-published structures, not from ViennaRNA —
that is the point, since ViennaRNA cannot represent them.

---

## 5. Energy model — charge and refund

Three layers, each independently testable. All coefficients derive from ViennaRNA's
own Turner primitives (`fold_compound.eval_int_loop`, `eval_hp_loop`), never
reimplemented constants.

**Layer 1 — linear.** For each candidate helix *s*:

```
E_s = stacking(s) + hairpin_closure(s)
```

i.e. provisionally *assume* every helix closes a hairpin.

**Layer 2 — quadratic, nestable pairs.** Helix *t* is *nestable directly inside* *s*
when *t* lies strictly within *s*'s innermost pair, *t* does not conflict with *s*,
and no third candidate helix could sit between them within the same selection. For
each such ordered pair:

```
E_st = -hairpin_closure(s) + interior_or_multiloop(s, t)
```

where `interior_or_multiloop(s, t)` is ViennaRNA's `eval_int_loop` for the gap
between *s*'s innermost pair and *t*'s outermost pair.

The assumption from Layer 1 is refunded and replaced with the correct loop energy.
This is exactly degree-2 and therefore QUBO-representable.

**Layer 3 — quadratic hard penalties.**

```
lambda_overlap  * x_s * x_t    for helices sharing a nucleotide
lambda_crossing * x_s * x_t    for crossing (pseudoknotted) helix pairs
```

`lambda_crossing` is **toggleable**. Setting it to zero is pseudoknot mode; that
single flag is the Tier P mechanism.

**Known approximation.** When several helices nest inside one, the hairpin refund is
applied more than once. This is measured and reported rather than glossed over —
it is the substance of RQ4 (surrogate fidelity).

**Penalty calibration.** Grid search over normalized penalty scale, validated against
exact solutions on Tier V. Recorded per run: raw energy scale, penalty scale,
coefficient range, condition ratio, constraint-violation rate, solution sensitivity
to small penalty changes.

---

## 6. Architecture

### 6.1 Modules

Twelve modules under `src/foldq/`, each with a single responsibility:

| Module | Responsibility |
|---|---|
| `schemas/` | `SequenceRecord`, `Stem`, `ConflictGraph`, `QuboProblem`, `SolverResult`, `FoldCandidate`, `GateReport` — frozen pydantic models |
| `io/` | FASTA/CSV loading, curated fixtures, manifest writing |
| `biology/` | candidate pairs → maximal stems → sub-stems → conflict detection |
| `classical/` | ViennaRNA wrapper: MFE, `eval_structure`, partition function, centroid, subopt, Turner loop primitives |
| `encodings/` | pair encoding, stem encoding, charge-and-refund energy assembly |
| `qubo/` | BQM assembly, penalty calibration, Ising / `SparsePauliOp` mapping |
| `solvers/` | one `Protocol`, many implementations |
| `decoding/` | bitstring → stems → dot-bracket, structural validation, deterministic repair |
| `evaluation/` | four gates, structural + energy + runtime + resource metrics |
| `experiments/` | E1–E5 runners |
| `reporting/` | Jinja2 decision card, matplotlib figures |
| `cli.py` | typer CLI |

### 6.2 The fairness interface

```python
class FoldSolver(Protocol):
    name: str
    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult: ...
```

Every solver receives an identical `QuboProblem` and passes through an identical
decode → repair → rescore path. No solver gets private preprocessing.

### 6.3 Data flow

Single direction, no cycles:

```
SequenceRecord ─┬─> ViennaReference ──────────────┐
                └─> CandidateSet ─> ConflictGraph ─> QuboProblem
                                                     │
                                    SolverResult <───┘
                                         │
                    [FoldCandidate] <────┘   decode + repair + rescore
                                         │
                          GateReport + Metrics ─> DecisionCard
```

Every stage is a pure function of `(input, config)` producing artifacts, with a
manifest recording seeds, package versions, and checksums.

---

## 7. Solvers

| Solver | Library | Purpose |
|---|---|---|
| Exact (tree decomposition) | `dwave-samplers` `TreeDecompositionSampler` | Ground truth, ≤ ~22 vars |
| Exact (brute force) | in-house | Cross-check of the above on tiny instances |
| Random | in-house | Floor baseline |
| Greedy | in-house | Conflict-aware ranked selection |
| Local search | in-house | Hill climbing over add/remove/swap moves |
| Tabu | `dwave-samplers` `TabuSampler` | Strong classical baseline |
| Simulated annealing | `dwave-samplers` `SimulatedAnnealingSampler` | Primary quantum-inspired method |
| Path-integral SQA | `dwave-samplers` `PathIntegralAnnealingSampler` | Simulated *quantum* annealing with tunneling dynamics |
| QAOA | Qiskit + Aer | Gate-based, p = 1,2,3 |
| CVaR-QAOA | Qiskit + Aer | Low-energy-tail objective |

Warm-start QAOA initialised from the greedy solution.

---

## 8. Execution environment — free, local, account-free

| Need | Tool | Notes |
|---|---|---|
| Noiseless QAOA | `qiskit-aer` statevector | 16 GB RAM → ~26–28 qubits; targets are 14–26 |
| Larger circuits | Aer `matrix_product_state` | Past 30 qubits for low-entanglement QAOA |
| Shot noise | Aer sampling | Any shot count |
| Hardware-realistic noise | `qiskit_ibm_runtime.fake_provider` | 60 local backends with real IBM calibration data (T1/T2, gate + readout error, coupling maps). No account, no queue, offline |
| Quantum-inspired | `dwave-samplers` | SA, path-integral SQA, tabu, steepest descent |
| Exact ground truth | `TreeDecompositionSampler` | ≤ ~22 vars |

No paid service and no account is required for any deliverable. The backend sits
behind an interface so IBM Open Plan (10 min QPU/month) or D-Wave Leap could drop in
later, but nothing depends on them.

**Verified installable on macOS arm64 / Python 3.11:** ViennaRNA 2.7.2, Qiskit 2.5.1,
qiskit-aer 0.17.2, dwave-ocean-sdk 9.4.0, dimod 0.12.22, numpy 2.4.6, scipy 1.17.1.

---

## 9. Benchmark data

**Synthetic generator** — planted motifs (hairpins, multiloops, nested stems) plus
rejection sampling on MFE magnitude, giving independent control over length, GC
content, stem count, conflict density, and ground-state degeneracy. Required for
clean scaling studies. Seeded and reproducible.

**Curated real sequences** — a small vendored fixture set with published structures:
tRNA-Phe, 5S rRNA fragments, and known pseudoknots (SRV-1 frameshifter, HDV ribozyme)
from PseudoBase/Rfam. Vendored at fixed revision, not fetched at runtime, so offline
reproduction and CI both work.

Only public, synthetic, or randomly generated sequences are used. No confidential
Moderna data, clinical information, proprietary sequences, or PII.

---

## 10. Experiments

Cut from ten to five; scaling analysis is folded into E2/E3 rather than standing alone.

| ID | Experiment | Tier | Answers |
|---|---|---|---|
| **E1** | Formulation validation — Gates A & B under penalty sweeps | V | RQ1, RQ4 |
| **E2** | Encoding comparison — pair vs. stem, maximal vs. sub-stems; variable and density scaling | V, S | RQ2, RQ5 |
| **E3** | Solver comparison — all solvers on identical QUBOs, Gates C & D | V, Q, S | RQ3 |
| **E4** | QAOA study — depth p=1,2,3, CVaR alpha sweep, shot counts, `fake_provider` noise | Q | RQ5, RQ6 |
| **E5** | Pseudoknot reach — crossing penalty disabled, versus published structures | P | RQ7 |

---

## 11. Testing

| Suite | Covers |
|---|---|
| `tests/unit` | sequence validation, pair compatibility, stem extraction, conflict detection, dot-bracket conversion, QUBO coefficients, Ising mapping, decoding, repair, metrics |
| `tests/property` (Hypothesis) | dot-bracket length invariance, bracket balance, no nucleotide paired twice, stem→pair round-trip, constraint violations always raise objective, seed determinism |
| `tests/scientific` | golden fixtures — exact enumeration matches stored solutions, ViennaRNA energies within tolerance, QUBO and Ising agree after offset |
| `tests/integration` | full pipeline sequence → report |

Coverage target: ≥90% on deterministic core (`biology`, `encodings`, `qubo`,
`decoding`, `evaluation`), ≥80% overall.

---

## 12. Scope

### In

Twelve modules, five experiments, four test suites, decision cards, figures,
rewritten README, presentation outline, one CI workflow, reproducible manifests.

### Deferred — documented explicitly in the README, not silently dropped

`manuscript.tex` and supplementary; MkDocs site; Docker; four of five CI workflows;
all seven notebooks (scripts instead — notebooks are a reproducibility liability
under a deadline); D-Wave and IBM hardware execution; Optuna (grid search instead);
forgi, forna, Plotly, Quarto; hierarchical encoding; graph-decomposition experiment.

### Resolved sub-decisions

- **Minimum stem length defaults to 2**, not 3. At 3, real MFE structures containing
  isolated base pairs become unrepresentable (measured: 3/4 bp coverage on a 25-nt
  case). Exposed as a flag; Gate A reports the ceiling honestly. ViennaRNA `noLP`
  mode available as a consistency option.
- **Pseudoknots are promoted** from README "out of scope" to headline result. The
  README's scope section requires rewriting accordingly.
- **Notebooks cut to zero** during development. One `demo.ipynb`, generated from
  working scripts at the very end, is acceptable for the presentation.

---

## 13. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Charge-and-refund double-refund error is large | Medium | Measured in E1; fall back to stacking-only (r=0.958) if the correction hurts |
| Dense conflict graphs make QAOA circuits deep | High | Expected and *reported* — it is a headline resource finding, not a failure |
| Tier P has no exact ground truth | Certain | Validate against published structures; state the limitation |
| Curated PK fixtures have licensing constraints | Low | Use only sequences with clear public redistribution terms; record provenance in the data manifest |
| 12-day timeline slips | Medium | Tier V/Q + E1/E3 are the minimum viable submission; E4/E5 are the upside |

---

## 14. Deliverables

1. Working `foldq` CLI covering the full pipeline
2. `results/` with metrics, figures, decision cards, and manifests
3. README rewritten to describe what exists, with deferred items marked
4. Presentation outline covering methodology, findings, limitations, future work
5. Tagged release with lockfile and result checksums

---

## References

- Lorenz et al., *ViennaRNA Package 2.0*, Algorithms Mol Biol 6:26, 2011
- Lyngsø & Pedersen, *RNA pseudoknot prediction in energy-based models*, 2000
- Zaborniak et al., *A QUBO Model of the RNA Folding Problem*, arXiv:2208.04367
- Alevras et al., *mRNA Secondary Structure Prediction Using Utility-Scale Quantum Computers*, arXiv:2405.20328
- Kumar et al., *Towards Secondary Structure Prediction of Longer mRNA Sequences*, arXiv:2505.05782
